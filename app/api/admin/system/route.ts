import { NextResponse } from "next/server";
import { assertSameOrigin, userFromRequest } from "../../../../lib/auth";
import {
  execute,
  queryAll,
  queryOne,
  runtimeValue,
} from "../../../../lib/database";
import { auditAdmin } from "../../../../lib/admin-audit";

export const dynamic = "force-dynamic";
const editableKeys = [
  "registration_enabled",
  "default_credits",
  "retention_days",
  "maintenance_mode",
  "global_notice",
  "site_title",
  "hero_eyebrow",
  "hero_title",
  "hero_description",
  "primary_button_text",
  "primary_button_link",
  "secondary_button_text",
  "secondary_button_link",
  "features_title",
  "plans_title",
  "plan_free_name",
  "plan_free_price",
  "plan_creator_name",
  "plan_creator_price",
  "plan_pro_name",
  "plan_pro_price",
  "faq_1_question",
  "faq_1_answer",
  "faq_2_question",
  "faq_2_answer",
  "logo_text",
  "primary_color",
  "social_youtube",
  "social_instagram",
  "social_tiktok",
  "terms_content",
  "privacy_content",
  "feature_vertical",
  "feature_captions",
  "feature_brandkit",
  "feature_payments",
  "openai_cost_per_minute",
  "ai_cost_per_minute",
];
async function admin(request: Request) {
  const user = await userFromRequest(request);
  return user?.role === "admin" ? user : null;
}
export async function GET(request: Request) {
  if (!(await admin(request)))
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  const [settings, counts, activeSessions, state, totals, providers] = await Promise.all([
    queryAll<{ key: string; value: string }>(
      "SELECT key,value FROM app_settings",
    ),
    queryAll<{ status: string; total: number }>(
      "SELECT status,COUNT(*) total FROM projects GROUP BY status",
    ),
    queryOne<{ total: number }>(
      "SELECT COUNT(*) total FROM sessions WHERE expires_at>?",
      [Date.now()],
    ),
    queryAll<{ key: string; value: string; updated_at: number }>(
      "SELECT key,value,updated_at FROM processor_state",
    ),
    queryOne<{ minutes: number; credits: number }>(
      "SELECT COALESCE(SUM(analysis_seconds)/60.0,0) minutes,COALESCE(SUM(credits_charged),0) credits FROM projects WHERE status='ready'",
    ),
    queryAll<{
      id: string;
      name: string;
      analysis_model: string;
      transcription_model: string;
    }>("SELECT id,name,analysis_model,transcription_model FROM ai_providers"),
  ]);
  const map = Object.fromEntries(
      settings.map((item) => [item.key, item.value]),
    ),
    processorState = Object.fromEntries(
      state.map((item) => [item.key, item.value]),
    ),
    heartbeat = Number(processorState.heartbeat || 0),
    costPerMinute = Number(map.ai_cost_per_minute || map.openai_cost_per_minute || 0.008),
    analysisProvider = providers.find((item) => item.id === (map.analysis_provider_id || "openai")),
    transcriptionProvider = providers.find((item) => item.id === (map.transcription_provider_id || "openai"));
  return NextResponse.json(
    {
      settings: {
        ...map,
        registration_enabled:
          map.registration_enabled ??
          (runtimeValue("STORMCAST_DISABLE_REGISTRATION") === "1" ? "0" : "1"),
        default_credits: map.default_credits ?? "120",
        retention_days: map.retention_days ?? "30",
        maintenance_mode: map.maintenance_mode ?? "0",
        primary_color: map.primary_color ?? "#7c3cff",
      },
      processor: {
        enabled: runtimeValue("STORMCAST_PROCESSOR_ENABLED") !== "0",
        healthy: Boolean(heartbeat && Date.now() - heartbeat < 60000),
        heartbeat,
        lastError: processorState.last_error || "",
        analysisProvider: analysisProvider?.name || "OpenAI",
        analysisModel: analysisProvider?.analysis_model || runtimeValue("OPENAI_ANALYSIS_MODEL") || "gpt-5-mini",
        transcriptionProvider: transcriptionProvider?.name || "OpenAI",
        transcriptionModel:
          transcriptionProvider?.transcription_model || runtimeValue("OPENAI_TRANSCRIPTION_MODEL") || "whisper-1",
        mediaDirectory: runtimeValue("STORMCAST_MEDIA_DIR") || ".data/media",
        ytdlpConfigured: Boolean(runtimeValue("STORMCAST_YTDLP_PATH")),
        ffmpegConfigured: Boolean(runtimeValue("STORMCAST_FFMPEG_PATH")),
      },
      projects: Object.fromEntries(
        counts.map((item) => [item.status, Number(item.total)]),
      ),
      activeSessions: Number(activeSessions?.total || 0),
      sessionDays: Math.max(
        1,
        Number(runtimeValue("STORMCAST_SESSION_DAYS") || 30),
      ),
      usage: {
        minutes: Number(totals?.minutes || 0),
        credits: Number(totals?.credits || 0),
        estimatedAiCost: Number(totals?.minutes || 0) * costPerMinute,
        costPerMinute,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const current = await admin(request);
    if (!current)
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>,
      now = Date.now(),
      changed: string[] = [];
    for (const key of editableKeys) {
      if (!(key in body)) continue;
      let value = String(body[key] ?? "")
        .trim()
        .slice(0, key.endsWith("_content") ? 12000 : 1000);
      if (
        [
          "registration_enabled",
          "maintenance_mode",
          "feature_vertical",
          "feature_captions",
          "feature_brandkit",
          "feature_payments",
        ].includes(key)
      )
        value = body[key] === true || value === "1" ? "1" : "0";
      if (["default_credits", "retention_days"].includes(key))
        value = String(
          Math.max(0, Math.min(100000, Math.trunc(Number(value) || 0))),
        );
      if (key === "primary_color" && !/^#[0-9a-f]{6}$/i.test(value)) continue;
      await execute(
        "INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
        [key, value, now],
      );
      changed.push(key);
    }
    await auditAdmin(current.id, "settings.update", "system", null, {
      changed,
    });
    return NextResponse.json({ ok: true, changed });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível salvar as configurações." },
      { status: 400 },
    );
  }
}
