"use client";

import {
  BrainCircuit,
  CheckCircle2,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Unplug,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Provider = {
  id: string;
  name: string;
  baseUrl: string;
  keyHint: string;
  configured: boolean;
  keySource: "admin" | "environment" | "none";
  analysisModel: string;
  transcriptionModel: string;
  supportsAnalysis: boolean;
  supportsTranscription: boolean;
  enabled: boolean;
  builtIn: boolean;
  note: string;
  tier: string;
};

type Payload = {
  providers: Provider[];
  selection: { analysisProviderId: string; transcriptionProviderId: string };
  secretsConfigured: boolean;
};

const emptyPayload: Payload = {
  providers: [],
  selection: { analysisProviderId: "openai", transcriptionProviderId: "openai" },
  secretsConfigured: false,
};

export default function AiProvidersPanel() {
  const [data, setData] = useState<Payload>(emptyPayload);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [custom, setCustom] = useState({
    name: "",
    baseUrl: "https://",
    analysisModel: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/ai-providers", { cache: "no-store" });
      const payload = (await response.json()) as Payload & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Falha ao carregar provedores.");
      setData(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao carregar provedores.");
      setSuccess(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch updates state asynchronously
    void load();
  }, [load]);

  function update(id: string, change: Partial<Provider>) {
    setData((current) => ({
      ...current,
      providers: current.providers.map((provider) =>
        provider.id === id ? { ...provider, ...change } : provider,
      ),
    }));
  }

  async function apiRequest(path: string, method: string, body: unknown, action: string) {
    setBusy(action);
    setMessage("");
    setSuccess(false);
    try {
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as Partial<Payload> & {
        error?: string;
        message?: string;
        models?: string[];
      };
      if (!response.ok) throw new Error(payload.error || "Não foi possível concluir.");
      if (payload.providers && payload.selection) setData(payload as Payload);
      setMessage(
        payload.message ||
          (payload.models?.length ? `Conexão confirmada. Modelos encontrados: ${payload.models.join(", ")}.` : "Configuração salva."),
      );
      setSuccess(true);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function saveProvider(provider: Provider) {
    const ok = await apiRequest(
      "/api/admin/ai-providers",
      "PATCH",
      { ...provider, apiKey: apiKeys[provider.id] || "" },
      `save:${provider.id}`,
    );
    if (ok) setApiKeys((current) => ({ ...current, [provider.id]: "" }));
  }

  async function testProvider(provider: Provider) {
    await apiRequest(
      "/api/admin/ai-providers",
      "POST",
      {
        action: "test",
        id: provider.id,
        baseUrl: provider.baseUrl,
        apiKey: apiKeys[provider.id] || "",
      },
      `test:${provider.id}`,
    );
  }

  async function saveSelection() {
    await apiRequest(
      "/api/admin/ai-providers",
      "PATCH",
      { selection: data.selection },
      "selection",
    );
  }

  async function clearProvider(provider: Provider) {
    const label = provider.builtIn ? "remover a chave salva" : "excluir este provedor";
    if (!confirm(`Deseja ${label} da ${provider.name}?`)) return;
    await apiRequest(
      "/api/admin/ai-providers",
      "DELETE",
      { id: provider.id, clearKey: provider.builtIn },
      `delete:${provider.id}`,
    );
  }

  async function createCustom(event: React.FormEvent) {
    event.preventDefault();
    const ok = await apiRequest(
      "/api/admin/ai-providers",
      "POST",
      { action: "create", ...custom },
      "create",
    );
    if (ok) {
      setShowCustom(false);
      setCustom({ name: "", baseUrl: "https://", analysisModel: "" });
    }
  }

  const analysisProviders = useMemo(
    () => data.providers.filter((provider) => provider.enabled && provider.configured && provider.supportsAnalysis),
    [data.providers],
  );
  const transcriptionProviders = useMemo(
    () => data.providers.filter((provider) => provider.enabled && provider.configured && provider.supportsTranscription),
    [data.providers],
  );

  return (
    <div className="ai-admin">
      {!data.secretsConfigured && !loading && (
        <div className="ai-master-warning">
          <KeyRound />
          <div>
            <strong>Proteção de chaves ainda não ativada</strong>
            <span>
              Configure STORMCAST_SECRETS_KEY na VPS. A chave atual da OpenAI continua funcionando pelo arquivo de ambiente, mas novas chaves só poderão ser salvas depois disso.
            </span>
          </div>
        </div>
      )}

      {message && (
        <div className={`ai-feedback ${success ? "success" : "error"}`}>
          {success ? <CheckCircle2 /> : <Unplug />}
          <span>{message}</span>
        </div>
      )}

      <section className="ai-routing-card">
        <div className="ai-section-head">
          <div>
            <span>ROTEAMENTO POR ETAPA</span>
            <h2>Escolha quem transcreve e quem analisa</h2>
            <p>A troca vale para os próximos projetos. Um projeto em andamento termina com a configuração que carregou ao iniciar.</p>
          </div>
          <button type="button" onClick={load} disabled={loading} className="ai-secondary">
            <RefreshCw className={loading ? "spin" : ""} /> Atualizar
          </button>
        </div>
        <div className="ai-routing-grid">
          <label>
            <span>ANÁLISE E SELEÇÃO DOS CORTES</span>
            <select
              value={data.selection.analysisProviderId}
              onChange={(event) =>
                setData((current) => ({
                  ...current,
                  selection: { ...current.selection, analysisProviderId: event.target.value },
                }))
              }
            >
              {analysisProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} · {provider.analysisModel}
                </option>
              ))}
            </select>
            {!analysisProviders.length && <small>Ative e configure pelo menos um provedor de análise.</small>}
          </label>
          <label>
            <span>TRANSCRIÇÃO DO ÁUDIO</span>
            <select
              value={data.selection.transcriptionProviderId}
              onChange={(event) =>
                setData((current) => ({
                  ...current,
                  selection: { ...current.selection, transcriptionProviderId: event.target.value },
                }))
              }
            >
              {transcriptionProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} · {provider.transcriptionModel}
                </option>
              ))}
            </select>
            {!transcriptionProviders.length && <small>Ative OpenAI ou Groq para transcrever.</small>}
          </label>
          <button
            type="button"
            className="admin-primary"
            disabled={busy === "selection" || !analysisProviders.length || !transcriptionProviders.length}
            onClick={saveSelection}
          >
            <BrainCircuit /> Aplicar roteamento
          </button>
        </div>
      </section>

      <div className="ai-provider-head">
        <div>
          <span>PROVEDORES</span>
          <h2>Chaves e modelos</h2>
        </div>
        <button type="button" className="ai-secondary" onClick={() => setShowCustom((value) => !value)}>
          <Plus /> Compatível personalizado
        </button>
      </div>

      {showCustom && (
        <form className="ai-custom-form" onSubmit={createCustom}>
          <label>
            Nome
            <input required value={custom.name} onChange={(event) => setCustom({ ...custom, name: event.target.value })} />
          </label>
          <label>
            URL base OpenAI-compatible
            <input required value={custom.baseUrl} onChange={(event) => setCustom({ ...custom, baseUrl: event.target.value })} />
          </label>
          <label>
            Modelo de análise
            <input required value={custom.analysisModel} onChange={(event) => setCustom({ ...custom, analysisModel: event.target.value })} />
          </label>
          <button className="admin-primary" disabled={busy === "create"}>Criar provedor</button>
        </form>
      )}

      <div className="ai-provider-grid">
        {data.providers.map((provider) => (
          <article className={`ai-provider-card ${provider.enabled ? "enabled" : ""}`} key={provider.id}>
            <header>
              <div className="ai-provider-logo"><BrainCircuit /></div>
              <div>
                <h3>{provider.name}</h3>
                <span>{provider.tier}</span>
              </div>
              <label className="ai-provider-switch" title="Ativar provedor">
                <input
                  type="checkbox"
                  checked={provider.enabled}
                  onChange={(event) => update(provider.id, { enabled: event.target.checked })}
                />
                <i />
              </label>
            </header>
            <p>{provider.note}</p>
            <div className="ai-capabilities">
              {provider.supportsAnalysis && <span>Análise</span>}
              {provider.supportsTranscription && <span>Transcrição</span>}
              <span className={provider.configured ? "configured" : "missing"}>
                {provider.configured ? `Chave ${provider.keyHint}` : "Sem chave"}
              </span>
            </div>
            {!provider.builtIn && (
              <label className="admin-field">
                Nome
                <input value={provider.name} onChange={(event) => update(provider.id, { name: event.target.value })} />
              </label>
            )}
            <label className="admin-field ai-wide-field">
              URL base
              <input
                value={provider.baseUrl}
                disabled={provider.builtIn}
                onChange={(event) => update(provider.id, { baseUrl: event.target.value })}
              />
            </label>
            <label className="admin-field ai-wide-field">
              Chave da API
              <input
                type="password"
                autoComplete="new-password"
                placeholder={provider.configured ? "Deixe vazio para manter a chave atual" : "Cole a chave aqui"}
                value={apiKeys[provider.id] || ""}
                onChange={(event) => setApiKeys((current) => ({ ...current, [provider.id]: event.target.value }))}
              />
              <small>A chave nunca volta ao navegador depois de salva.</small>
            </label>
            {provider.supportsAnalysis && (
              <label className="admin-field ai-wide-field">
                Modelo de análise
                <input
                  value={provider.analysisModel}
                  onChange={(event) => update(provider.id, { analysisModel: event.target.value })}
                />
              </label>
            )}
            {provider.supportsTranscription && (
              <label className="admin-field ai-wide-field">
                Modelo de transcrição
                <input
                  value={provider.transcriptionModel}
                  onChange={(event) => update(provider.id, { transcriptionModel: event.target.value })}
                />
              </label>
            )}
            <footer>
              <button
                type="button"
                className="ai-secondary"
                disabled={busy === `test:${provider.id}`}
                onClick={() => testProvider(provider)}
              >
                <ShieldCheck /> Testar
              </button>
              <button
                type="button"
                className="admin-primary"
                disabled={busy === `save:${provider.id}`}
                onClick={() => saveProvider(provider)}
              >
                <Save /> Salvar
              </button>
              {(provider.configured || !provider.builtIn) && (
                <button
                  type="button"
                  className="ai-danger"
                  disabled={busy === `delete:${provider.id}`}
                  onClick={() => clearProvider(provider)}
                  title={provider.builtIn ? "Remover chave salva" : "Excluir provedor"}
                >
                  <Trash2 />
                </button>
              )}
            </footer>
          </article>
        ))}
      </div>
      <p className="ai-free-note">
        “Free tier” e “free router” dependem das regras, cotas e disponibilidade de cada empresa. Para produção, mantenha saldo ou um segundo provedor pronto para troca rápida.
      </p>
    </div>
  );
}
