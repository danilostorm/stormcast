import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSrt,
  formatSrtTime,
  normalizeClipCandidates,
  normalizeYouTubeUrl,
  transcriptForAnalysis,
} from "../processor/core.mjs";

test("normaliza somente links individuais do YouTube", () => {
  assert.deepEqual(normalizeYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?t=10"), {
    videoId: "dQw4w9WgXcQ",
    canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  });
  assert.deepEqual(normalizeYouTubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ"), {
    videoId: "dQw4w9WgXcQ",
    canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  });
  assert.throws(() => normalizeYouTubeUrl("https://example.com/watch?v=dQw4w9WgXcQ"));
  assert.throws(() => normalizeYouTubeUrl("file:///etc/passwd"));
});

test("gera SRT relativo ao início do corte", () => {
  const segments = [
    { start: 10, end: 12.5, text: "Primeira frase do trecho." },
    { start: 12.5, end: 16, text: "Segunda frase, ainda sincronizada." },
  ];
  const srt = buildSrt(segments, 10, 16);
  assert.match(srt, /00:00:00,000 --> 00:00:02,500/);
  assert.match(srt, /Primeira frase do trecho/);
  assert.equal(formatSrtTime(3661.123), "01:01:01,123");
  assert.match(transcriptForAnalysis(segments), /^\[10\.00-12\.50\]/);
});

test("rejeita cortes inválidos e sobrepostos", () => {
  const segments = Array.from({ length: 20 }, (_, index) => ({ start: index * 10, end: (index + 1) * 10, text: `Trecho ${index}` }));
  const result = normalizeClipCandidates([
    { title: "Corte principal", hook: "Gancho", caption: "Legenda", reason: "Motivo", start_seconds: 10, end_seconds: 70, score: 92 },
    { title: "Muito sobreposto", hook: "Gancho", caption: "Legenda", reason: "Motivo", start_seconds: 15, end_seconds: 68, score: 99 },
    { title: "Curto", hook: "Gancho", caption: "Legenda", reason: "Motivo", start_seconds: 80, end_seconds: 88, score: 90 },
    { title: "Segundo válido", hook: "Gancho", caption: "Legenda", reason: "Motivo", start_seconds: 100, end_seconds: 160, score: 88 },
  ], segments, 200, 60);
  assert.equal(result.length, 2);
  assert.equal(result[0].title, "Muito sobreposto");
  assert.equal(result[1].title, "Segundo válido");
});
