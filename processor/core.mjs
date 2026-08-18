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

export function buildSrt(segments, clipStart, clipEnd, maximumCharacters = 42) {
  const relevant = segments
    .filter((segment) => Number(segment.end) > clipStart && Number(segment.start) < clipEnd)
    .map((segment) => ({
      start: Math.max(0, Number(segment.start) - clipStart),
      end: Math.min(clipEnd, Number(segment.end)) - clipStart,
      text: captionLines(segment.text, maximumCharacters),
    }))
    .filter((segment) => segment.end > segment.start && segment.text);

  return relevant.map((segment, index) => (
    `${index + 1}\n${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}\n${segment.text}\n`
  )).join("\n");
}

function assTime(seconds) {
  const centiseconds = Math.max(0, Math.round(Number(seconds) * 100));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const secs = Math.floor((centiseconds % 6000) / 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centiseconds % 100).padStart(2, "0")}`;
}

function assColor(hex, alpha = "00") {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
  if (!match) return `&H${alpha}FFFFFF`;
  return `&H${alpha}${match[3]}${match[2]}${match[1]}`.toUpperCase();
}

function cleanCaptionWord(value, removeFillers) {
  const text = cleanText(value, "", 80);
  if (!removeFillers) return text;
  return /^(é+|eh+|né+|ahn+|hum+|tipo|assim)[,.!?…]*$/i.test(text) ? "" : text;
}

export function buildAss(segments, clipStart, clipEnd, options = {}) {
  const vertical = options.format !== "16:9";
  const width = vertical ? 1080 : 1920, height = vertical ? 1920 : 1080;
  const font = cleanText(options.captionFont, "DejaVu Sans", 80);
  const size = Math.max(28, Math.min(96, Number(options.captionSize) || 54));
  const position = ["top", "middle", "bottom"].includes(options.captionPosition) ? options.captionPosition : "bottom";
  const alignment = position === "top" ? 8 : position === "middle" ? 5 : 2;
  const safeMargins = { shorts: 270, reels: 320, tiktok: 380 };
  const marginV = vertical ? (safeMargins[options.safeArea] || 270) : 70;
  const primary = assColor(options.primaryColor || "#ffffff");
  const highlight = assColor(options.highlightColor || "#ffd700");
  const outline = Math.max(0, Math.min(8, Number(options.outline) || 0));
  const shadow = Math.max(0, Math.min(8, Number(options.shadow) || 0));
  const caseMode = options.textCase || "original";
  const blockSize = Math.max(1, Math.min(10, Math.round(Number(options.wordsPerBlock) || 5)));
  const allWords = [];
  for (const segment of segments) {
    if (Array.isArray(segment.words) && segment.words.length) {
      for (const word of segment.words) allWords.push(word);
    } else {
      const words = cleanText(segment.text, "", 2000).split(/\s+/).filter(Boolean);
      const duration = Math.max(0.1, Number(segment.end) - Number(segment.start));
      words.forEach((word, index) => allWords.push({ word, start: Number(segment.start) + duration * index / words.length, end: Number(segment.start) + duration * (index + 1) / words.length }));
    }
  }
  const words = allWords
    .filter((word) => Number(word.end) > clipStart && Number(word.start) < clipEnd)
    .map((word) => ({ start: Math.max(clipStart, Number(word.start)), end: Math.min(clipEnd, Number(word.end)), word: cleanCaptionWord(word.word, options.removeFillers !== false) }))
    .filter((word) => word.word && word.end > word.start);
  const lines = [];
  for (let index = 0; index < words.length; index += blockSize) {
    const block = words.slice(index, index + blockSize);
    if (!block.length) continue;
    let text = block.map((word) => {
      let value = word.word;
      if (caseMode === "upper") value = value.toUpperCase();
      if (caseMode === "lower") value = value.toLowerCase();
      const duration = Math.max(1, Math.round((word.end - word.start) * 100));
      return `{\\1c${highlight}\\k${duration}}${value}{\\1c${primary}}`;
    }).join(" ");
    if (options.animation === "fade") text = `{\\fad(120,120)}${text}`;
    if (options.animation === "pop") text = `{\\fscx110\\fscy110\\t(0,140,\\fscx100\\fscy100)}${text}`;
    if (options.animation === "bounce") text = `{\\fscy85\\t(0,120,\\fscy108)\\t(120,220,\\fscy100)}${text}`;
    lines.push(`Dialogue: 0,${assTime(block[0].start - clipStart)},${assTime(block.at(-1).end - clipStart)},StormCast,,0,0,0,,${text}`);
  }
  const customSubtitle = cleanText(options.subtitleText, "", 120).replace(/[{}]/g, "");
  if (customSubtitle) lines.push(`Dialogue: 1,0:00:00.00,${assTime(clipEnd - clipStart)},Subtitle,,0,0,0,,${customSubtitle}`);
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: StormCast,${font},${size},${primary},${highlight},&H00101010,&H78000000,-1,0,0,0,100,100,0,0,1,${outline},${shadow},${alignment},80,80,${marginV},1
Style: Subtitle,${font},${Math.max(24, size * .55)},${primary},${highlight},&H00101010,&H78000000,0,0,0,0,100,100,0,0,1,${outline},${shadow},${position === "top" ? 8 : 2},80,80,${Math.max(80, marginV - 100)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lines.join("\n")}
`;
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

export function focusCropExpression(samples) {
  const points = (Array.isArray(samples) ? samples : [])
    .map((sample) => ({ t: Number(sample?.t), x: Number(sample?.x) }))
    .filter((sample) => Number.isFinite(sample.t) && sample.t >= 0 && Number.isFinite(sample.x))
    .map((sample) => ({ t: Number(sample.t.toFixed(2)), x: Number(Math.max(0.08, Math.min(0.92, sample.x)).toFixed(4)) }))
    .sort((left, right) => left.t - right.t)
    .slice(0, 30);
  if (!points.length) return "0.5";
  if (points.length === 1) return String(points[0].x);
  let expression = String(points.at(-1).x);
  for (let index = points.length - 2; index >= 0; index -= 1) {
    const current = points[index];
    const next = points[index + 1];
    const span = Math.max(0.01, next.t - current.t);
    const interpolation = `${current.x}+(${next.x}-${current.x})*(t-${current.t})/${span.toFixed(2)}`;
    expression = `if(lt(t,${next.t}),${interpolation},${expression})`;
  }
  return expression;
}
