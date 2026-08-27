import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildAss,
  buildSrt,
  buildVideoFilter,
  formatSrtTime,
  focusCropExpression,
  gameplayZoomExpression,
  normalizeClipCandidates,
  normalizeYouTubeUrl,
  shouldTranscribeAudio,
  transcriptForAnalysis,
  visualFallbackCandidates,
  visualTimelineForAnalysis,
} from "../processor/core.mjs";

test("normaliza somente links individuais do YouTube", () => {
  assert.deepEqual(normalizeYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?t=10"), {
    videoId: "dQw4w9WgXcQ",
    canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  });
  assert.deepEqual(
    normalizeYouTubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
    {
      videoId: "dQw4w9WgXcQ",
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
  );
  assert.throws(() =>
    normalizeYouTubeUrl("https://example.com/watch?v=dQw4w9WgXcQ"),
  );
  assert.throws(() => normalizeYouTubeUrl("file:///etc/passwd"));
});

test("gera expressão de foco suave e limitada para o FFmpeg", () => {
  assert.equal(focusCropExpression([]), "0.5");
  assert.equal(focusCropExpression([{ t: 0, x: 1.4 }]), "0.92");
  const expression = focusCropExpression([
    { t: 0, x: 0.2 },
    { t: 2, x: 0.8 },
  ]);
  assert.match(expression, /if\(lt\(t,2\),0\.2\+\(0\.8-0\.2\)/);
  assert.match(
    gameplayZoomExpression([
      { t: 0, zoom: 1 },
      { t: 2, zoom: 1.4 },
    ]),
    /1\.16/,
  );
});

test("gera filtros reais para Games e remove totalmente a legenda", () => {
  const tracking = {
    samples: [
      { t: 0, x: 0.35, zoom: 1 },
      { t: 1, x: 0.7, zoom: 1.12, sceneCut: true },
    ],
    facecam: { x: 0.72, y: 0.04, width: 0.22, height: 0.28 },
  };
  const gameplay = buildVideoFilter(
    { format: "9:16", framing: "gameplay" },
    null,
    tracking,
    { blurStrength: 20 },
  );
  assert.match(gameplay, /crop=.*if\(lt\(t,1\)/);
  assert.doesNotMatch(gameplay, /subtitles=/);
  assert.match(
    buildVideoFilter(
      { format: "9:16", framing: "smart_zoom" },
      null,
      tracking,
      { blurStrength: 20 },
    ),
    /eval=frame,crop=1080:1920/,
  );
  assert.match(
    buildVideoFilter(
      { format: "9:16", framing: "hud_safe" },
      null,
      tracking,
      { blurStrength: 18 },
    ),
    /scale=1040:1800/,
  );
  assert.match(
    buildVideoFilter(
      { format: "9:16", framing: "facecam_gameplay" },
      null,
      tracking,
      { blurStrength: 18 },
    ),
    /\[cam\]crop=.*overlay=40:72/,
  );
});

test("FFmpeg aceita os filtros Games sem legenda", (context) => {
  if (spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status !== 0) {
    context.skip("FFmpeg não está disponível neste ambiente");
    return;
  }
  const tracking = {
    samples: [
      { t: 0, x: 0.35, zoom: 1 },
      { t: 0.2, x: 0.68, zoom: 1.1 },
    ],
    facecam: { x: 0.7, y: 0.04, width: 0.24, height: 0.3 },
  };
  for (const framing of [
    "gameplay",
    "exploration",
    "smart_zoom",
    "gameplay_full",
    "hud_safe",
    "facecam_gameplay",
  ]) {
    const filter = buildVideoFilter(
      { format: "9:16", framing },
      null,
      tracking,
      { blurStrength: 12 },
    );
    const result = spawnSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=640x360:d=0.3:r=5",
        "-filter_complex",
        filter,
        "-map",
        "[v]",
        "-frames:v",
        "1",
        "-f",
        "null",
        "-",
      ],
      { encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(result.status, 0, `${framing}: ${result.stderr}`);
  }

  const directory = mkdtempSync(join(tmpdir(), "stormcast-filter-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const subtitlePath = join(directory, "legenda.ass");
  writeFileSync(
    subtitlePath,
    buildAss([{ start: 0, end: 0.3, text: "Teste real" }], 0, 0.3, {
      format: "9:16",
      safeArea: "shorts",
    }),
  );
  const captionResult = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=640x360:d=0.3:r=5",
      "-filter_complex",
      buildVideoFilter(
        { format: "9:16", framing: "gameplay" },
        subtitlePath,
        tracking,
        { blurStrength: 12 },
      ),
      "-map",
      "[v]",
      "-frames:v",
      "1",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8", timeout: 30_000 },
  );
  assert.equal(captionResult.status, 0, captionResult.stderr);
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

test("gera ASS com timestamps por palavra, estilo e área segura", () => {
  const ass = buildAss(
    [
      {
        start: 10,
        end: 12,
        text: "é uma frase forte",
        words: [
          { word: "é", start: 10, end: 10.2 },
          { word: "uma", start: 10.2, end: 10.6 },
          { word: "frase", start: 10.6, end: 11.2 },
          { word: "forte", start: 11.2, end: 12 },
        ],
      },
    ],
    10,
    12,
    {
      format: "9:16",
      captionFont: "Montserrat",
      captionSize: 62,
      highlightColor: "#ffcc00",
      safeArea: "tiktok",
      wordsPerBlock: 4,
      animation: "pop",
      removeFillers: true,
    },
  );
  assert.match(ass, /PlayResX: 1080/);
  assert.match(ass, /Style: StormCast,Montserrat,62/);
  assert.match(ass, /\\k40.*uma/);
  assert.doesNotMatch(ass, /\}é\{/);
  assert.match(ass, /MarginV,Encoding/);
  assert.match(ass, /,380,1/);
});

test("ignora fragmentos de áudio vazios antes de chamar a OpenAI", () => {
  assert.equal(shouldTranscribeAudio(0, 4096), false);
  assert.equal(shouldTranscribeAudio(0.099, 4096), false);
  assert.equal(shouldTranscribeAudio(12, 128), false);
  assert.equal(shouldTranscribeAudio(0.1, 4096), true);
});

test("rejeita cortes inválidos e sobrepostos", () => {
  const segments = Array.from({ length: 20 }, (_, index) => ({
    start: index * 10,
    end: (index + 1) * 10,
    text: `Trecho ${index}`,
  }));
  const result = normalizeClipCandidates(
    [
      {
        title: "Corte principal",
        hook: "Gancho",
        caption: "Legenda",
        reason: "Motivo",
        start_seconds: 10,
        end_seconds: 70,
        complete_thought: true,
        ending_text: "Conclusão principal.",
        score: 92,
      },
      {
        title: "Muito sobreposto",
        hook: "Gancho",
        caption: "Legenda",
        reason: "Motivo",
        start_seconds: 15,
        end_seconds: 68,
        complete_thought: true,
        ending_text: "Conclusão sobreposta.",
        score: 99,
      },
      {
        title: "Curto",
        hook: "Gancho",
        caption: "Legenda",
        reason: "Motivo",
        start_seconds: 80,
        end_seconds: 88,
        complete_thought: true,
        ending_text: "Conclusão curta.",
        score: 90,
      },
      {
        title: "Segundo válido",
        hook: "Gancho",
        caption: "Legenda",
        reason: "Motivo",
        start_seconds: 100,
        end_seconds: 160,
        complete_thought: true,
        ending_text: "Conclusão do segundo trecho.",
        score: 88,
      },
    ],
    segments,
    200,
    60,
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].title, "Muito sobreposto");
  assert.equal(result[1].title, "Segundo válido");
});

test("usa a duração como alvo e rejeita assunto sem conclusão", () => {
  const segments = Array.from({ length: 24 }, (_, index) => ({
    start: index * 10,
    end: (index + 1) * 10,
    text: `Parte ${index} da história${index === 13 ? "." : ","}`,
  }));
  const result = normalizeClipCandidates(
    [
      {
        title: "História completa",
        hook: "O show que aconteceu na igreja",
        caption: "Uma história com conclusão.",
        reason: "Inclui contexto, desenvolvimento e desfecho.",
        start_seconds: 10,
        end_seconds: 140,
        complete_thought: true,
        ending_text: "E então todos entenderam o que aconteceu.",
        score: 95,
      },
      {
        title: "Assunto interrompido",
        hook: "Começa bem, mas não termina",
        caption: "Trecho incompleto.",
        reason: "Ainda faltou o desfecho.",
        start_seconds: 150,
        end_seconds: 240,
        complete_thought: false,
        ending_text: "E foi aí que...",
        score: 99,
      },
    ],
    segments,
    240,
    90,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].title, "História completa");
  assert.equal(result[0].durationSeconds, 130);
});

test("seleciona gameplay visual mesmo sem fala", () => {
  const events = [
    { start: 20, end: 28, score: 96, motion: 92, change: 88, sceneCuts: 1, focusX: 0.72 },
    { start: 150, end: 158, score: 90, motion: 84, change: 79, sceneCuts: 0, focusX: 0.31 },
  ];
  assert.match(visualTimelineForAnalysis(events), /ação=direita/);
  const fallback = visualFallbackCandidates(events, 240, 60, 3);
  const clips = normalizeClipCandidates(fallback, [], 240, 60, {
    contentProfile: "games",
  });
  assert.equal(clips.length, 2);
  assert.equal(clips[0].title, "Destaque visual do gameplay");
  assert.ok(clips.every((clip) => clip.durationSeconds >= 20));
});
