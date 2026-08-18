"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- native links avoid a Vinext dev hydration conflict */
import {
  Activity,
  ArrowLeft,
  Coins,
  FileClock,
  FolderKanban,
  Gauge,
  Globe2,
  HardDrive,
  KeyRound,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
  UserX,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../../lib/auth";

type View =
  "users" | "projects" | "media" | "activity" | "system" | "site" | "security";
type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  status: "active" | "suspended";
  credits: number;
  createdAt: number;
  lastLoginAt: number | null;
  projectCount: number;
  clipCount: number;
  sessionCount: number;
  forcePasswordChange: boolean;
  plan: string;
  monthlyCreditLimit: number;
  maxActiveProjects: number;
};
type Project = {
  id: string;
  ownerName: string;
  ownerEmail: string;
  title: string;
  sourcePlatform: string;
  format: string;
  framing: string;
  status: string;
  stage: string;
  progress: number;
  creditsCharged: number;
  createdAt: number;
  clipCount: number;
  errorMessage: string | null;
};
type SystemData = {
  settings: Record<string, string>;
  processor: {
    enabled: boolean;
    healthy: boolean;
    heartbeat: number;
    lastError: string;
    analysisModel: string;
    transcriptionModel: string;
    mediaDirectory: string;
    ytdlpConfigured: boolean;
    ffmpegConfigured: boolean;
  };
  projects: Record<string, number>;
  activeSessions: number;
  sessionDays: number;
  usage: {
    minutes: number;
    credits: number;
    estimatedOpenAiCost: number;
    costPerMinute: number;
  };
};
type MediaData = {
  supported: boolean;
  users: Array<{ id: string; name: string; email: string; bytes: number }>;
  totalBytes: number;
  tempBytes: number;
  disk?: { freeBytes: number; totalBytes: number };
  mediaDirectory?: string;
  retentionDays: number;
  clips: Array<{ id: string; title: string; ownerName: string; size: number }>;
  temporary: Array<{ name: string; size: number; updatedAt: number }>;
};
type ActivityData = {
  audit: Array<Record<string, unknown>>;
  credits: Array<Record<string, unknown>>;
  failures: Array<Record<string, unknown>>;
};
const activeStatuses = [
  "queued",
  "downloading",
  "transcribing",
  "analyzing",
  "rendering",
];
const labels: Record<string, string> = {
  queued: "Na fila",
  downloading: "Baixando",
  transcribing: "Transcrevendo",
  analyzing: "Analisando",
  rendering: "Renderizando",
  ready: "Pronto",
  failed: "Falhou",
  cancelled: "Cancelado",
};
const bytes = (value: number) =>
  value > 1024 ** 3
    ? `${(value / 1024 ** 3).toFixed(2)} GB`
    : value > 1024 ** 2
      ? `${(value / 1024 ** 2).toFixed(1)} MB`
      : `${Math.round(value / 1024)} KB`;
const date = (value: number | null | unknown) =>
  typeof value === "number" && value
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

export default function AdminClient({ admin }: { admin: AuthUser }) {
  const [view, setView] = useState<View>("users"),
    [users, setUsers] = useState<ManagedUser[]>([]),
    [projects, setProjects] = useState<Project[]>([]),
    [system, setSystem] = useState<SystemData | null>(null),
    [media, setMedia] = useState<MediaData | null>(null),
    [activity, setActivity] = useState<ActivityData | null>(null);
  const [query, setQuery] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    credits: "120",
    role: "user",
  });
  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const path =
        view === "users"
          ? "users"
          : view === "projects"
            ? "projects"
            : view === "media"
              ? "media"
              : view === "activity"
                ? "activity"
                : "system";
      const [response, systemResponse] = await Promise.all([
          fetch(`/api/admin/${path}`, { cache: "no-store" }),
          path === "media"
            ? fetch("/api/admin/system", { cache: "no-store" })
            : Promise.resolve(null),
        ]),
        data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao carregar.");
      if (Array.isArray(data.users)) setUsers(data.users);
      if (Array.isArray(data.projects)) setProjects(data.projects);
      if (data.settings) setSystem(data);
      if (path === "media") setMedia(data);
      if (path === "activity") setActivity(data);
      if (systemResponse?.ok) setSystem(await systemResponse.json());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [view]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  async function request(path: string, method: string, body: unknown) {
    setBusy(path);
    setMessage("");
    try {
      const response = await fetch(path, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível concluir.");
      await load();
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível concluir.",
      );
      return false;
    } finally {
      setBusy("");
    }
  }
  const filteredUsers = useMemo(
    () =>
      users.filter((user) =>
        `${user.name} ${user.email} ${user.plan}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [users, query],
  );
  const filteredProjects = useMemo(
    () =>
      projects.filter((project) =>
        `${project.title} ${project.ownerName} ${project.status}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [projects, query],
  );
  async function userAction(user: ManagedUser, action: string) {
    if (action === "credits") {
      const amount = prompt("Novo saldo:", String(user.credits));
      if (amount === null) return;
      const reason =
        prompt("Motivo do ajuste:", "Ajuste administrativo") ||
        "Ajuste administrativo";
      await request("/api/admin/users", "PATCH", {
        userId: user.id,
        action: "set_credits",
        amount: Number(amount),
        reason,
      });
      return;
    }
    if (action === "password") {
      const password = prompt(
        "Senha temporária (mínimo 10 caracteres, letras e números):",
      );
      if (password)
        await request("/api/admin/users", "PATCH", {
          userId: user.id,
          action: "reset_password",
          password,
          forcePasswordChange: true,
        });
      return;
    }
    if (action === "profile") {
      const name = prompt("Nome:", user.name),
        email = name && prompt("E-mail:", user.email);
      if (name && email)
        await request("/api/admin/users", "PATCH", {
          userId: user.id,
          action: "update_profile",
          name,
          email,
        });
      return;
    }
    if (action === "limits") {
      const plan = prompt("Plano: free, creator ou pro", user.plan),
        monthly =
          plan && prompt("Limite mensal:", String(user.monthlyCreditLimit)),
        active =
          monthly &&
          prompt("Projetos simultâneos:", String(user.maxActiveProjects));
      if (plan && monthly && active)
        await request("/api/admin/users", "PATCH", {
          userId: user.id,
          action: "set_limits",
          plan,
          monthlyCreditLimit: Number(monthly),
          maxActiveProjects: Number(active),
        });
      return;
    }
    if (
      ["suspend", "logout_all"].includes(action) &&
      !confirm("Confirmar esta ação?")
    )
      return;
    await request("/api/admin/users", "PATCH", { userId: user.id, action });
  }
  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    if (
      await request("/api/admin/users", "POST", {
        ...newUser,
        credits: Number(newUser.credits),
        forcePasswordChange: true,
      })
    ) {
      setShowCreate(false);
      setNewUser({
        name: "",
        email: "",
        password: "",
        credits: "120",
        role: "user",
      });
    }
  }
  async function deleteUser(user: ManagedUser) {
    if (confirm(`Excluir definitivamente ${user.name} e seus projetos?`))
      await request("/api/admin/users", "DELETE", { userId: user.id });
  }
  async function projectAction(
    project: Project,
    action: "cancel" | "retry" | "delete",
  ) {
    if (
      !confirm(
        `${action === "delete" ? "Excluir" : action === "retry" ? "Reprocessar" : "Cancelar"} “${project.title}”?`,
      )
    )
      return;
    await request(
      "/api/admin/projects",
      action === "delete" ? "DELETE" : "PATCH",
      { projectId: project.id, ...(action !== "delete" ? { action } : {}) },
    );
  }
  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    if (system) await request("/api/admin/system", "PATCH", system.settings);
  }
  function setting(key: string, value: string) {
    if (system)
      setSystem({ ...system, settings: { ...system.settings, [key]: value } });
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    location.assign("/");
  }
  const title = {
    users: ["CONTROLE DE ACESSO", "Pessoas e permissões"],
    projects: ["OPERAÇÃO", "Projetos e cortes"],
    media: ["ARMAZENAMENTO", "Mídia e retenção"],
    activity: ["RASTREABILIDADE", "Histórico e auditoria"],
    system: ["CONFIGURAÇÃO", "Sistema e processador"],
    site: ["FRONTEND", "Site público"],
    security: ["SEGURANÇA", "Sessões e política de acesso"],
  }[view];
  const userSummary = {
    total: users.length,
    active: users.filter((u) => u.status === "active").length,
    credits: users.reduce((sum, u) => sum + u.credits, 0),
    sessions: users.reduce((sum, u) => sum + u.sessionCount, 0),
  };
  const projectSummary = {
    total: projects.length,
    active: projects.filter((p) => activeStatuses.includes(p.status)).length,
    ready: projects.filter((p) => p.status === "ready").length,
    clips: projects.reduce((sum, p) => sum + p.clipCount, 0),
  };
  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <a href="/" className="admin-logo">
          <span className="brand-mark">
            <span />
          </span>
          <span>
            <strong>StormCast</strong>
            <small>CONTROL ROOM</small>
          </span>
        </a>
        <nav>
          <span>GESTÃO</span>
          <button
            className={view === "users" ? "active" : ""}
            onClick={() => setView("users")}
          >
            <Users />
            Usuários
          </button>
          <button
            className={view === "projects" ? "active" : ""}
            onClick={() => setView("projects")}
          >
            <FolderKanban />
            Projetos
          </button>
          <button
            className={view === "media" ? "active" : ""}
            onClick={() => setView("media")}
          >
            <HardDrive />
            Mídia
          </button>
          <button
            className={view === "activity" ? "active" : ""}
            onClick={() => setView("activity")}
          >
            <FileClock />
            Histórico
          </button>
          <span>SISTEMA</span>
          <button
            className={view === "system" ? "active" : ""}
            onClick={() => setView("system")}
          >
            <Activity />
            Operação
          </button>
          <button
            className={view === "site" ? "active" : ""}
            onClick={() => setView("site")}
          >
            <Globe2 />
            Frontend
          </button>
          <button
            className={view === "security" ? "active" : ""}
            onClick={() => setView("security")}
          >
            <ShieldCheck />
            Segurança
          </button>
        </nav>
        <div className="admin-account">
          <span>{initials(admin.name)}</span>
          <div>
            <strong>{admin.name}</strong>
            <small>{admin.email}</small>
          </div>
          <button onClick={logout}>
            <LogOut />
          </button>
        </div>
      </aside>
      <section className="admin-workspace">
        <header className="admin-top">
          <div>
            <a href="/app">
              <ArrowLeft />
              Voltar ao estúdio
            </a>
            <span>Administração</span>
          </div>
          <button onClick={load} disabled={loading}>
            <RefreshCw className={loading ? "spin" : ""} />
            Atualizar
          </button>
        </header>
        <div className="admin-content">
          <div className="admin-title">
            <div>
              <span>{title[0]}</span>
              <h1>{title[1]}</h1>
              <p>Controle operacional completo do StormCast.</p>
            </div>
            <div className="admin-identity">
              <ShieldCheck />
              <span>
                <small>SESSÃO ATUAL</small>
                <strong>Administrador</strong>
              </span>
            </div>
          </div>
          {message && <div className="admin-message">{message}</div>}
          {view === "users" && (
            <>
              <Metrics
                values={[
                  ["CONTAS", userSummary.total],
                  ["ATIVAS", userSummary.active],
                  ["CRÉDITOS", userSummary.credits],
                  ["SESSÕES", userSummary.sessions],
                ]}
              />
              <Panel
                title="Usuários"
                query={query}
                setQuery={setQuery}
                action={
                  <button
                    className="admin-primary"
                    onClick={() => setShowCreate(!showCreate)}
                  >
                    <Plus />
                    Novo usuário
                  </button>
                }
              >
                {showCreate && (
                  <form className="admin-create-form" onSubmit={createUser}>
                    <input
                      required
                      placeholder="Nome"
                      value={newUser.name}
                      onChange={(e) =>
                        setNewUser({ ...newUser, name: e.target.value })
                      }
                    />
                    <input
                      required
                      type="email"
                      placeholder="E-mail"
                      value={newUser.email}
                      onChange={(e) =>
                        setNewUser({ ...newUser, email: e.target.value })
                      }
                    />
                    <input
                      required
                      type="password"
                      placeholder="Senha temporária"
                      value={newUser.password}
                      onChange={(e) =>
                        setNewUser({ ...newUser, password: e.target.value })
                      }
                    />
                    <input
                      type="number"
                      value={newUser.credits}
                      onChange={(e) =>
                        setNewUser({ ...newUser, credits: e.target.value })
                      }
                    />
                    <select
                      value={newUser.role}
                      onChange={(e) =>
                        setNewUser({ ...newUser, role: e.target.value })
                      }
                    >
                      <option value="user">Usuário</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button>Criar</button>
                  </form>
                )}
                <Table
                  headers={[
                    "Conta",
                    "Perfil",
                    "Status",
                    "Créditos",
                    "Plano e limites",
                    "Conteúdo",
                    "Ações",
                  ]}
                >
                  {filteredUsers.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div className="table-person">
                          <span>{initials(user.name)}</span>
                          <div>
                            <strong>{user.name}</strong>
                            <small>{user.email}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`role-pill role-${user.role}`}>
                          {user.role}
                        </span>
                      </td>
                      <td>
                        <span className={`status-dot status-${user.status}`}>
                          <i />
                          {user.status}
                        </span>
                        {user.forcePasswordChange && (
                          <small>Troca de senha pendente</small>
                        )}
                      </td>
                      <td>
                        <button
                          className="inline-credit"
                          onClick={() => userAction(user, "credits")}
                        >
                          {user.credits}
                          <Coins />
                        </button>
                      </td>
                      <td>
                        <strong>{user.plan}</strong>
                        <small>
                          {user.monthlyCreditLimit}/mês ·{" "}
                          {user.maxActiveProjects} simultâneo(s)
                        </small>
                      </td>
                      <td>
                        <small>
                          {user.projectCount} projetos · {user.clipCount} cortes
                          · {user.sessionCount} sessões
                        </small>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button onClick={() => userAction(user, "limits")}>
                            <Gauge />
                            Plano
                          </button>
                          <button onClick={() => userAction(user, "profile")}>
                            <Settings2 />
                            Editar
                          </button>
                          <button onClick={() => userAction(user, "password")}>
                            <KeyRound />
                            Senha
                          </button>
                          <button
                            onClick={() => userAction(user, "logout_all")}
                          >
                            <LogOut />
                            Sessões
                          </button>
                          <button
                            disabled={user.id === admin.id}
                            onClick={() =>
                              userAction(
                                user,
                                user.role === "admin"
                                  ? "make_user"
                                  : "make_admin",
                              )
                            }
                          >
                            <UserCog />
                            Perfil
                          </button>
                          <button
                            disabled={user.id === admin.id}
                            onClick={() =>
                              userAction(
                                user,
                                user.status === "active"
                                  ? "suspend"
                                  : "activate",
                              )
                            }
                          >
                            <UserX />
                            {user.status === "active" ? "Suspender" : "Ativar"}
                          </button>
                          <button
                            className="danger"
                            disabled={user.id === admin.id}
                            onClick={() => deleteUser(user)}
                          >
                            <Trash2 />
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </Table>
              </Panel>
            </>
          )}
          {view === "projects" && (
            <>
              <Metrics
                values={[
                  ["PROJETOS", projectSummary.total],
                  ["ATIVOS", projectSummary.active],
                  ["PRONTOS", projectSummary.ready],
                  ["CORTES", projectSummary.clips],
                ]}
              />
              <Panel
                title="Projetos de todos os usuários"
                query={query}
                setQuery={setQuery}
              >
                <Table
                  headers={[
                    "Projeto",
                    "Proprietário",
                    "Formato",
                    "Status",
                    "Cortes",
                    "Créditos",
                    "Ações",
                  ]}
                >
                  {filteredProjects.map((project) => (
                    <tr key={project.id}>
                      <td>
                        <strong>{project.title}</strong>
                        <small>{date(project.createdAt)}</small>
                      </td>
                      <td>
                        <strong>{project.ownerName}</strong>
                        <small>{project.ownerEmail}</small>
                      </td>
                      <td>
                        {project.format} · {project.framing}
                      </td>
                      <td>
                        <span
                          className={`project-status status-${project.status}`}
                        >
                          {labels[project.status] || project.status}
                        </span>
                        <small>
                          {project.stage} · {project.progress}%
                        </small>
                      </td>
                      <td>{project.clipCount}</td>
                      <td>{project.creditsCharged}</td>
                      <td>
                        <div className="row-actions">
                          {["failed", "cancelled"].includes(project.status) && (
                            <button
                              onClick={() => projectAction(project, "retry")}
                            >
                              <RefreshCw />
                              Reprocessar
                            </button>
                          )}
                          {activeStatuses.includes(project.status) && (
                            <button
                              onClick={() => projectAction(project, "cancel")}
                            >
                              <XCircle />
                              Cancelar
                            </button>
                          )}
                          {!activeStatuses.includes(project.status) && (
                            <button
                              className="danger"
                              onClick={() => projectAction(project, "delete")}
                            >
                              <Trash2 />
                              Excluir mídia
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </Table>
              </Panel>
            </>
          )}
          {view === "media" && media && (
            <>
              <Metrics
                values={[
                  ["MÍDIA", bytes(media.totalBytes)],
                  ["TEMPORÁRIOS", bytes(media.tempBytes)],
                  ["LIVRE", media.disk ? bytes(media.disk.freeBytes) : "—"],
                  ["RETENÇÃO", `${system?.settings.retention_days || 30} dias`],
                ]}
              />
              <div className="admin-system-grid">
                <section className="admin-card">
                  <span>USO POR CONTA</span>
                  <h2>Armazenamento</h2>
                  <dl>
                    {media.users.map((user) => (
                      <div key={user.id}>
                        <dt>
                          {user.name}
                          <small>{user.email}</small>
                        </dt>
                        <dd>{bytes(user.bytes)}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
                <section className="admin-card">
                  <span>LIMPEZA</span>
                  <h2>Política de retenção</h2>
                  <p>
                    Remove temporários com mais de 24 horas e mídias de projetos
                    finalizados além do período configurado.
                  </p>
                  <label className="admin-field">
                    Dias de retenção
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={system?.settings.retention_days || "30"}
                      onChange={(e) =>
                        system && setting("retention_days", e.target.value)
                      }
                    />
                  </label>
                  <button
                    className="admin-primary"
                    onClick={async () => {
                      if (system)
                        await request("/api/admin/system", "PATCH", {
                          retention_days: system.settings.retention_days,
                        });
                      if (confirm("Executar limpeza agora?"))
                        await request("/api/admin/media", "POST", {});
                    }}
                  >
                    Salvar e limpar agora
                  </button>
                  <small>{media.mediaDirectory}</small>
                </section>
                <section className="admin-card">
                  <span>ARQUIVOS MP4</span>
                  <h2>Cortes renderizados</h2>
                  <div className="media-file-list">
                    {media.clips.length ? (
                      media.clips.map((clip) => (
                        <article key={clip.id}>
                          <div>
                            <strong>{clip.title}</strong>
                            <small>
                              {clip.ownerName} · {bytes(clip.size)}
                            </small>
                          </div>
                          <button
                            className="danger"
                            onClick={async () => {
                              if (confirm("Excluir este MP4 e seu registro?"))
                                await request("/api/admin/media", "DELETE", {
                                  kind: "clip",
                                  id: clip.id,
                                });
                            }}
                          >
                            <Trash2 />
                          </button>
                        </article>
                      ))
                    ) : (
                      <p>Nenhum MP4 armazenado.</p>
                    )}
                  </div>
                </section>
                <section className="admin-card">
                  <span>ÁREA TEMPORÁRIA</span>
                  <h2>Trabalhos no disco</h2>
                  <div className="media-file-list">
                    {media.temporary.length ? (
                      media.temporary.map((item) => (
                        <article key={item.name}>
                          <div>
                            <strong>{item.name}</strong>
                            <small>
                              {bytes(item.size)} · {date(item.updatedAt)}
                            </small>
                          </div>
                          <button
                            className="danger"
                            onClick={async () => {
                              if (confirm("Excluir este temporário?"))
                                await request("/api/admin/media", "DELETE", {
                                  kind: "temporary",
                                  name: item.name,
                                });
                            }}
                          >
                            <Trash2 />
                          </button>
                        </article>
                      ))
                    ) : (
                      <p>Nenhum temporário armazenado.</p>
                    )}
                  </div>
                </section>
              </div>
            </>
          )}
          {view === "activity" && activity && (
            <div className="admin-system-grid activity-grid">
              <LogList
                title="Falhas recentes"
                rows={activity.failures}
                fields={["title", "user_name", "error_message", "completed_at"]}
              />
              <LogList
                title="Histórico de créditos"
                rows={activity.credits}
                fields={[
                  "user_name",
                  "amount",
                  "balance_after",
                  "reason",
                  "created_at",
                ]}
              />
              <LogList
                title="Ações administrativas"
                rows={activity.audit}
                fields={[
                  "admin_name",
                  "action",
                  "target_type",
                  "target_id",
                  "created_at",
                ]}
              />
            </div>
          )}
          {view === "system" && system && (
            <>
              <Metrics
                values={[
                  [
                    "PROCESSADOR",
                    system.processor.healthy ? "Saudável" : "Sem heartbeat",
                  ],
                  [
                    "FILA",
                    Object.entries(system.projects)
                      .filter(([key]) => activeStatuses.includes(key))
                      .reduce((sum, [, value]) => sum + value, 0),
                  ],
                  ["MINUTOS", system.usage.minutes.toFixed(1)],
                  [
                    "CUSTO EST.",
                    `US$ ${system.usage.estimatedOpenAiCost.toFixed(2)}`,
                  ],
                ]}
              />
              <div className="admin-system-grid">
                <section className="admin-card">
                  <span>PROCESSADOR</span>
                  <h2>Saúde e infraestrutura</h2>
                  <dl>
                    <div>
                      <dt>Heartbeat</dt>
                      <dd>{date(system.processor.heartbeat)}</dd>
                    </div>
                    <div>
                      <dt>Análise</dt>
                      <dd>{system.processor.analysisModel}</dd>
                    </div>
                    <div>
                      <dt>Transcrição</dt>
                      <dd>{system.processor.transcriptionModel}</dd>
                    </div>
                    <div>
                      <dt>yt-dlp</dt>
                      <dd>
                        {system.processor.ytdlpConfigured
                          ? "Configurado"
                          : "PATH"}
                      </dd>
                    </div>
                    <div>
                      <dt>FFmpeg</dt>
                      <dd>
                        {system.processor.ffmpegConfigured
                          ? "Configurado"
                          : "PATH"}
                      </dd>
                    </div>
                  </dl>
                  {system.processor.lastError && (
                    <p>Última falha: {system.processor.lastError}</p>
                  )}
                </section>
                <form className="admin-card" onSubmit={saveSettings}>
                  <span>POLÍTICAS</span>
                  <h2>Operação</h2>
                  <Toggle
                    label="Cadastro público"
                    checked={system.settings.registration_enabled === "1"}
                    onChange={(value) =>
                      setting("registration_enabled", value ? "1" : "0")
                    }
                  />
                  <Toggle
                    label="Modo manutenção"
                    checked={system.settings.maintenance_mode === "1"}
                    onChange={(value) =>
                      setting("maintenance_mode", value ? "1" : "0")
                    }
                  />
                  <label className="admin-field">
                    Créditos iniciais
                    <input
                      type="number"
                      value={system.settings.default_credits || "120"}
                      onChange={(e) =>
                        setting("default_credits", e.target.value)
                      }
                    />
                  </label>
                  <label className="admin-field">
                    Custo OpenAI por minuto (US$)
                    <input
                      type="number"
                      step=".001"
                      value={system.settings.openai_cost_per_minute || ".008"}
                      onChange={(e) =>
                        setting("openai_cost_per_minute", e.target.value)
                      }
                    />
                  </label>
                  <button className="admin-primary">Salvar</button>
                </form>
              </div>
            </>
          )}
          {view === "site" && system && (
            <form className="site-editor" onSubmit={saveSettings}>
              <section className="admin-card">
                <span>IDENTIDADE E AVISOS</span>
                <h2>Marca e disponibilidade</h2>
                <Field
                  label="Nome/logo"
                  value={system.settings.logo_text || "StormCast"}
                  change={(value) => setting("logo_text", value)}
                />
                <Field
                  label="Cor principal"
                  type="color"
                  value={system.settings.primary_color || "#7c3cff"}
                  change={(value) => setting("primary_color", value)}
                />
                <Field
                  label="Aviso global"
                  value={system.settings.global_notice || ""}
                  change={(value) => setting("global_notice", value)}
                />
                <Toggle
                  label="Modo manutenção"
                  checked={system.settings.maintenance_mode === "1"}
                  onChange={(value) =>
                    setting("maintenance_mode", value ? "1" : "0")
                  }
                />
              </section>
              <section className="admin-card">
                <span>PÁGINA PRINCIPAL</span>
                <h2>Seção de abertura</h2>
                <Field
                  label="Selo"
                  value={system.settings.hero_eyebrow || ""}
                  change={(value) => setting("hero_eyebrow", value)}
                />
                <Field
                  label="Título"
                  value={system.settings.hero_title || ""}
                  change={(value) => setting("hero_title", value)}
                />
                <Field
                  label="Descrição"
                  textarea
                  value={system.settings.hero_description || ""}
                  change={(value) => setting("hero_description", value)}
                />
                <Field
                  label="Botão principal"
                  value={system.settings.primary_button_text || ""}
                  change={(value) => setting("primary_button_text", value)}
                />
                <Field
                  label="Link principal"
                  value={system.settings.primary_button_link || "/cadastro"}
                  change={(value) => setting("primary_button_link", value)}
                />
              </section>
              <section className="admin-card">
                <span>PLANOS</span>
                <h2>Nomes e preços</h2>
                {["free", "creator", "pro"].map((plan) => (
                  <div key={plan} className="site-inline-fields">
                    <Field
                      label={`${plan} — nome`}
                      value={system.settings[`plan_${plan}_name`] || ""}
                      change={(value) => setting(`plan_${plan}_name`, value)}
                    />
                    <Field
                      label="Preço"
                      value={system.settings[`plan_${plan}_price`] || ""}
                      change={(value) => setting(`plan_${plan}_price`, value)}
                    />
                  </div>
                ))}
              </section>
              <section className="admin-card">
                <span>FAQ E PÁGINAS</span>
                <h2>Conteúdo institucional</h2>
                <Field
                  label="Pergunta 1"
                  value={system.settings.faq_1_question || ""}
                  change={(value) => setting("faq_1_question", value)}
                />
                <Field
                  label="Resposta 1"
                  textarea
                  value={system.settings.faq_1_answer || ""}
                  change={(value) => setting("faq_1_answer", value)}
                />
                <Field
                  label="Termos"
                  textarea
                  value={system.settings.terms_content || ""}
                  change={(value) => setting("terms_content", value)}
                />
                <Field
                  label="Privacidade"
                  textarea
                  value={system.settings.privacy_content || ""}
                  change={(value) => setting("privacy_content", value)}
                />
              </section>
              <section className="admin-card">
                <span>ATIVAÇÃO GRADUAL</span>
                <h2>Funcionalidades</h2>
                {[
                  ["feature_vertical", "Vertical V2"],
                  ["feature_captions", "Legendas V2"],
                  ["feature_brandkit", "Brand Kit"],
                  ["feature_payments", "Pagamentos"],
                ].map(([key, label]) => (
                  <Toggle
                    key={key}
                    label={label}
                    checked={system.settings[key] !== "0"}
                    onChange={(value) => setting(key, value ? "1" : "0")}
                  />
                ))}
              </section>
              <button className="admin-primary site-save" disabled={!!busy}>
                Salvar site público
              </button>
            </form>
          )}
          {view === "security" && (
            <div className="admin-system-grid">
              <section className="admin-card">
                <span>SENHAS</span>
                <h2>Proteção de contas</h2>
                <p>
                  PBKDF2-SHA256 com salt individual e 240 mil iterações. O
                  administrador redefine uma senha temporária, mas nunca
                  visualiza a senha atual.
                </p>
                <p>
                  A troca obrigatória é aplicada no próximo login e a
                  redefinição revoga todas as sessões.
                </p>
              </section>
              <section className="admin-card">
                <span>SESSÕES</span>
                <h2>{system?.activeSessions || 0} ativas</h2>
                <p>
                  Validade configurada: {system?.sessionDays || 30} dias. As
                  sessões podem ser revogadas individualmente por usuário.
                </p>
              </section>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function Metrics({ values }: { values: Array<[string, string | number]> }) {
  return (
    <div className="admin-metrics">
      {values.map(([label, value]) => (
        <article key={label}>
          <span>
            <Activity />
          </span>
          <div>
            <small>{label}</small>
            <strong>{value}</strong>
            <em>dados reais</em>
          </div>
        </article>
      ))}
    </div>
  );
}
function Panel({
  title,
  query,
  setQuery,
  action,
  children,
}: {
  title: string;
  query: string;
  setQuery: (value: string) => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="users-panel">
      <div className="users-panel-head">
        <div>
          <h2>{title}</h2>
        </div>
        <div className="admin-head-actions">
          <label>
            <Search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar"
            />
          </label>
          {action}
        </div>
      </div>
      {children}
    </section>
  );
}
function Table({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="users-table-wrap">
      <table className="users-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="admin-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i />
      <div>
        <strong>{label}</strong>
      </div>
    </label>
  );
}
function Field({
  label,
  value,
  change,
  type = "text",
  textarea = false,
}: {
  label: string;
  value: string;
  change: (value: string) => void;
  type?: string;
  textarea?: boolean;
}) {
  return (
    <label className="admin-field">
      {label}
      {textarea ? (
        <textarea
          rows={4}
          value={value}
          onChange={(event) => change(event.target.value)}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(event) => change(event.target.value)}
        />
      )}
    </label>
  );
}
function LogList({
  title,
  rows,
  fields,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  fields: string[];
}) {
  return (
    <section className="admin-card">
      <span>REGISTROS</span>
      <h2>{title}</h2>
      <div className="audit-list">
        {rows.length ? (
          rows.map((row, index) => (
            <article key={String(row.id || index)}>
              {fields.map((field) => (
                <span key={field}>
                  <small>{field.replaceAll("_", " ")}</small>
                  <strong>
                    {field.endsWith("_at")
                      ? date(Number(row[field]))
                      : String(row[field] ?? "—")}
                  </strong>
                </span>
              ))}
            </article>
          ))
        ) : (
          <p>Nenhum registro.</p>
        )}
      </div>
    </section>
  );
}
