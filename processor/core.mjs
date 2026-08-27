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
          complete_thought: { type: "boolean" },
          ending_text: { type: "string", minLength: 3, maxLength: 240 },
          score: { type: "integer", minimum: 1, maximum: 100 },
          reason: { type: "string", minLength: 3, maxLength: 240 },
        },
        required: [
          "title",
          "hook",
          "caption",
          "start_seconds",
          "end_seconds",
          "complete_thought",
          "ending_text",
          "score",
          "reason",
        ],
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

  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Link do YouTube inválido.");
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  let videoId = "";
  if (host === "youtu.be") videoId = parts[0] || "";
  if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
    videoId =
      url.searchParams.get("v") ||
      (["shorts", "live", "embed"].includes(parts[0]) ? parts[1] : "") ||
      "";
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId))
    throw new Error("Link do YouTube inválido.");
  return {
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
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
    .filter(
      (segment) =>
        Number(segment.end) > clipStart && Number(segment.start) < clipEnd,
    )
    .map((segment) => ({
      start: Math.max(0, Number(segment.start) - clipStart),
      end: Math.min(clipEnd, Number(segment.end)) - clipStart,
      text: captionLines(segment.text, maximumCharacters),
    }))
    .filter((segment) => segment.end > segment.start && segment.text);

  return relevant
    .map(
      (segment, index) =>
        `${index + 1}\n${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}\n${segment.text}\n`,
    )
    .join("\n");
}

export function shouldTranscribeAudio(durationSeconds, byteLength) {
  const duration = Number(durationSeconds);
  const size = Number(byteLength);
  return (
    Number.isFinite(duration) &&
    duration >= 0.1 &&
    Number.isFinite(size) &&
    size >= 512
  );
}

function assTime(seconds) {
  const centiseconds = Math.max(0, Math.round(Number(seconds) * 100));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const secs = Math.floor((centiseconds % 6000) / 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centiseconds % 100).padStart(2, "0")}`;
}

function assColor(hex, alpha = "00") {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(
    String(hex || ""),
  );
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
  const width = vertical ? 1080 : 1920,
    height = vertical ? 1920 : 1080;
  const font = cleanText(options.captionFont, "DejaVu Sans", 80);
  const size = Math.max(28, Math.min(96, Number(options.captionSize) || 54));
  const position = ["top", "middle", "bottom"].includes(options.captionPosition)
    ? options.captionPosition
    : "bottom";
  const alignment = position === "top" ? 8 : position === "middle" ? 5 : 2;
  const safeMargins = { shorts: 270, reels: 320, tiktok: 380 };
  const marginV = vertical ? safeMargins[options.safeArea] || 270 : 70;
  const primary = assColor(options.primaryColor || "#ffffff");
  const highlight = assColor(options.highlightColor || "#ffd700");
  const outline = Math.max(0, Math.min(8, Number(options.outline) || 0));
  const shadow = Math.max(0, Math.min(8, Number(options.shadow) || 0));
  const caseMode = options.textCase || "original";
  const blockSize = Math.max(
    1,
    Math.min(10, Math.round(Number(options.wordsPerBlock) || 5)),
  );
  const allWords = [];
  for (const segment of segments) {
    if (Array.isArray(segment.words) && segment.words.length) {
      for (const word of segment.words) allWords.push(word);
    } else {
      const words = cleanText(segment.text, "", 2000)
        .split(/\s+/)
        .filter(Boolean);
      const duration = Math.max(
        0.1,
        Number(segment.end) - Number(segment.start),
      );
      words.forEach((word, index) =>
        allWords.push({
          word,
          start: Number(segment.start) + (duration * index) / words.length,
          end: Number(segment.start) + (duration * (index + 1)) / words.length,
        }),
      );
    }
  }
  const words = allWords
    .filter(
      (word) => Number(word.end) > clipStart && Number(word.start) < clipEnd,
    )
    .map((word) => ({
      start: Math.max(clipStart, Number(word.start)),
      end: Math.min(clipEnd, Number(word.end)),
      word: cleanCaptionWord(word.word, options.removeFillers !== false),
    }))
    .filter((word) => word.word && word.end > word.start);
  const lines = [];
  for (let index = 0; index < words.length; index += blockSize) {
    const block = words.slice(index, index + blockSize);
    if (!block.length) continue;
    let text = block
      .map((word) => {
        let value = word.word;
        if (caseMode === "upper") value = value.toUpperCase();
        if (caseMode === "lower") value = value.toLowerCase();
        const duration = Math.max(1, Math.round((word.end - word.start) * 100));
        return `{\\1c${highlight}\\k${duration}}${value}{\\1c${primary}}`;
      })
      .join(" ");
    if (options.animation === "fade") text = `{\\fad(120,120)}${text}`;
    if (options.animation === "pop")
      text = `{\\fscx110\\fscy110\\t(0,140,\\fscx100\\fscy100)}${text}`;
    if (options.animation === "bounce")
      text = `{\\fscy85\\t(0,120,\\fscy108)\\t(120,220,\\fscy100)}${text}`;
    lines.push(
      `Dialogue: 0,${assTime(block[0].start - clipStart)},${assTime(block.at(-1).end - clipStart)},StormCast,,0,0,0,,${text}`,
    );
  }
  const customSubtitle = cleanText(options.subtitleText, "", 120).replace(
    /[{}]/g,
    "",
  );
  if (customSubtitle)
    lines.push(
      `Dialogue: 1,0:00:00.00,${assTime(clipEnd - clipStart)},Subtitle,,0,0,0,,${customSubtitle}`,
    );
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: StormCast,${font},${size},${primary},${highlight},&H00101010,&H78000000,-1,0,0,0,100,100,0,0,1,${outline},${shadow},${alignment},80,80,${marginV},1
Style: Subtitle,${font},${Math.max(24, size * 0.55)},${primary},${highlight},&H00101010,&H78000000,0,0,0,0,100,100,0,0,1,${outline},${shadow},${position === "top" ? 8 : 2},80,80,${Math.max(80, marginV - 100)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lines.join("\n")}
`;
}

export function transcriptForAnalysis(segments) {
  return segments
    .map((segment) => {
      const start = Math.max(0, Number(segment.start) || 0);
      const end = Math.max(start, Number(segment.end) || start);
      return `[${start.toFixed(2)}-${end.toFixed(2)}] ${cleanText(segment.text, "", 1000)}`;
    })
    .join("\n");
}

export function visualTimelineForAnalysis(events) {
  return (Array.isArray(events) ? events : [])
    .map((event) => {
      const start = Math.max(0, Number(event?.start) || 0);
      const end = Math.max(start, Number(event?.end) || start);
      const score = Math.max(0, Math.min(100, Math.round(Number(event?.score) || 0)));
      const motion = Math.max(0, Math.min(100, Math.round(Number(event?.motion) || 0)));
      const change = Math.max(0, Math.min(100, Math.round(Number(event?.change) || 0)));
      const cuts = Math.max(0, Math.round(Number(event?.sceneCuts) || 0));
      const focus = Number.isFinite(Number(event?.focusX))
        ? Number(event.focusX) < 0.4
          ? "esquerda"
          : Number(event.focusX) > 0.6
            ? "direita"
            : "centro"
        : "centro";
      return `[${start.toFixed(2)}-${end.toFixed(2)}] interesse=${score} movimento=${motion} mudança=${change} cortes_de_cena=${cuts} ação=${focus}`;
    })
    .join("\n");
}

function overlapRatio(first, second) {
  const overlap = Math.max(
    0,
    Math.min(first.endSeconds, second.endSeconds) -
      Math.max(first.startSeconds, second.startSeconds),
  );
  return (
    overlap /
    Math.max(1, Math.min(first.durationSeconds, second.durationSeconds))
  );
}

export function normalizeClipCandidates(
  rawClips,
  segments,
  analysisSeconds,
  requestedSeconds,
  options = {},
) {
  if (!Array.isArray(rawClips)) return [];
  const maximum = Math.max(1, Number(analysisSeconds) || 1);
  const target = Math.max(30, Math.min(180, Number(requestedSeconds) || 60));
  const flexibleMaximum = Math.min(
    240,
    Math.max(target + 60, Math.round(target * 1.5)),
  );
  const normalized = [];

  for (const raw of [...rawClips].sort(
    (left, right) => Number(right?.score || 0) - Number(left?.score || 0),
  )) {
    if (raw?.complete_thought !== true) continue;
    let start = Number(raw?.start_seconds);
    let end = Number(raw?.end_seconds);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    start = Math.max(0, Math.min(maximum - 1, start));
    end = Math.max(start + 1, Math.min(maximum, end));

    const transcriptSegments = Array.isArray(segments) ? segments : [];
    const nearStart = transcriptSegments.find(
      (segment) =>
        Number(segment.end) >= start && Number(segment.start) <= start + 4,
    );
    if (nearStart && Math.abs(Number(nearStart.start) - start) <= 4)
      start = Math.max(0, Number(nearStart.start));
    const nearEnd = transcriptSegments.find(
      (segment) => Number(segment.start) <= end && Number(segment.end) >= end,
    );
    if (
      nearEnd &&
      Number(nearEnd.end) - start <= flexibleMaximum &&
      Number(nearEnd.end) > end
    )
      end = Math.min(maximum, Number(nearEnd.end));

    const duration = end - start;
    if (duration < 20) continue;
    if (duration > flexibleMaximum) continue;

    const candidate = {
      title: cleanText(raw?.title, "Trecho em destaque", 90),
      hook: cleanText(
        raw?.hook,
        "Um momento que merece ser compartilhado.",
        180,
      ),
      caption: cleanText(raw?.caption, "Confira este trecho.", 360),
      reason: cleanText(raw?.reason, "Trecho claro e completo.", 240),
      endingText: cleanText(
        raw?.ending_text,
        options.contentProfile === "games"
          ? "A sequência visual termina em uma transição natural."
          : "Conclusão do trecho.",
        240,
      ),
      startSeconds: Number(start.toFixed(3)),
      endSeconds: Number(end.toFixed(3)),
      durationSeconds: Number(duration.toFixed(3)),
      score: Math.max(1, Math.min(100, Math.round(Number(raw?.score) || 1))),
    };
    if (normalized.some((existing) => overlapRatio(existing, candidate) > 0.65))
      continue;
    normalized.push(candidate);
  }

  return normalized.sort((a, b) => b.score - a.score).slice(0, 8);
}

export function visualFallbackCandidates(
  events,
  analysisSeconds,
  requestedSeconds,
  maximumCount = 8,
) {
  const maximum = Math.max(1, Number(analysisSeconds) || 1);
  const target = Math.max(30, Math.min(180, Number(requestedSeconds) || 60));
  const ranked = (Array.isArray(events) ? events : [])
    .map((event) => ({
      start: Math.max(0, Number(event?.start) || 0),
      end: Math.max(0, Number(event?.end) || 0),
      score: Math.max(1, Math.min(100, Math.round(Number(event?.score) || 1))),
      motion: Math.max(0, Math.min(100, Math.round(Number(event?.motion) || 0))),
      change: Math.max(0, Math.min(100, Math.round(Number(event?.change) || 0))),
      sceneCuts: Math.max(0, Math.round(Number(event?.sceneCuts) || 0)),
    }))
    .filter((event) => event.end > event.start)
    .sort((left, right) => right.score - left.score);
  const output = [];
  for (const event of ranked) {
    const midpoint = (event.start + event.end) / 2;
    let start = Math.max(0, midpoint - target / 2);
    let end = Math.min(maximum, start + target);
    start = Math.max(0, end - target);
    const candidate = {
      title: "Destaque visual do gameplay",
      hook: "Uma sequência de alta atividade visual.",
      caption: "Momento selecionado pela análise visual do gameplay.",
      reason: `Interesse visual ${event.score}/100, movimento ${event.motion}/100 e mudança ${event.change}/100.`,
      start_seconds: Number(start.toFixed(3)),
      end_seconds: Number(end.toFixed(3)),
      complete_thought: true,
      ending_text:
        event.sceneCuts > 0
          ? "A sequência termina próxima a uma mudança natural de cena."
          : "A sequência visual termina depois do pico de atividade.",
      score: event.score,
    };
    const normalizedShape = {
      startSeconds: candidate.start_seconds,
      endSeconds: candidate.end_seconds,
      durationSeconds: candidate.end_seconds - candidate.start_seconds,
    };
    if (
      output.some(
        (existing) =>
          overlapRatio(
            {
              startSeconds: existing.start_seconds,
              endSeconds: existing.end_seconds,
              durationSeconds: existing.end_seconds - existing.start_seconds,
            },
            normalizedShape,
          ) > 0.55,
      )
    )
      continue;
    output.push(candidate);
    if (output.length >= Math.max(1, Math.min(8, Number(maximumCount) || 8)))
      break;
  }
  return output;
}

export function desiredClipCount(analysisSeconds) {
  const minutes = Math.ceil(Math.max(1, Number(analysisSeconds) || 1) / 60);
  return minutes <= 20 ? 3 : minutes <= 60 ? 6 : 8;
}

export function focusCropExpression(samples) {
  const points = (Array.isArray(samples) ? samples : [])
    .map((sample) => ({ t: Number(sample?.t), x: Number(sample?.x) }))
    .filter(
      (sample) =>
        Number.isFinite(sample.t) && sample.t >= 0 && Number.isFinite(sample.x),
    )
    .map((sample) => ({
      t: Number(sample.t.toFixed(2)),
      x: Number(Math.max(0.08, Math.min(0.92, sample.x)).toFixed(4)),
    }))
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

export function gameplayZoomExpression(samples) {
  const points = (Array.isArray(samples) ? samples : [])
    .map((sample) => ({ t: Number(sample?.t), zoom: Number(sample?.zoom) }))
    .filter(
      (sample) =>
        Number.isFinite(sample.t) &&
        sample.t >= 0 &&
        Number.isFinite(sample.zoom),
    )
    .map((sample) => ({
      t: Number(sample.t.toFixed(2)),
      zoom: Number(Math.max(1, Math.min(1.16, sample.zoom)).toFixed(4)),
    }))
    .sort((left, right) => left.t - right.t)
    .slice(0, 30);
  if (!points.length) return "1";
  if (points.length === 1) return String(points[0].zoom);
  let expression = String(points.at(-1).zoom);
  for (let index = points.length - 2; index >= 0; index -= 1) {
    const current = points[index];
    const next = points[index + 1];
    const span = Math.max(0.01, next.t - current.t);
    const interpolation = `${current.zoom}+(${next.zoom}-${current.zoom})*(t-${current.t})/${span.toFixed(2)}`;
    expression = `if(lt(t,${next.t}),${interpolation},${expression})`;
  }
  return expression;
}

function escapedFilterPath(filePath) {
  return String(filePath || "")
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/,/g, "\\,")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function verticalCrop(focus = "0.5", widthRatio = "9/16") {
  return `crop='ih*${widthRatio}':ih:'max(0,min(iw-ow,(${focus})*iw-ow/2))':0`;
}

export function buildVideoFilter(
  job,
  subtitlePath,
  tracking = { samples: [] },
  options = {},
) {
  const subtitles = subtitlePath
    ? `,subtitles='${escapedFilterPath(subtitlePath)}'`
    : "";
  const samples = Array.isArray(tracking?.samples) ? tracking.samples : [];
  const blur = Math.max(1, Math.round(Number(options.blurStrength) || 20));
  if (job.format === "16:9")
    return `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black${subtitles}[v]`;
  if (job.framing === "center")
    return `[0:v]${verticalCrop("0.5")},scale=1080:1920${subtitles}[v]`;
  if (["auto", "face", "participant"].includes(job.framing))
    return `[0:v]${verticalCrop(focusCropExpression(samples))},scale=1080:1920${subtitles}[v]`;
  if (
    [
      "gameplay",
      "vehicle",
      "action",
      "character_gameplay",
      "cinematic_gameplay",
    ].includes(job.framing)
  )
    return `[0:v]${verticalCrop(focusCropExpression(samples))},scale=1080:1920${subtitles}[v]`;
  if (job.framing === "exploration") {
    const focus = focusCropExpression(samples);
    return `[0:v]split=2[bg][scene];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=${blur}:${Math.max(1, Math.round(blur / 2))}[blur];[scene]scale=1180:1000:force_original_aspect_ratio=decrease,crop=1080:664:'max(0,min(iw-ow,(${focus})*iw-ow/2))':0[scenev];[blur][scenev]overlay=0:'max(140,(H-h)/2-60)'${subtitles}[v]`;
  }
  if (job.framing === "smart_zoom") {
    const focus = focusCropExpression(samples);
    const zoom = gameplayZoomExpression(samples);
    return `[0:v]${verticalCrop(focus)},scale=w='2*trunc(540*(${zoom}))':h='2*trunc(960*(${zoom}))':eval=frame,crop=1080:1920:(iw-ow)/2:(ih-oh)/2${subtitles}[v]`;
  }
  if (job.framing === "manual") {
    const focus = Math.max(
      0.08,
      Math.min(0.92, 0.5 + (Number(options.manualPosition) || 0) * 0.42),
    );
    return `[0:v]${verticalCrop(String(focus))},scale=1080:1920${subtitles}[v]`;
  }
  if (job.framing === "split")
    return `[0:v]split=2[left][right];[left]crop=iw/2:ih:0:0,scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960[leftv];[right]crop=iw/2:ih:iw/2:0,scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960[rightv];[leftv][rightv]vstack=inputs=2${subtitles}[v]`;
  if (job.framing === "spotlight") {
    const focus = focusCropExpression(samples);
    return `[0:v]split=2[face][full];[face]${verticalCrop(focus, "1080/1275")},scale=1080:1275[facev];[full]scale=1080:645:force_original_aspect_ratio=decrease,pad=1080:645:(ow-iw)/2:(oh-ih)/2:black[fullv];[facev][fullv]vstack=inputs=2${subtitles}[v]`;
  }
  if (job.framing === "react") {
    const focus = focusCropExpression(samples);
    return `[0:v]split=2[main][react];[main]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[mainv];[react]${verticalCrop(focus)},scale=410:730[reactv];[mainv][reactv]overlay=W-w-44:44:format=auto${subtitles}[v]`;
  }
  if (job.framing === "facecam_gameplay") {
    const focus = focusCropExpression(samples);
    const facecam = tracking?.facecam;
    if (
      facecam &&
      [facecam.x, facecam.y, facecam.width, facecam.height].every((value) =>
        Number.isFinite(Number(value)),
      )
    ) {
      const x = Math.max(0, Math.min(0.94, Number(facecam.x))).toFixed(4);
      const y = Math.max(0, Math.min(0.94, Number(facecam.y))).toFixed(4);
      const width = Math.max(
        0.06,
        Math.min(1 - Number(x), Number(facecam.width)),
      ).toFixed(4);
      const height = Math.max(
        0.06,
        Math.min(1 - Number(y), Number(facecam.height)),
      ).toFixed(4);
      return `[0:v]split=2[main][cam];[main]${verticalCrop(focus)},scale=1080:1920[mainv];[cam]crop='iw*${width}':'ih*${height}':'iw*${x}':'ih*${y}',scale=360:260:force_original_aspect_ratio=decrease,pad=376:276:(ow-iw)/2:(oh-ih)/2:color=0x0b0d12[camv];[mainv][camv]overlay=40:72:format=auto${subtitles}[v]`;
    }
    return `[0:v]${verticalCrop(focus)},scale=1080:1920${subtitles}[v]`;
  }
  const foregroundWidth = job.framing === "hud_safe" ? 1040 : 1080;
  const foregroundHeight = job.framing === "hud_safe" ? 1800 : 1920;
  const foregroundY =
    job.framing === "hud_safe" ? "'max(120,(H-h)/2-70)'" : "(H-h)/2";
  return `[0:v]split=2[bg][fg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=${blur}:${Math.max(1, Math.round(blur / 2))}[blur];[fg]scale=${foregroundWidth}:${foregroundHeight}:force_original_aspect_ratio=decrease[front];[blur][front]overlay=(W-w)/2:${foregroundY}${subtitles}[v]`;
}
