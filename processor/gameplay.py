#!/usr/bin/env python3
"""CPU-friendly visual-interest tracker for vertical gameplay crops.

The tracker intentionally uses motion, frame change, composition and persistence
instead of treating a detected face as the default subject. It samples the
source, detects hard scene changes and emits a compact, smoothed timeline for
FFmpeg. In timeline mode it also emits visual-interest windows that can be used
to select strong gameplay moments even when there is no speech.
"""

import argparse
import json
import math
import sys


GAMEPLAY_MODES = {
    "gameplay",
    "vehicle",
    "action",
    "exploration",
    "character_gameplay",
    "smart_zoom",
    "hud_safe",
    "cinematic_gameplay",
    "facecam_gameplay",
}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--start", type=float, default=0.0)
    parser.add_argument("--duration", type=float, required=True)
    parser.add_argument("--mode", choices=sorted(GAMEPLAY_MODES), default="gameplay")
    parser.add_argument("--safe-area", choices=["shorts", "reels", "tiktok"], default="shorts")
    parser.add_argument("--captions", action="store_true")
    parser.add_argument("--timeline", action="store_true")
    parser.add_argument("--max-samples", type=int, default=900)
    return parser.parse_args()


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def percentile_scale(values, value):
    if not values:
        return 0.0
    ordered = sorted(values)
    low = ordered[max(0, int(len(ordered) * 0.15) - 1)]
    high = ordered[min(len(ordered) - 1, int(len(ordered) * 0.92))]
    if high <= low + 1e-9:
        return 0.0
    return clamp((value - low) / (high - low), 0.0, 1.0)


def mode_settings(mode):
    return {
        "gameplay": (0.035, 0.30, 0.16),
        "vehicle": (0.030, 0.34, 0.20),
        "action": (0.045, 0.40, 0.24),
        "exploration": (0.060, 0.16, 0.07),
        "character_gameplay": (0.040, 0.28, 0.12),
        "smart_zoom": (0.035, 0.34, 0.18),
        "hud_safe": (0.055, 0.20, 0.10),
        "cinematic_gameplay": (0.080, 0.12, 0.045),
        "facecam_gameplay": (0.045, 0.24, 0.11),
    }[mode]


def weighted_center(weight, fallback, np):
    total = float(weight.sum())
    if total <= 1e-6:
        return fallback, 0.0
    width = weight.shape[1]
    coordinates = np.linspace(0.0, 1.0, width, dtype=np.float32)
    column_weight = weight.sum(axis=0)
    center = float((column_weight * coordinates).sum() / max(1e-6, column_weight.sum()))
    concentration = float(column_weight.max() / max(1e-6, column_weight.mean() * 4.0))
    return clamp(center, 0.04, 0.96), clamp(concentration, 0.0, 1.0)


def vehicle_candidate(mask, np, cv2):
    kernel = np.ones((5, 9), dtype=np.uint8)
    merged = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    contours, _hierarchy = cv2.findContours(merged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    height, width = mask.shape
    best = None
    for contour in contours:
        x, y, box_width, box_height = cv2.boundingRect(contour)
        area = box_width * box_height
        if area < width * height * 0.007 or box_width < 12 or box_height < 8:
            continue
        aspect = box_width / max(1.0, box_height)
        lower_bias = 0.7 + 0.6 * ((y + box_height / 2.0) / height)
        shape_bias = 1.25 if 1.15 <= aspect <= 4.8 else 0.72
        score = area * lower_bias * shape_bias
        if best is None or score > best[0]:
            best = (score, (x + box_width / 2.0) / width)
    return None if best is None else best[1]


def facecam_candidate(frame, cascade, np, cv2):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, scaleFactor=1.12, minNeighbors=5, minSize=(24, 24))
    height, width = gray.shape
    candidates = []
    for x, y, face_width, face_height in faces:
        center_x = (x + face_width / 2.0) / width
        center_y = (y + face_height / 2.0) / height
        area_ratio = (face_width * face_height) / max(1.0, width * height)
        in_corner = (center_x < 0.34 or center_x > 0.66) and (center_y < 0.45 or center_y > 0.55)
        if in_corner and 0.0015 <= area_ratio <= 0.12:
            pad_x, pad_y = face_width * 1.5, face_height * 1.35
            left = clamp((x + face_width / 2.0 - pad_x) / width, 0.0, 0.94)
            top = clamp((y + face_height / 2.0 - pad_y) / height, 0.0, 0.94)
            box_width = clamp((pad_x * 2.0) / width, 0.06, 1.0 - left)
            box_height = clamp((pad_y * 2.0) / height, 0.06, 1.0 - top)
            candidates.append((area_ratio, left, top, box_width, box_height))
    return max(candidates, default=None, key=lambda item: item[0])


def compact_samples(samples, maximum=30):
    if len(samples) <= maximum:
        return samples
    mandatory = {0, len(samples) - 1}
    mandatory.update(index for index, item in enumerate(samples) if item.get("sceneCut"))
    stride = max(1, math.ceil(len(samples) / maximum))
    mandatory.update(range(0, len(samples), stride))
    selected = sorted(mandatory)
    if len(selected) > maximum:
        scene_indexes = [index for index in selected if samples[index].get("sceneCut")]
        remaining = [index for index in selected if index not in scene_indexes]
        room = max(0, maximum - len(scene_indexes))
        if room and remaining:
            step = max(1, math.ceil(len(remaining) / room))
            remaining = remaining[::step][:room]
        selected = sorted(set(scene_indexes + remaining))[:maximum]
    return [samples[index] for index in selected]


def build_events(records, duration):
    if not records:
        return []
    motion_values = [item["motionRaw"] for item in records]
    change_values = [item["changeRaw"] for item in records]
    detail_values = [item["detailRaw"] for item in records]
    window = clamp(duration / 100.0, 6.0, 18.0)
    buckets = {}
    for item in records:
        bucket = int(item["t"] / window)
        buckets.setdefault(bucket, []).append(item)
    events = []
    for bucket, items in buckets.items():
        start = bucket * window
        end = min(duration, (bucket + 1) * window)
        motion = sum(percentile_scale(motion_values, item["motionRaw"]) for item in items) / len(items)
        change = sum(percentile_scale(change_values, item["changeRaw"]) for item in items) / len(items)
        detail = sum(percentile_scale(detail_values, item["detailRaw"]) for item in items) / len(items)
        cuts = sum(1 for item in items if item["sceneCut"])
        confidence = sum(item["confidence"] for item in items) / len(items)
        interest = clamp(0.43 * motion + 0.34 * change + 0.15 * detail + 0.08 * confidence + min(0.18, cuts * 0.09), 0.0, 1.0)
        events.append({
            "start": round(start, 2),
            "end": round(end, 2),
            "score": int(round(interest * 100)),
            "motion": int(round(motion * 100)),
            "change": int(round(change * 100)),
            "sceneCuts": cuts,
            "focusX": round(sum(item["x"] for item in items) / len(items), 4),
        })
    # Keep the prompt compact while always retaining hard scene changes.
    required = [item for item in events if item["sceneCuts"]]
    ranked = sorted(events, key=lambda item: item["score"], reverse=True)
    chosen = {item["start"]: item for item in required}
    for item in ranked:
        chosen.setdefault(item["start"], item)
        if len(chosen) >= 100:
            break
    return sorted(chosen.values(), key=lambda item: item["start"])


def main():
    args = parse_args()
    try:
        import cv2
        import numpy as np
    except ImportError as error:
        raise RuntimeError("opencv-python-headless não está instalado") from error

    capture = cv2.VideoCapture(args.video)
    if not capture.isOpened():
        raise RuntimeError("não foi possível abrir o vídeo para analisar o gameplay")

    duration = max(0.5, args.duration)
    frame_rate = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
    maximum_samples = clamp(args.max_samples, 12, 1200)
    if args.timeline:
        count = int(min(maximum_samples, max(12, math.ceil(duration / 2.0))))
    else:
        count = int(min(maximum_samples, max(12, math.ceil(duration * 1.5))))
    times = [duration * index / max(1, count - 1) for index in range(count)]
    dead_zone, smoothing, max_speed = mode_settings(args.mode)
    safe_shift = {"shorts": 0.01, "reels": 0.02, "tiktok": 0.04}[args.safe_area]
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

    previous_gray = None
    previous_hist = None
    previous_color_hist = None
    previous_x = 0.5
    previous_time = 0.0
    samples = []
    records = []
    facecam_boxes = []

    for index, relative_time in enumerate(times):
        absolute_time = args.start + relative_time
        if math.isfinite(frame_rate) and frame_rate > 0.1:
            capture.set(cv2.CAP_PROP_POS_FRAMES, max(0, round(absolute_time * frame_rate)))
        else:
            capture.set(cv2.CAP_PROP_POS_MSEC, absolute_time * 1000.0)
        ok, frame = capture.read()
        if not ok or frame is None:
            continue
        original_height, original_width = frame.shape[:2]
        if original_width < 2 or original_height < 2:
            continue
        scale = min(1.0, 360.0 / original_width)
        small = cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA) if scale < 1.0 else frame
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)
        height, width = gray.shape
        edges = cv2.Canny(gray, 55, 145).astype(np.float32) / 255.0
        histogram = cv2.calcHist([gray], [0], None, [32], [0, 256])
        cv2.normalize(histogram, histogram)
        hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
        color_histogram = cv2.calcHist([hsv], [0, 1], None, [16, 8], [0, 180, 0, 256])
        cv2.normalize(color_histogram, color_histogram)

        scene_distance = 0.0
        change_raw = 0.0
        motion = np.zeros_like(gray, dtype=np.float32)
        binary_motion = np.zeros_like(gray, dtype=np.uint8)
        if previous_gray is not None and previous_gray.shape == gray.shape:
            difference = cv2.absdiff(gray, previous_gray)
            change_raw = float(difference.mean() / 255.0)
            motion = difference.astype(np.float32) / 255.0
            _threshold, binary_motion = cv2.threshold(difference, 22, 255, cv2.THRESH_BINARY)
            if not args.timeline and index % 2 == 0:
                flow = cv2.calcOpticalFlowFarneback(previous_gray, gray, None, 0.5, 2, 13, 2, 5, 1.1, 0)
                magnitude, _angle = cv2.cartToPolar(flow[..., 0], flow[..., 1])
                magnitude = np.clip(magnitude / 8.0, 0.0, 1.0)
                motion = np.maximum(motion, magnitude.astype(np.float32))
            if previous_hist is not None:
                scene_distance = float(cv2.compareHist(previous_hist, histogram, cv2.HISTCMP_BHATTACHARYYA))
            if previous_color_hist is not None:
                scene_distance = max(
                    scene_distance,
                    float(
                        cv2.compareHist(
                            previous_color_hist,
                            color_histogram,
                            cv2.HISTCMP_BHATTACHARYYA,
                        )
                    ),
                )
        scene_cut = scene_distance > 0.48 or (scene_distance > 0.32 and change_raw > 0.20)
        if scene_cut:
            motion *= 0.18

        vertical = np.linspace(0.0, 1.0, height, dtype=np.float32)[:, None]
        horizontal = np.linspace(0.0, 1.0, width, dtype=np.float32)[None, :]
        center_prior = np.exp(-((horizontal - 0.5) ** 2) / 0.18).astype(np.float32)
        lower_prior = (0.72 + vertical * 0.65).astype(np.float32)
        composition = edges * 0.65 + center_prior * 0.12

        if args.mode == "action":
            weight = motion * 0.78 + edges * motion * 0.35 + composition * 0.08
        elif args.mode == "vehicle":
            weight = motion * lower_prior * 0.72 + composition * 0.12
        elif args.mode == "exploration":
            weight = edges * 0.52 + center_prior * 0.22 + motion * 0.16
        elif args.mode == "character_gameplay":
            character_prior = lower_prior * np.exp(-((horizontal - 0.5) ** 2) / 0.26)
            weight = motion * character_prior * 0.62 + edges * 0.18 + center_prior * 0.12
        elif args.mode == "cinematic_gameplay":
            weight = edges * 0.38 + center_prior * 0.30 + motion * 0.13
        else:
            weight = motion * 0.62 + edges * motion * 0.22 + composition * 0.14

        weight[: max(1, int(height * 0.06)), :] *= 0.45
        if args.captions:
            weight[int(height * 0.76) :, :] *= 0.42
        target_x, confidence = weighted_center(weight, 0.5, np)

        if args.mode == "vehicle":
            vehicle_x = vehicle_candidate(binary_motion, np, cv2)
            if vehicle_x is not None:
                target_x = target_x * 0.28 + vehicle_x * 0.72
                confidence = max(confidence, 0.62)

        if args.mode == "facecam_gameplay" and index % 3 == 0:
            box = facecam_candidate(small, cascade, np, cv2)
            if box is not None:
                facecam_boxes.append(box)

        motion_raw = float(motion.mean())
        detail_raw = float(edges.mean())
        if confidence < 0.08 or (motion_raw < 0.0025 and args.mode not in {"exploration", "cinematic_gameplay"}):
            target_x = 0.5
        target_x = clamp(target_x + safe_shift, 0.08, 0.92)

        delta_time = max(0.05, relative_time - previous_time)
        delta = target_x - previous_x
        if abs(delta) <= dead_zone and not scene_cut:
            smoothed = previous_x
        else:
            alpha = min(0.76, smoothing * (1.65 if scene_cut else 1.0))
            desired = previous_x + delta * alpha
            speed = max_speed * delta_time * (1.8 if scene_cut else 1.0)
            smoothed = previous_x + clamp(desired - previous_x, -speed, speed)
        previous_x = clamp(smoothed, 0.08, 0.92)
        previous_time = relative_time

        normalized_activity = clamp(motion_raw * 5.5 + change_raw * 2.8 + (0.28 if scene_cut else 0.0), 0.0, 1.0)
        zoom = 1.0
        if args.mode == "smart_zoom":
            zoom = 1.0 + 0.14 * normalized_activity
        elif args.mode == "action":
            zoom = 1.0 + 0.045 * normalized_activity

        sample = {
            "t": round(relative_time, 2),
            "x": round(previous_x, 4),
            "zoom": round(zoom, 4),
            "confidence": round(confidence, 3),
        }
        if scene_cut:
            sample["sceneCut"] = True
        samples.append(sample)
        records.append({
            **sample,
            "motionRaw": motion_raw,
            "changeRaw": change_raw + scene_distance * 0.3,
            "detailRaw": detail_raw,
            "sceneCut": scene_cut,
        })
        previous_gray = gray
        previous_hist = histogram
        previous_color_hist = color_histogram

    capture.release()
    if not samples:
        samples = [{"t": 0.0, "x": 0.5, "zoom": 1.0, "confidence": 0.0}]

    facecam = None
    if len(facecam_boxes) >= max(2, int(len(samples) * 0.08)):
        facecam_array = np.array([box[1:] for box in facecam_boxes], dtype=np.float32)
        median = np.median(facecam_array, axis=0)
        facecam = {
            "x": round(float(median[0]), 4),
            "y": round(float(median[1]), 4),
            "width": round(float(median[2]), 4),
            "height": round(float(median[3]), 4),
            "confidence": round(clamp(len(facecam_boxes) / max(1, len(samples)), 0.0, 1.0), 3),
        }

    payload = {
        "version": 1,
        "mode": args.mode,
        "samples": compact_samples(samples),
        "events": build_events(records, duration) if args.timeline else [],
        "facecam": facecam,
    }
    print(json.dumps(payload, separators=(",", ":"), ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
