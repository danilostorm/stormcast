import { allowRequest, assertSameOrigin, clientAddress, userFromRequest } from "../../../lib/auth";
import { execute, queryOne } from "../../../lib/database";
import { listProjects } from "../../../lib/projects";
import { randomToken } from "../../../lib/security";
import { normalizeYouTubeUrl, processorConfigured } from "../../../lib/youtube";
import { captionStyleIds, framingIds, normalizeRenderOptions } from "../../../lib/render-options";

type CreateProjectBody = {
  sourceUrl?: unknown;
  videoId?: unknown;
  title?: unknown;
  durationSeconds?: unknown;
  thumbnailUrl?: unknown;
  analysisMinutes?: unknown;
  clipDuration?: unknown;
  format?: unknown;
  framing?: unknown;
  prompt?: unknown;
  captionStyle?: unknown;
  renderOptions?: unknown;
};

function cleanText(value: unknown, maximum: number) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
}

export async function GET(request: Request) {
  const user = await userFromRequest(request);
  if (!user) return Response.json({ error: "Faça login novamente." }, { status: 401 });
  return Response.json({
    projects: await listProjects(user.id),
    credits: user.credits,
    processorConfigured: processorConfigured(),
  });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await userFromRequest(request);
    if (!user) return Response.json({ error: "Faça login novamente." }, { status: 401 });
    if (!processorConfigured()) {
      return Response.json({ error: "O processador real ainda não foi configurado no servidor." }, { status: 503 });
    }
    if (!allowRequest(`create-project:${user.id}:${clientAddress(request)}`, 5, 60 * 60_000)) {
      return Response.json({ error: "Limite de novos processamentos atingido. Tente novamente mais tarde." }, { status: 429 });
    }

    const body = await request.json().catch(() => null) as CreateProjectBody | null;
    if (!body || typeof body.sourceUrl !== "string") {
      return Response.json({ error: "Informe o link do YouTube." }, { status: 400 });
    }
    const source = normalizeYouTubeUrl(body.sourceUrl);
    if (body.videoId !== source.videoId) {
      return Response.json({ error: "Consulte novamente os dados reais do vídeo." }, { status: 400 });
    }

    const analysisMinutes = Math.floor(Number(body.analysisMinutes));
    const metadataDuration = Math.floor(Number(body.durationSeconds));
    if (!Number.isFinite(analysisMinutes) || analysisMinutes < 1 || analysisMinutes > 90) {
      return Response.json({ error: "O intervalo de análise precisa ficar entre 1 e 90 minutos." }, { status: 400 });
    }
    if (!Number.isFinite(metadataDuration) || metadataDuration < 10 || analysisMinutes * 60 > metadataDuration + 59) {
      return Response.json({ error: "O intervalo escolhido ultrapassa a duração consultada do vídeo." }, { status: 400 });
    }
    if (user.credits < analysisMinutes) {
      return Response.json({ error: `Saldo insuficiente. Este processamento exige até ${analysisMinutes} créditos.` }, { status: 402 });
    }

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const monthlyUsage = await queryOne<{ used: number }>(
      "SELECT COALESCE(SUM(-amount), 0) used FROM credit_history WHERE user_id = ? AND amount < 0 AND created_at >= ?",
      [user.id, monthStart.getTime()],
    );
    if (user.monthlyCreditLimit > 0 && Number(monthlyUsage?.used || 0) + analysisMinutes > user.monthlyCreditLimit) {
      return Response.json({ error: `Seu limite mensal de ${user.monthlyCreditLimit} créditos seria ultrapassado.` }, { status: 402 });
    }

    const active = await queryOne<{ total: number }>(
      `SELECT COUNT(*) total FROM projects
       WHERE user_id = ? AND status IN ('queued', 'downloading', 'transcribing', 'analyzing', 'rendering')
      `,
      [user.id],
    );
    if (Number(active?.total || 0) >= user.maxActiveProjects) {
      return Response.json({ error: `Seu plano permite até ${user.maxActiveProjects} projeto(s) simultâneo(s). Aguarde ou cancele um trabalho atual.` }, { status: 409 });
    }

    const format = body.format === "16:9" ? "16:9" : "9:16";
    const framing = framingIds.includes(String(body.framing) as typeof framingIds[number])
      ? String(body.framing)
      : "auto";
    const requestedClipSeconds = [30, 60, 90, 180].includes(Number(body.clipDuration)) ? Number(body.clipDuration) : 60;
    const captionStyle = captionStyleIds.includes(String(body.captionStyle) as typeof captionStyleIds[number])
      ? String(body.captionStyle)
      : "impact";
    const renderOptions = JSON.stringify(normalizeRenderOptions(body.renderOptions));
    const title = cleanText(body.title, 180) || "Vídeo do YouTube";
    const prompt = cleanText(body.prompt, 520);
    const thumbnailUrl = `https://i.ytimg.com/vi/${source.videoId}/hqdefault.jpg`;
    const now = Date.now();
    const id = randomToken(16);

    await execute(
      `INSERT INTO projects (
        id, user_id, title, source_url, source_platform, source_video_id, source_duration_seconds,
        requested_analysis_minutes, requested_clip_seconds, format, framing, prompt, caption_style, render_options,
        thumbnail_url, status, stage, progress, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'YouTube', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 'Aguardando processador', 1, ?, ?)`,
      [
        id,
        user.id,
        title,
        source.canonicalUrl,
        source.videoId,
        metadataDuration,
        analysisMinutes,
        requestedClipSeconds,
        format,
        framing,
        prompt,
        captionStyle,
        renderOptions,
        thumbnailUrl,
        now,
        now,
      ],
    );

    const projects = await listProjects(user.id);
    return Response.json({ project: projects.find((project) => project.id === id) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível criar o processamento.";
    return Response.json({ error: message }, { status: 400 });
  }
}
