#!/usr/bin/env python3
"""Samples faces from a clip and emits smoothed horizontal focus points as JSON."""

import argparse
import json
import math
import sys


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--start", type=float, required=True)
    parser.add_argument("--duration", type=float, required=True)
    parser.add_argument("--samples", type=int, default=20)
    return parser.parse_args()


def main():
    args = parse_args()
    try:
        import cv2
    except ImportError as error:
        raise RuntimeError("opencv-python-headless não está instalado") from error

    capture = cv2.VideoCapture(args.video)
    if not capture.isOpened():
        raise RuntimeError("não foi possível abrir o vídeo para detectar rostos")
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    count = max(3, min(30, args.samples))
    duration = max(0.5, args.duration)
    times = [duration * index / max(1, count - 1) for index in range(count)]
    points = []
    previous = 0.5

    for relative_time in times:
        capture.set(cv2.CAP_PROP_POS_MSEC, (args.start + relative_time) * 1000.0)
        ok, frame = capture.read()
        if not ok or frame is None:
            continue
        height, width = frame.shape[:2]
        if width < 2 or height < 2:
            continue
        scale = min(1.0, 640.0 / width)
        resized = cv2.resize(frame, None, fx=scale, fy=scale) if scale < 1.0 else frame
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)
        faces = cascade.detectMultiScale(gray, scaleFactor=1.12, minNeighbors=5, minSize=(38, 38))
        if len(faces):
            resized_width = resized.shape[1]
            candidates = []
            for x, _y, face_width, face_height in faces:
                center = (x + face_width / 2.0) / resized_width
                area = face_width * face_height
                continuity = 1.0 - min(1.0, abs(center - previous))
                candidates.append((area * (0.72 + continuity * 0.28), center))
            _score, detected = max(candidates, key=lambda item: item[0])
            previous = previous * 0.35 + detected * 0.65
        points.append({"t": round(relative_time, 2), "x": round(previous, 4)})

    capture.release()
    if not points:
        points = [{"t": 0, "x": 0.5}]
    # Remove almost-identical intermediate points to keep the FFmpeg expression short.
    compact = [points[0]]
    for point in points[1:-1]:
        if math.fabs(point["x"] - compact[-1]["x"]) >= 0.018:
            compact.append(point)
    if len(points) > 1:
        compact.append(points[-1])
    print(json.dumps({"samples": compact}, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
