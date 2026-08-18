import { assertSameOrigin, userFromRequest } from "../../../../lib/auth";
import { execute, queryOne, runtimeValue } from "../../../../lib/database";
import { getProject } from "../../../../lib/projects";
import { randomToken } from "../../../../lib/security";
import { processorConfigured } from "../../../../lib/youtube";
import {
  captionStyleIds,
  framingIds,
  normalizeRenderOptions,
  type FramingId,
} from "../../../../lib/render-options";

type RouteContext = { params: Promise<{ id: string }> };

type ProjectRow = {
  id: string;
  user_id: string;
  title: string;
  source_url: string;
  source_video_id: string;
  source_duration_seconds: number;
  requested_analysis_minutes: number;
  requested_clip_seconds: number;
  format: "9:16" | "16:9";
  framing: FramingId;
  prompt: string;
  caption_style: string;
  render_options: string;
  thumbnail_url: string | null;
  status: string;
};

type ProjectActionBody = {
  action?: "retry" | "duplicate" | "update_and_retry";
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
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function normalizedSettings(row: ProjectRow, body: ProjectActionBody) {
  const analysisMinutes =
    body.action === "update_and_retry"
      ? Math.floor(Number(body.analysisMinutes))
      : Number(row.requested_analysis_minutes);
  const clipDuration =
    body.action === "update_and_retry"
      ? Number(body.clipDuration)
      : Number(row.requested_clip_seconds);
  if (
    !Number.isFinite(analysisMinutes) ||
    analysisMinutes < 1 ||
    analysisMinutes > 90 ||
    analysisMinutes * 60 > Number(row.source_duration_seconds) + 59
  ) {
    throw new Error("O intervalo de análise não é válido para este vídeo.");
  }
  return {
    analysisMinutes,
    clipDuration: [30, 60, 90, 180].includes(clipDuration) ? clipDuration : 60,
    format:
      body.action === "update_and_retry" && body.format === "16:9"
        ? "16:9"
        : body.action === "update_and_retry"
          ? "9:16"
          : row.format,
    framing:
      body.action === "update_and_retry" &&
      framingIds.includes(String(body.framing) as FramingId)
        ? String(body.framing)
        : body.action === "update_and_retry"
          ? "auto"
          : row.framing,
    prompt:
      body.action === "update_and_retry"
        ? cleanText(body.prompt, 520)
        : row.prompt,
    captionStyle:
      body.action === "update_and_retry" &&
      captionStyleIds.includes(
        String(body.captionStyle) as (typeof captionStyleIds)[number],
      )
        ? String(body.captionStyle)
        : row.caption_style,
    renderOptions:
      body.action === "update_and_retry"
        ? JSON.stringify(normalizeRenderOptions(body.renderOptions))
        : row.render_options,
  };
}

export async function GET(request: Request, context: RouteContext) {
  const user = await userFromRequest(request);
  if (!user)
    return Response.json({ error: "Faça login novamente." }, { status: 401 });
  const { id } = await context.params;
  const project = await getProject(user.id, id);
  if (!project)
    return Response.json({ error: "Projeto não encontrado." }, { status: 404 });
  return Response.json({ project });
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const user = await userFromRequest(request);
    if (!user)
      return Response.json({ error: "Faça login novamente." }, { status: 401 });
    if (!processorConfigured())
      return Response.json(
        { error: "O processador não está disponível no momento." },
        { status: 503 },
      );
    const { id } = await context.params;
    const body = (await request
      .json()
      .catch(() => null)) as ProjectActionBody | null;
    if (
      !body ||
      !["retry", "duplicate", "update_and_retry"].includes(String(body.action))
    ) {
      return Response.json(
        { error: "Ação de projeto inválida." },
        { status: 400 },
      );
    }
    const row = await queryOne<ProjectRow>(
      `SELECT id, user_id, title, source_url, source_video_id, source_duration_seconds,
        requested_analysis_minutes, requested_clip_seconds, format, framing, prompt,
        caption_style, render_options, thumbnail_url, status
       FROM projects WHERE id = ? AND user_id = ? LIMIT 1`,
      [id, user.id],
    );
    if (!row)
      return Response.json(
        { error: "Projeto não encontrado." },
        { status: 404 },
      );
    if (
      body.action !== "duplicate" &&
      !["failed", "cancelled"].includes(row.status)
    ) {
      return Response.json(
        {
          error:
            "Somente projetos com falha ou cancelados podem ser reprocessados.",
        },
        { status: 409 },
      );
    }
    if (
      body.action === "duplicate" &&
      !["ready", "failed", "cancelled"].includes(row.status)
    ) {
      return Response.json(
        { error: "Aguarde o processamento atual terminar antes de duplicar." },
        { status: 409 },
      );
    }
    const active = await queryOne<{ id: string }>(
      `SELECT id FROM projects WHERE user_id = ? AND status IN ('queued', 'downloading', 'transcribing', 'analyzing', 'rendering') LIMIT 1`,
      [user.id],
    );
    if (active)
      return Response.json(
        {
          error:
            "Você já possui um vídeo em processamento. Aguarde ou cancele o trabalho atual.",
        },
        { status: 409 },
      );

    const settings = normalizedSettings(row, body);
    if (user.credits < settings.analysisMinutes) {
      return Response.json(
        {
          error: `Saldo insuficiente. Este processamento exige até ${settings.analysisMinutes} créditos.`,
        },
        { status: 402 },
      );
    }
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const monthlyUsage = await queryOne<{ used: number }>(
      "SELECT COALESCE(SUM(-amount), 0) used FROM credit_history WHERE user_id = ? AND amount < 0 AND created_at >= ?",
      [user.id, monthStart.getTime()],
    );
    if (
      user.monthlyCreditLimit > 0 &&
      Number(monthlyUsage?.used || 0) + settings.analysisMinutes >
        user.monthlyCreditLimit
    ) {
      return Response.json(
        {
          error: `Seu limite mensal de ${user.monthlyCreditLimit} créditos seria ultrapassado.`,
        },
        { status: 402 },
      );
    }
    const now = Date.now();

    if (body.action === "duplicate") {
      const newId = randomToken(16);
      await execute(
        `INSERT INTO projects (
          id, user_id, title, source_url, source_platform, source_video_id, source_duration_seconds,
          requested_analysis_minutes, requested_clip_seconds, format, framing, prompt, caption_style, render_options,
          thumbnail_url, status, stage, progress, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'YouTube', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 'Aguardando processador', 1, ?, ?)`,
        [
          newId,
          user.id,
          row.title,
          row.source_url,
          row.source_video_id,
          row.source_duration_seconds,
          settings.analysisMinutes,
          settings.clipDuration,
          settings.format,
          settings.framing,
          settings.prompt,
          settings.captionStyle,
          settings.renderOptions,
          row.thumbnail_url,
          now,
          now,
        ],
      );
      return Response.json(
        { project: await getProject(user.id, newId), duplicated: true },
        { status: 201 },
      );
    }

    await execute("DELETE FROM clips WHERE project_id = ? AND user_id = ?", [
      id,
      user.id,
    ]);
    await execute(
      `UPDATE projects SET requested_analysis_minutes = ?, analysis_seconds = 0, requested_clip_seconds = ?,
        format = ?, framing = ?, prompt = ?, caption_style = ?, render_options = ?, status = 'queued', stage = 'Aguardando processador',
        progress = 1, error_message = NULL, cancel_requested = 0, credits_charged = 0,
        started_at = NULL, completed_at = NULL, updated_at = ? WHERE id = ? AND user_id = ?`,
      [
        settings.analysisMinutes,
        settings.clipDuration,
        settings.format,
        settings.framing,
        settings.prompt,
        settings.captionStyle,
        settings.renderOptions,
        now,
        id,
        user.id,
      ],
    );
    return Response.json({
      project: await getProject(user.id, id),
      retried: true,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível reutilizar o projeto.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const user = await userFromRequest(request);
    if (!user)
      return Response.json({ error: "Faça login novamente." }, { status: 401 });
    const { id } = await context.params;
    const row = await queryOne<{ status: string }>(
      "SELECT status FROM projects WHERE id = ? AND user_id = ? LIMIT 1",
      [id, user.id],
    );
    if (!row)
      return Response.json(
        { error: "Projeto não encontrado." },
        { status: 404 },
      );
    if (["ready", "failed", "cancelled"].includes(row.status)) {
      await execute("DELETE FROM projects WHERE id = ? AND user_id = ?", [
        id,
        user.id,
      ]);
      const runtimeProcess =
        typeof process !== "undefined" ? process : undefined;
      const getBuiltinModule =
        runtimeProcess?.getBuiltinModule?.bind(runtimeProcess);
      if (getBuiltinModule) {
        const fs = getBuiltinModule("node:fs") as typeof import("node:fs");
        const path = getBuiltinModule(
          "node:path",
        ) as typeof import("node:path");
        const databasePath =
          runtimeValue("STORMCAST_DB_PATH") ||
          path.resolve(process.cwd(), ".data/stormcast.db");
        const mediaRoot = path.resolve(
          runtimeValue("STORMCAST_MEDIA_DIR") ||
            path.join(path.dirname(databasePath), "media"),
        );
        for (const parent of [
          path.resolve(mediaRoot, "clips"),
          path.resolve(mediaRoot, "work"),
        ]) {
          const target = path.resolve(
            parent,
            ...(parent.endsWith(`${path.sep}clips`) ? [user.id, id] : [id]),
          );
          if (target.startsWith(parent + path.sep)) {
            try {
              fs.rmSync(target, { recursive: true, force: true });
            } catch {
              /* DB ownership is already removed. */
            }
          }
        }
        const transcript = path.resolve(
          mediaRoot,
          "transcripts",
          user.id,
          `${id}.json`,
        );
        if (transcript.startsWith(mediaRoot + path.sep)) {
          try {
            fs.rmSync(transcript, { force: true });
          } catch {
            /* Periodic cleanup can retry. */
          }
        }
      }
      return Response.json({ success: true, removed: true });
    }

    const now = Date.now();
    if (row.status === "queued") {
      await execute(
        "UPDATE projects SET status = 'cancelled', stage = 'Cancelado pelo usuário', progress = 0, cancel_requested = 1, updated_at = ?, completed_at = ? WHERE id = ? AND user_id = ?",
        [now, now, id, user.id],
      );
    } else {
      await execute(
        "UPDATE projects SET cancel_requested = 1, stage = 'Cancelamento solicitado', updated_at = ? WHERE id = ? AND user_id = ?",
        [now, id, user.id],
      );
    }
    return Response.json({ success: true });
  } catch {
    return Response.json(
      { error: "Não foi possível cancelar o processamento." },
      { status: 400 },
    );
  }
}
