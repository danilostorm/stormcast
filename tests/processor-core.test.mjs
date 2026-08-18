import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAss,
  buildSrt,
  formatSrtTime,
  focusCropExpression,
  normalizeClipCandidates,
  normalizeYouTubeUrl,
  shouldTranscribeAudio,
  transcriptForAnalysis,
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
