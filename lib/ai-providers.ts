import { execute, queryAll, queryOne, runtimeValue } from "./database";
import { decryptSecret } from "./secrets";

export const AI_PROVIDER_PRESETS = [
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    analysisModel: "gpt-5-mini",
    transcriptionModel: "whisper-1",
    supportsAnalysis: true,
    supportsTranscription: true,
    enabled: true,
    note: "Qualidade estável para análise e transcrição.",
    tier: "Pago",
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    analysisModel: "openai/gpt-oss-120b",
    transcriptionModel: "whisper-large-v3-turbo",
    supportsAnalysis: true,
    supportsTranscription: true,
    enabled: false,
    note: "Muito rápido; oferece limites gratuitos sujeitos à conta.",
    tier: "Free tier",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    analysisModel: "deepseek-v4-flash",
    transcriptionModel: "",
    supportsAnalysis: true,
    supportsTranscription: false,
    enabled: false,
    note: "Alternativa econômica para selecionar e estruturar cortes.",
    tier: "Pago",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    analysisModel: "gemini-3.7-flash",
    transcriptionModel: "",
    supportsAnalysis: true,
    supportsTranscription: false,
    enabled: false,
    note: "Compatibilidade OpenAI e cota gratuita sujeita aos limites do Google.",
    tier: "Free tier",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    analysisModel: "openrouter/free",
    transcriptionModel: "",
    supportsAnalysis: true,
    supportsTranscription: false,
    enabled: false,
    note: "Roteia entre modelos; openrouter/free é indicado para testes e baixo volume.",
    tier: "Free router",
  },
] as const;

export type AiProviderRow = {
  id: string;
  name: string;
  base_url: string;
  api_key_encrypted: string | null;
  api_key_hint: string | null;
  analysis_model: string;
  transcription_model: string;
  supports_analysis: number;
  supports_transcription: number;
  enabled: number;
  built_in: number;
  created_at: number;
  updated_at: number;
};

export type ActiveAiProvider = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  analysisModel: string;
  transcriptionModel: string;
  supportsAnalysis: boolean;
  supportsTranscription: boolean;
};

export function normalizeProviderUrl(value: string) {
  const clean = value.trim().replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(clean);
  } catch {
    throw new Error("A URL base do provedor é inválida.");
  }
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("A URL do provedor deve usar HTTPS (HTTP é aceito apenas no localhost). ");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("A URL do provedor não pode conter credenciais, parâmetros ou fragmentos.");
  }
  return clean;
}

export async function ensureAiProviderPresets() {
  const now = Date.now();
  for (const provider of AI_PROVIDER_PRESETS) {
    await execute(
      `INSERT INTO ai_providers
       (id,name,base_url,analysis_model,transcription_model,supports_analysis,supports_transcription,enabled,built_in,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,1,?,?) ON CONFLICT(id) DO NOTHING`,
      [
        provider.id,
        provider.name,
        provider.baseUrl,
        provider.analysisModel,
        provider.transcriptionModel,
        provider.supportsAnalysis ? 1 : 0,
        provider.supportsTranscription ? 1 : 0,
        provider.enabled ? 1 : 0,
        now,
        now,
      ],
    );
  }
}

export async function allAiProviders() {
  await ensureAiProviderPresets();
  return queryAll<AiProviderRow>(
    "SELECT * FROM ai_providers ORDER BY built_in DESC, created_at ASC, name ASC",
  );
}

export function hasEnvironmentKey(providerId: string) {
  return providerId === "openai" && Boolean(runtimeValue("OPENAI_API_KEY"));
}

export async function providerApiKey(provider: AiProviderRow) {
  if (provider.api_key_encrypted) return decryptSecret(provider.api_key_encrypted);
  if (provider.id === "openai") return runtimeValue("OPENAI_API_KEY");
  return "";
}

export async function selectedProviderId(capability: "analysis" | "transcription") {
  const key = capability === "analysis" ? "analysis_provider_id" : "transcription_provider_id";
  const row = await queryOne<{ value: string }>("SELECT value FROM app_settings WHERE key=?", [key]);
  return row?.value || "openai";
}

export async function activeAiProvider(capability: "analysis" | "transcription") {
  await ensureAiProviderPresets();
  const id = await selectedProviderId(capability);
  const provider = await queryOne<AiProviderRow>("SELECT * FROM ai_providers WHERE id=? LIMIT 1", [id]);
  if (!provider || !Number(provider.enabled)) {
    throw new Error(`O provedor de ${capability === "analysis" ? "análise" : "transcrição"} selecionado não está ativo.`);
  }
  if (capability === "analysis" && !Number(provider.supports_analysis)) {
    throw new Error(`${provider.name} não oferece análise de texto nesta integração.`);
  }
  if (capability === "transcription" && !Number(provider.supports_transcription)) {
    throw new Error(`${provider.name} não oferece transcrição nesta integração.`);
  }
  const apiKey = await providerApiKey(provider);
  if (!apiKey) throw new Error(`A chave de API da ${provider.name} ainda não foi configurada.`);
  const analysisModel = provider.analysis_model || (provider.id === "openai" ? runtimeValue("OPENAI_ANALYSIS_MODEL") : "");
  const transcriptionModel = provider.transcription_model || (provider.id === "openai" ? runtimeValue("OPENAI_TRANSCRIPTION_MODEL") : "");
  if (capability === "analysis" && !analysisModel) throw new Error(`Defina o modelo de análise da ${provider.name}.`);
  if (capability === "transcription" && !transcriptionModel) throw new Error(`Defina o modelo de transcrição da ${provider.name}.`);
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: normalizeProviderUrl(provider.base_url),
    apiKey,
    analysisModel,
    transcriptionModel,
    supportsAnalysis: Boolean(provider.supports_analysis),
    supportsTranscription: Boolean(provider.supports_transcription),
  } satisfies ActiveAiProvider;
}
