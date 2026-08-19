import { NextResponse } from "next/server";
import { auditAdmin } from "../../../../lib/admin-audit";
import {
  AI_PROVIDER_PRESETS,
  AiProviderRow,
  allAiProviders,
  ensureAiProviderPresets,
  hasEnvironmentKey,
  normalizeProviderUrl,
  providerApiKey,
  selectedProviderId,
} from "../../../../lib/ai-providers";
import { assertSameOrigin, userFromRequest } from "../../../../lib/auth";
import { execute, queryOne } from "../../../../lib/database";
import { randomToken } from "../../../../lib/security";
import { encryptSecret, secretHint, secretsConfigured } from "../../../../lib/secrets";

export const dynamic = "force-dynamic";

async function admin(request: Request) {
  const user = await userFromRequest(request);
  return user?.role === "admin" ? user : null;
}

function text(value: unknown, maximum = 160) {
  return String(value ?? "").trim().slice(0, maximum);
}

function preset(id: string) {
  return AI_PROVIDER_PRESETS.find((item) => item.id === id);
}

async function providerRow(id: string) {
  await ensureAiProviderPresets();
  return queryOne<AiProviderRow>("SELECT * FROM ai_providers WHERE id=? LIMIT 1", [id]);
}

async function publicPayload() {
  const [providers, analysisProviderId, transcriptionProviderId] = await Promise.all([
    allAiProviders(),
    selectedProviderId("analysis"),
    selectedProviderId("transcription"),
  ]);
  return {
    providers: providers.map((provider) => {
      const details = preset(provider.id);
      const environmentKey = hasEnvironmentKey(provider.id) && !provider.api_key_encrypted;
      return {
        id: provider.id,
        name: provider.name,
        baseUrl: provider.base_url,
        keyHint: provider.api_key_hint || (environmentKey ? "Definida no servidor" : ""),
        configured: Boolean(provider.api_key_encrypted || environmentKey),
        keySource: provider.api_key_encrypted ? "admin" : environmentKey ? "environment" : "none",
        analysisModel: provider.analysis_model,
        transcriptionModel: provider.transcription_model,
        supportsAnalysis: Boolean(provider.supports_analysis),
        supportsTranscription: Boolean(provider.supports_transcription),
        enabled: Boolean(provider.enabled),
        builtIn: Boolean(provider.built_in),
        note: details?.note || "Provedor compatível com a API da OpenAI.",
        tier: details?.tier || "Personalizado",
      };
    }),
    selection: { analysisProviderId, transcriptionProviderId },
    secretsConfigured: secretsConfigured(),
  };
}

export async function GET(request: Request) {
  if (!(await admin(request))) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }
  return NextResponse.json(await publicPayload(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const current = await admin(request);
    if (!current) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    if (body.action === "create") {
      const name = text(body.name, 80);
      if (name.length < 2) throw new Error("Informe o nome do provedor.");
      const id = `custom-${randomToken(8)}`;
      await execute(
        `INSERT INTO ai_providers
         (id,name,base_url,analysis_model,transcription_model,supports_analysis,supports_transcription,enabled,built_in,created_at,updated_at)
         VALUES (?,?,?,?,?,1,0,0,0,?,?)`,
        [id, name, normalizeProviderUrl(text(body.baseUrl, 500)), text(body.analysisModel), "", Date.now(), Date.now()],
      );
      await auditAdmin(current.id, "ai_provider.create", "ai_provider", id, { name });
      return NextResponse.json({ ok: true, ...(await publicPayload()) });
    }
    if (body.action !== "test") throw new Error("Ação inválida.");
    const id = text(body.id, 80);
    const provider = await providerRow(id);
    if (!provider) throw new Error("Provedor não encontrado.");
    const baseUrl = provider.built_in
      ? provider.base_url
      : normalizeProviderUrl(text(body.baseUrl || provider.base_url, 500));
    const suppliedKey = text(body.apiKey, 500);
    const apiKey = suppliedKey || (await providerApiKey(provider));
    if (!apiKey) throw new Error(`Cadastre a chave da ${provider.name} antes de testar.`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as
        | { data?: Array<{ id?: string }>; error?: { message?: string } }
        | null;
      if (!response.ok) {
        throw new Error(
          `${provider.name} (${response.status}): ${text(payload?.error?.message || "a conexão foi recusada", 300)}`,
        );
      }
      const models = (payload?.data || []).map((item) => item.id).filter(Boolean).slice(0, 8);
      await auditAdmin(current.id, "ai_provider.test", "ai_provider", id, { ok: true });
      return NextResponse.json({ ok: true, message: `Conexão com ${provider.name} confirmada.`, models });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "O provedor excedeu 20 segundos no teste de conexão."
      : error instanceof Error
        ? error.message
        : "Não foi possível testar o provedor.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const current = await admin(request);
    if (!current) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    if (body.selection && typeof body.selection === "object") {
      const selection = body.selection as Record<string, unknown>;
      const analysisId = text(selection.analysisProviderId, 80);
      const transcriptionId = text(selection.transcriptionProviderId, 80);
      const [analysis, transcription] = await Promise.all([providerRow(analysisId), providerRow(transcriptionId)]);
      if (!analysis || !analysis.enabled || !analysis.supports_analysis) throw new Error("Escolha um provedor de análise ativo.");
      if (!transcription || !transcription.enabled || !transcription.supports_transcription) throw new Error("Escolha um provedor de transcrição ativo.");
      if (!(analysis.api_key_encrypted || hasEnvironmentKey(analysis.id))) throw new Error(`Cadastre a chave da ${analysis.name}.`);
      if (!(transcription.api_key_encrypted || hasEnvironmentKey(transcription.id))) throw new Error(`Cadastre a chave da ${transcription.name}.`);
      const now = Date.now();
      await execute(
        "INSERT INTO app_settings (key,value,updated_at) VALUES ('analysis_provider_id',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
        [analysisId, now],
      );
      await execute(
        "INSERT INTO app_settings (key,value,updated_at) VALUES ('transcription_provider_id',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
        [transcriptionId, now],
      );
      await auditAdmin(current.id, "ai_provider.selection", "system", null, { analysisId, transcriptionId });
      return NextResponse.json({ ok: true, ...(await publicPayload()) });
    }

    const id = text(body.id, 80);
    const provider = await providerRow(id);
    if (!provider) throw new Error("Provedor não encontrado.");
    const builtIn = Boolean(provider.built_in);
    const apiKey = text(body.apiKey, 500);
    const name = builtIn ? provider.name : text(body.name || provider.name, 80);
    const baseUrl = builtIn ? provider.base_url : normalizeProviderUrl(text(body.baseUrl || provider.base_url, 500));
    const analysisModel = text(body.analysisModel, 160);
    const transcriptionModel = text(body.transcriptionModel, 160);
    const supportsAnalysis = builtIn ? Number(provider.supports_analysis) : body.supportsAnalysis === false ? 0 : 1;
    const supportsTranscription = builtIn ? Number(provider.supports_transcription) : body.supportsTranscription === true ? 1 : 0;
    const enabled = body.enabled === true ? 1 : 0;
    if (supportsAnalysis && !analysisModel) throw new Error("Informe o modelo de análise.");
    if (supportsTranscription && !transcriptionModel) throw new Error("Informe o modelo de transcrição.");
    let encrypted = provider.api_key_encrypted;
    let hint = provider.api_key_hint;
    if (apiKey) {
      encrypted = await encryptSecret(apiKey);
      hint = secretHint(apiKey);
    }
    if (enabled && !(encrypted || hasEnvironmentKey(id))) throw new Error("Cadastre a chave de API antes de ativar o provedor.");
    await execute(
      `UPDATE ai_providers SET name=?,base_url=?,api_key_encrypted=?,api_key_hint=?,analysis_model=?,transcription_model=?,
       supports_analysis=?,supports_transcription=?,enabled=?,updated_at=? WHERE id=?`,
      [name, baseUrl, encrypted, hint, analysisModel, transcriptionModel, supportsAnalysis, supportsTranscription, enabled, Date.now(), id],
    );
    await auditAdmin(current.id, "ai_provider.update", "ai_provider", id, {
      name,
      enabled: Boolean(enabled),
      analysisModel,
      transcriptionModel,
      keyChanged: Boolean(apiKey),
    });
    return NextResponse.json({ ok: true, ...(await publicPayload()) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível salvar o provedor." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const current = await admin(request);
    if (!current) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const id = text(body.id, 80);
    const provider = await providerRow(id);
    if (!provider) throw new Error("Provedor não encontrado.");
    if (provider.built_in || body.clearKey === true) {
      await execute("UPDATE ai_providers SET api_key_encrypted=NULL,api_key_hint=NULL,enabled=CASE WHEN id='openai' THEN enabled ELSE 0 END,updated_at=? WHERE id=?", [Date.now(), id]);
      await auditAdmin(current.id, "ai_provider.key_clear", "ai_provider", id);
    } else {
      const [analysisId, transcriptionId] = await Promise.all([
        selectedProviderId("analysis"),
        selectedProviderId("transcription"),
      ]);
      if ([analysisId, transcriptionId].includes(id)) throw new Error("Troque o provedor ativo antes de excluir este registro.");
      await execute("DELETE FROM ai_providers WHERE id=?", [id]);
      await auditAdmin(current.id, "ai_provider.delete", "ai_provider", id);
    }
    return NextResponse.json({ ok: true, ...(await publicPayload()) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível excluir o provedor." },
      { status: 400 },
    );
  }
}
