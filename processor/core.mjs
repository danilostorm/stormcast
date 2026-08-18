export const clipSelectionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    clips: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 3, maxLength: 90 },
          hook: { type: "string", minLength: 3, maxLength: 180 },
          caption: { type: "string", minLength: 3, maxLength: 360 },
          start_seconds: { type: "number", minimum: 0 },
          end_seconds: { type: "number", minimum: 1 },
          score: { type: "integer", minimum: 1, maximum: 100 },
          reason: { type: "string", minLength: 3, maxLength: 240 },
        },
        required: ["title", "hook", "caption", "start_seconds", "end_seconds", "score", "reason"],
      },
    },
  },
  required: ["clips"],
};

export function cleanText(value, fallback = "", maximum = 500) {
  if (typeof value !== "string") return fallback;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || fallback).slice(0, maximum);
}

export function normalizeYouTubeUrl(input) {
  let url;
  try {
    url = new URL(String(input || "").trim());
  } catch {
    throw new Error("Link do YouTube inválido.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Link do YouTube inválido.");
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  let videoId = "";
  if (host === "youtu.be") videoId = parts[0] || "";
  if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
    videoId = url.searchParams.get("v") || (["shorts", "live", "embed"].includes(parts[0]) ? parts[1] : "") || "";
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error("Link do YouTube inválido.");
  return { videoId, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}` };
}

export function formatSrtTime(seconds) {
  const totalMilliseconds = Math.max(0, Math.round(Number(seconds) * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

function captionLines(text, maximum = 42) {
  const words = cleanText(text, "", 500).split(" ").filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maximum && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2).join("\n");
}

export function buildSrt(segments, clipStart, clipEnd) {
  const relevant = segments
    .filter((segment) => Number(segment.end) > clipStart && Number(segment.start) < clipEnd)
    .map((segment) => ({
      start: Math.max(0, Number(segment.start) - clipStart),
      end: Math.min(clipEnd, Number(segment.end)) - clipStart,
      text: captionLines(segment.text),
    }))
    .filter((segment) => segment.end > segment.start && segment.text);

  return relevant.map((segment, index) => (
    `${index + 1}\n${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}\n${segment.text}\n`
  )).join("\n");
}

export function transcriptForAnalysis(segments) {
  return segments.map((segment) => {
    const start = Math.max(0, Number(segment.start) || 0);
    const end = Math.max(start, Number(segment.end) || start);
    return `[${start.toFixed(2)}-${end.toFixed(2)}] ${cleanText(segment.text, "", 1000)}`;
  }).join("\n");
}

function overlapRatio(first, second) {
  const overlap = Math.max(0, Math.min(first.endSeconds, second.endSeconds) - Math.max(first.startSeconds, second.startSeconds));
  return overlap / Math.max(1, Math.min(first.durationSeconds, second.durationSeconds));
}

export function normalizeClipCandidates(rawClips, segments, analysisSeconds, requestedSeconds) {
  if (!Array.isArray(rawClips)) return [];
  const maximum = Math.max(1, Number(analysisSeconds) || 1);
  const target = Math.max(30, Math.min(180, Number(requestedSeconds) || 60));
  const normalized = [];

  for (const raw of [...rawClips].sort((left, right) => Number(right?.score || 0) - Number(left?.score || 0))) {
    let start = Number(raw?.start_seconds);
    let end = Number(raw?.end_seconds);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    start = Math.max(0, Math.min(maximum - 1, start));
    end = Math.max(start + 1, Math.min(maximum, end));

    const nearStart = segments.find((segment) => Number(segment.end) >= start && Number(segment.start) <= start + 4);
    if (nearStart && Math.abs(Number(nearStart.start) - start) <= 4) start = Math.max(0, Number(nearStart.start));
    const nearEnd = [...segments].reverse().find((segment) => Number(segment.start) <= end && Number(segment.end) >= end - 4);
    if (nearEnd && Math.abs(Number(nearEnd.end) - end) <= 4) end = Math.min(maximum, Number(nearEnd.end));

    let duration = end - start;
    if (duration < 20) continue;
    if (duration > 180) end = Math.min(maximum, start + 180);
    duration = end - start;
    if (duration > target * 1.8 && target < 180) end = Math.min(end, start + Math.max(target + 20, target * 1.35));
    duration = end - start;

    const candidate = {
      title: cleanText(raw?.title, "Trecho em destaque", 90),
      hook: cleanText(raw?.hook, "Um momento que merece ser compartilhado.", 180),
      caption: cleanText(raw?.caption, "Confira este trecho.", 360),
      reason: cleanText(raw?.reason, "Trecho claro e completo.", 240),
      startSeconds: Number(start.toFixed(3)),
      endSeconds: Number(end.toFixed(3)),
      durationSeconds: Number(duration.toFixed(3)),
      score: Math.max(1, Math.min(100, Math.round(Number(raw?.score) || 1))),
    };
    if (normalized.some((existing) => overlapRatio(existing, candidate) > 0.65)) continue;
    normalized.push(candidate);
  }

  return normalized.sort((a, b) => b.score - a.score).slice(0, 8);
}

export function desiredClipCount(analysisSeconds) {
  const minutes = Math.ceil(Math.max(1, Number(analysisSeconds) || 1) / 60);
  return minutes <= 20 ? 3 : minutes <= 60 ? 6 : 8;
}
