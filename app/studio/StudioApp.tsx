"use client";

/* eslint-disable @next/next/no-img-element -- authenticated clip posters and dynamic YouTube thumbnails must keep their direct URLs */

import {
  ArrowLeft, ArrowRight, BarChart3, Bell, Captions, Check, ChevronRight, CircleHelp,
  Clock3, Copy, CopyPlus, CreditCard, Download, FolderOpen, Frame, Home, Link2, LogOut, Menu,
  Monitor, Palette, PanelLeftClose, Play, Plus, Radio, Search, Settings, ShieldCheck,
  Sparkles, Pencil, RotateCcw, Trash2, Video, WandSparkles, X, type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type View = "dashboard" | "projects" | "clips" | "live" | "brand" | "analytics" | "billing" | "settings";
type ProjectStatus = "queued" | "downloading" | "transcribing" | "analyzing" | "rendering" | "ready" | "failed" | "cancelled";

type Clip = {
  id: string; title: string; hook: string; caption: string; startSeconds: number; endSeconds: number;
  durationSeconds: number; score: number; videoUrl: string; posterUrl: string; downloadUrl: string;
};

type Project = {
  id: string; title: string; platform: string; sourceUrl: string; sourceVideoId: string;
  sourceDurationSeconds: number; requestedAnalysisMinutes: number; analysisSeconds: number;
  requestedClipSeconds: number; format: "9:16" | "16:9"; framing: "fit" | "center";
  prompt: string; captionStyle: string; thumbnailUrl: string | null; status: ProjectStatus; stage: string;
  progress: number; error: string | null; creditsCharged: number; createdAt: number;
  updatedAt: number; completedAt: number | null; clips: Clip[];
};

type YouTubeMetadata = {
  videoId: string; title: string; durationSeconds: number; thumbnailUrl: string;
  channel: string; canonicalUrl: string;
};

const captionStyles = [
  { id: "impact", label: "Impacto dourado", css: "caption-gold", sample: "NÃO FOI POR ACASO" },
  { id: "clean", label: "Clean", css: "caption-clean", sample: "Existe um propósito" },
  { id: "viral", label: "Viral pop", css: "caption-pop", sample: "VOCÊ PRECISA OUVIR" },
  { id: "neon", label: "Neon", css: "caption-neon", sample: "ISSO MUDA TUDO" },
  { id: "focus", label: "Foco", css: "caption-focus", sample: "preste atenção" },
  { id: "editorial", label: "Editorial", css: "caption-editorial", sample: "Uma verdade simples" },
];

const activeStatuses: ProjectStatus[] = ["queued", "downloading", "transcribing", "analyzing", "rendering"];

function formatClock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const short = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return hours ? `${String(hours).padStart(2, "0")}:${short}` : short;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

function statusLabel(status: ProjectStatus) {
  const labels: Record<ProjectStatus, string> = {
    queued: "Na fila", downloading: "Baixando", transcribing: "Transcrevendo", analyzing: "Analisando",
    rendering: "Renderizando", ready: "Pronto", failed: "Falhou", cancelled: "Cancelado",
  };
  return labels[status];
}

function friendlyProjectError(message: string | null) {
  if (!message) return "O servidor encerrou o trabalho sem cobrar créditos.";
  if (/OpenAI \(429\)|no credits remaining|insufficient_quota|billing/i.test(message)) {
    return "A conta da OpenAI estava sem saldo. Adicione créditos na API e reprocese este mesmo projeto.";
  }
  if (/HTTP (Error )?403|403 Forbidden|ffmpeg exited with code 8/i.test(message)) {
    return "O YouTube recusou temporariamente o download. O projeto pode ser reprocessado depois da correção do yt-dlp.";
  }
  return message;
}

function VisualArt({ compact = false }: { compact?: boolean }) {
  return <div className={`visual-art theme-violet${compact ? " visual-art-compact" : ""}`} aria-hidden="true">
    <div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" />
    <div className="visual-mic"><span /></div>
    <div className="visual-wave">{[18, 34, 22, 48, 62, 30, 54, 26, 44, 18, 36].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
    <div className="visual-tag">STORMCAST</div>
  </div>;
}

function SourcePicture({ src, alt, compact = false }: { src: string | null; alt: string; compact?: boolean }) {
  return src ? <img className={`source-picture${compact ? " source-picture-compact" : ""}`} src={src} alt={alt} /> : <VisualArt compact={compact} />;
}

function ProjectCard({ project, selected, onSelect, onOpen, onRetry, onEdit, onDuplicate, onCancel, onRemove }: {
  project: Project;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onRetry: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const bestScore = Math.max(0, ...project.clips.map((clip) => clip.score));
  const terminal = ["ready", "failed", "cancelled"].includes(project.status);
  const reusable = ["failed", "cancelled"].includes(project.status);
  return <div className="project-card-shell"><button className="project-card" onClick={onOpen}>
      <div className="project-cover"><SourcePicture src={project.thumbnailUrl} alt={`Capa de ${project.title}`} compact />{bestScore > 0 && <span className="score-chip"><Sparkles size={13} /> {bestScore}</span>}<span className="project-format">{project.format}</span>{project.status !== "ready" && <span className={`project-status status-${project.status}`}>{statusLabel(project.status)}{activeStatuses.includes(project.status) ? ` ${project.progress}%` : ""}</span>}</div>
      <div className="project-card-body"><div className="project-source"><i />{project.platform}</div><h3>{project.title}</h3><div className="project-meta"><span>{project.clips.length} cortes reais</span><span>{formatDate(project.createdAt)}</span></div></div>
    </button>{terminal && <button className={`project-select${selected ? " selected" : ""}`} onClick={onSelect} aria-label={selected ? "Remover da seleção" : "Selecionar projeto"}>{selected ? <Check /> : <span />}</button>}<div className="project-quick-actions">
      {reusable && <button className="project-action-primary" onClick={onRetry}><RotateCcw /> Reprocessar</button>}
      {reusable && <button onClick={onEdit}><Pencil /> Editar</button>}
      {terminal && <button onClick={onDuplicate}><CopyPlus /> Duplicar</button>}
      {activeStatuses.includes(project.status) && <button className="danger" onClick={onCancel}><X /> Cancelar</button>}
      {terminal && <button className="danger icon-only" onClick={onRemove} aria-label={`Excluir ${project.title}`} title="Excluir projeto e arquivos"><Trash2 /></button>}
    </div></div>;
}

const nav: { label: string; items: { id: View; label: string; Icon: LucideIcon; badge?: string }[] }[] = [
  { label: "Visão geral", items: [{ id: "dashboard", label: "Início", Icon: Home }] },
  { label: "Produzir", items: [{ id: "projects", label: "Projetos", Icon: FolderOpen }, { id: "clips", label: "Meus cortes", Icon: Video }, { id: "brand", label: "Brand kit", Icon: Palette }] },
  { label: "Acompanhar", items: [{ id: "live", label: "Monitorar lives", Icon: Radio, badge: "EM BREVE" }, { id: "analytics", label: "Desempenho", Icon: BarChart3 }] },
  { label: "Conta", items: [{ id: "billing", label: "Plano e créditos", Icon: CreditCard }, { id: "settings", label: "Configurações", Icon: Settings }] },
];

const viewTitles: Record<View, string> = {
  dashboard: "Início", projects: "Projetos", clips: "Meus cortes", live: "Monitorar lives", brand: "Brand kit",
  analytics: "Desempenho", billing: "Plano e créditos", settings: "Configurações",
};

export type StudioUser = { id: string; name: string; email: string; role: "admin" | "user"; credits: number };

export default function StudioApp({ user }: { user: StudioUser }) {
  const [view, setView] = useState<View>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [inputError, setInputError] = useState("");
  const [wizardStep, setWizardStep] = useState<number | null>(null);
  const [metadata, setMetadata] = useState<YouTubeMetadata | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [format, setFormat] = useState<"9:16" | "16:9">("9:16");
  const [framing, setFraming] = useState<"fit" | "center">("fit");
  const [prompt, setPrompt] = useState("Selecione momentos claros, perguntas fortes, respostas, histórias e frases marcantes. Preserve o contexto e não distorça a mensagem.");
  const [clipDuration, setClipDuration] = useState("60");
  const [analysisMinutes, setAnalysisMinutes] = useState(1);
  const [captionStyle, setCaptionStyle] = useState("impact");
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [previewClip, setPreviewClip] = useState<Clip | null>(null);
  const [copied, setCopied] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "ready" | "failed" | "cancelled">("all");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectActionBusy, setProjectActionBusy] = useState<string | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [actionNotice, setActionNotice] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [processorConfigured, setProcessorConfigured] = useState(false);
  const [creditBalance, setCreditBalance] = useState(user.credits);
  const [brandColor, setBrandColor] = useState("#7c3aed");

  const userInitials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "SC";
  const userHandle = user.email.split("@")[0].replace(/[^a-z0-9_.-]/gi, "").toLowerCase() || "stormcast";
  const workspaceName = `${user.name.split(/\s+/)[0] || "Meu"} Studio`;
  const selectedCaption = captionStyles.find((style) => style.id === captionStyle) || captionStyles[0];
  const maximumAnalysisMinutes = Math.max(1, Math.min(90, Math.ceil((metadata?.durationSeconds || 60) / 60)));
  const totalClips = projects.reduce((sum, project) => sum + project.clips.length, 0);
  const readyProjects = projects.filter((project) => project.status === "ready");
  const allClips = readyProjects.flatMap((project) => project.clips);
  const averageScore = allClips.length ? Math.round(allClips.reduce((sum, clip) => sum + clip.score, 0) / allClips.length) : 0;
  const filteredProjects = projects.filter((project) => {
    const matchesSearch = `${project.title} ${project.platform}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = statusFilter === "all" ? true
      : statusFilter === "active" ? activeStatuses.includes(project.status)
      : project.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const projectCounts = {
    all: projects.length,
    active: projects.filter((project) => activeStatuses.includes(project.status)).length,
    ready: projects.filter((project) => project.status === "ready").length,
    failed: projects.filter((project) => project.status === "failed").length,
    cancelled: projects.filter((project) => project.status === "cancelled").length,
  };
  const currentProject = projects.find((project) => project.id === currentProjectId) || readyProjects[0] || projects[0] || null;
  const processingProject = projects.find((project) => project.id === processingId) || null;

  const loadProjects = useCallback(async (silent = false) => {
    if (!silent) setLoadingProjects(true);
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      if (response.status === 401) { window.location.assign("/login"); return; }
      const payload = await response.json() as { projects?: Project[]; credits?: number; processorConfigured?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar seus projetos.");
      setProjects(payload.projects || []);
      setCreditBalance(Number(payload.credits) || 0);
      setProcessorConfigured(Boolean(payload.processorConfigured));
      setLoadError("");
    } catch (error) {
      if (!silent) setLoadError(error instanceof Error ? error.message : "Não foi possível carregar seus projetos.");
    } finally { if (!silent) setLoadingProjects(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadProjects(), 0);
    return () => window.clearTimeout(timer);
  }, [loadProjects]);
  useEffect(() => {
    if (!projects.some((project) => activeStatuses.includes(project.status))) return;
    const timer = window.setInterval(() => void loadProjects(true), 3500);
    return () => window.clearInterval(timer);
  }, [loadProjects, projects]);
  async function signOut() { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/"); }
  function changeView(next: View) { setView(next); setMenuOpen(false); if (next === "clips" && !currentProjectId && readyProjects[0]) setCurrentProjectId(readyProjects[0].id); }
  function resetNewProject() { setVideoUrl(""); setMetadata(null); setInputError(""); setFormat("9:16"); setFraming("fit"); setClipDuration("60"); setAnalysisMinutes(1); setEditingProjectId(null); }
  function openNewProject() { resetNewProject(); setWizardStep(0); }
  function openProject(project: Project) {
    setCurrentProjectId(project.id);
    if (activeStatuses.includes(project.status) || project.status === "failed") setProcessingId(project.id);
    else if (project.status === "ready") changeView("clips");
  }

  function editExistingProject(project: Project) {
    setEditingProjectId(project.id);
    setVideoUrl(project.sourceUrl);
    setMetadata({
      videoId: project.sourceVideoId,
      title: project.title,
      durationSeconds: project.sourceDurationSeconds,
      thumbnailUrl: project.thumbnailUrl || `https://i.ytimg.com/vi/${project.sourceVideoId}/hqdefault.jpg`,
      channel: "Projeto existente",
      canonicalUrl: project.sourceUrl,
    });
    setFormat(project.format);
    setFraming(project.framing);
    setPrompt(project.prompt || "");
    setClipDuration(String(project.requestedClipSeconds));
    setAnalysisMinutes(project.requestedAnalysisMinutes);
    setCaptionStyle(project.captionStyle);
    setInputError("");
    setProcessingId(null);
    setWizardStep(1);
  }

  async function inspectSource(goToFormat = true) {
    if (!videoUrl.trim()) { setInputError("Cole o link de um vídeo público do YouTube."); return false; }
    setInspecting(true); setInputError("");
    try {
      const response = await fetch("/api/youtube/metadata", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: videoUrl }) });
      const payload = await response.json() as { metadata?: YouTubeMetadata; error?: string };
      if (!response.ok || !payload.metadata) throw new Error(payload.error || "Não foi possível consultar esse vídeo.");
      setMetadata(payload.metadata); setVideoUrl(payload.metadata.canonicalUrl);
      setAnalysisMinutes(Math.max(1, Math.min(60, Math.ceil(payload.metadata.durationSeconds / 60))));
      if (goToFormat) setWizardStep(1);
      return true;
    } catch (error) { setInputError(error instanceof Error ? error.message : "Não foi possível consultar esse vídeo."); return false; }
    finally { setInspecting(false); }
  }

  async function createProject() {
    if (!metadata || creating) return;
    if (!processorConfigured) { setInputError("O processador real ainda não foi ativado no servidor."); return; }
    if (analysisMinutes > creditBalance) { setInputError(`Saldo insuficiente: a análise exige até ${analysisMinutes} créditos.`); return; }
    setCreating(true); setInputError("");
    try {
      const projectBody = {
        sourceUrl: metadata.canonicalUrl, videoId: metadata.videoId, title: metadata.title,
        durationSeconds: metadata.durationSeconds, thumbnailUrl: metadata.thumbnailUrl, analysisMinutes,
        clipDuration: Number(clipDuration), format, framing, prompt, captionStyle,
      };
      const response = await fetch(editingProjectId ? `/api/projects/${editingProjectId}` : "/api/projects", {
        method: editingProjectId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingProjectId ? { action: "update_and_retry", ...projectBody } : projectBody),
      });
      const payload = await response.json() as { project?: Project; error?: string };
      if (!response.ok || !payload.project) throw new Error(payload.error || "Não foi possível iniciar o processamento.");
      const created = payload.project;
      setProjects((current) => [created, ...current.filter((project) => project.id !== created.id)]);
      setCurrentProjectId(created.id); setProcessingId(created.id); setEditingProjectId(null); setWizardStep(null); setView("projects");
      window.setTimeout(() => void loadProjects(true), 1000);
    } catch (error) { setInputError(error instanceof Error ? error.message : "Não foi possível iniciar o processamento."); }
    finally { setCreating(false); }
  }

  async function projectAction(project: Project, action: "retry" | "duplicate") {
    if (projectActionBusy) return;
    setProjectActionBusy(project.id); setLoadError(""); setActionNotice("");
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => ({})) as { project?: Project; error?: string };
      if (!response.ok || !payload.project) throw new Error(payload.error || "Não foi possível reutilizar o projeto.");
      const queued = payload.project;
      setProjects((current) => [queued, ...current.filter((item) => item.id !== queued.id)]);
      setCurrentProjectId(queued.id); setProcessingId(queued.id); setView("projects");
      setActionNotice(action === "retry" ? "Projeto reenviado com as mesmas configurações." : "Cópia criada e enviada para a fila.");
      window.setTimeout(() => setActionNotice(""), 5000);
      window.setTimeout(() => void loadProjects(true), 1000);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Não foi possível reutilizar o projeto.");
    } finally { setProjectActionBusy(null); }
  }

  async function cancelProject(projectId: string) {
    const response = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) { setLoadError(payload.error || "Não foi possível cancelar."); return; }
    setProcessingId(null); setActionNotice("Cancelamento solicitado."); await loadProjects(true);
  }

  async function removeProject(project: Project) {
    if (!window.confirm(`Excluir “${project.title}” e todos os MP4 desse projeto?`)) return;
    const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) { setLoadError(payload.error || "Não foi possível excluir o projeto."); return; }
    setProjects((current) => current.filter((item) => item.id !== project.id));
    setSelectedProjectIds((current) => current.filter((id) => id !== project.id));
    if (currentProjectId === project.id) setCurrentProjectId(null);
    if (processingId === project.id) setProcessingId(null);
    setActionNotice("Projeto e arquivos excluídos.");
  }

  async function removeSelectedProjects() {
    const selected = projects.filter((project) => selectedProjectIds.includes(project.id) && ["ready", "failed", "cancelled"].includes(project.status));
    if (!selected.length || !window.confirm(`Excluir ${selected.length} projeto(s) selecionado(s) e todos os MP4 relacionados?`)) return;
    setProjectActionBusy("bulk-delete"); setLoadError("");
    const removed: string[] = [];
    try {
      for (const project of selected) {
        const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(payload.error || `Não foi possível excluir ${project.title}.`);
        }
        removed.push(project.id);
      }
      setProjects((current) => current.filter((project) => !removed.includes(project.id)));
      setSelectedProjectIds([]);
      setActionNotice(`${removed.length} projeto(s) e seus arquivos foram excluídos.`);
    } catch (error) {
      setProjects((current) => current.filter((project) => !removed.includes(project.id)));
      setSelectedProjectIds((current) => current.filter((id) => !removed.includes(id)));
      setLoadError(error instanceof Error ? error.message : "Não foi possível concluir a exclusão em lote.");
    } finally { setProjectActionBusy(null); }
  }

  async function copyCaption(clip: Clip) {
    try { await navigator.clipboard.writeText(clip.caption); setCopied(clip.id); window.setTimeout(() => setCopied(""), 1500); }
    catch { setCopied(""); }
  }

  async function advanceWizard() {
    if (wizardStep === 0) { await inspectSource(true); return; }
    if (wizardStep !== null && wizardStep < 4) setWizardStep(wizardStep + 1);
  }

  function projectCard(project: Project) {
    return <ProjectCard
      key={project.id}
      project={project}
      selected={selectedProjectIds.includes(project.id)}
      onSelect={() => setSelectedProjectIds((current) => current.includes(project.id) ? current.filter((id) => id !== project.id) : [...current, project.id])}
      onOpen={() => openProject(project)}
      onRetry={() => void projectAction(project, "retry")}
      onEdit={() => editExistingProject(project)}
      onDuplicate={() => void projectAction(project, "duplicate")}
      onCancel={() => void cancelProject(project.id)}
      onRemove={() => void removeProject(project)}
    />;
  }

  return <div className="app-shell">
    <aside className={`sidebar${menuOpen ? " sidebar-open" : ""}`}>
      <div className="sidebar-head"><button className="brand-lockup" onClick={() => changeView("dashboard")}><span className="brand-mark"><span /></span><span><strong>StormCast</strong><small>AI VIDEO STUDIO</small></span></button><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"><X /></button></div>
      <button className="workspace-switcher"><span className="workspace-avatar">{userInitials}</span><span><small>ESPAÇO DE TRABALHO</small><strong>{workspaceName}</strong></span><ChevronRight size={15} /></button>
      <button className="new-project-side" onClick={openNewProject}><Plus size={17} /> Novo projeto</button>
      <nav className="side-nav" aria-label="Navegação principal">{nav.map((group, groupIndex) => <div className="nav-group" key={group.label}><div className="nav-label"><span>0{groupIndex + 1}</span>{group.label}</div>{group.items.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => changeView(item.id)}><item.Icon size={17} /><span>{item.label}</span>{item.badge && <em>{item.badge}</em>}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><button><CircleHelp size={17} /> Central de ajuda</button>{user.role === "admin" && <a className="sidebar-admin-link" href="/admin"><ShieldCheck size={17} /> Administração</a>}<button onClick={() => changeView("settings")}><Settings size={17} /> Configurações</button><div className="user-card"><span className="user-avatar">{userInitials}</span><span><strong>{user.name}</strong><small>{user.role === "admin" ? "Administrador" : "Usuário"}</small></span><button onClick={signOut} aria-label="Sair da conta"><LogOut /></button></div></div>
    </aside>
    {menuOpen && <button className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-label="Fechar menu" />}

    <div className="workspace"><header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu /></button><i /><span>{viewTitles[view]}</span></div><div className="top-actions"><span className={`status-pill${processorConfigured ? "" : " status-off"}`}><i /> {processorConfigured ? "Processador operacional" : "Processador não configurado"}</span><button className="credit-pill" onClick={() => changeView("billing")}><Sparkles size={15} /><strong>{creditBalance}</strong><span>créditos</span></button><button className="icon-button" aria-label="Notificações"><Bell size={18} /></button><span className="top-avatar">{userInitials}</span></div></header>

      <main className="main-content">
        {loadError && <div className="studio-error-banner">{loadError}<button onClick={() => { setLoadError(""); void loadProjects(); }}>Tentar novamente</button></div>}
        {actionNotice && <div className="studio-action-notice"><Check /> {actionNotice}</div>}

        {view === "dashboard" && <div className="dashboard-view">
          <section className="hero-section"><div className="hero-glow" /><div className="hero-copy"><div className="eyebrow"><span><Sparkles size={14} /></span> CORTES REAIS COM IA</div><h1>Transforme conversas em<br /><em>cortes que prendem.</em></h1><p>Cole um vídeo autorizado do YouTube. O StormCast transcreve, encontra os melhores momentos, enquadra e renderiza cada corte no seu servidor.</p></div>
            <div className="creator-panel"><div className="source-tabs"><button className="active"><Link2 size={16} /> YouTube</button><button disabled title="Em desenvolvimento"><Video size={16} /> Upload em breve</button></div><div className={`hero-input${inputError ? " has-error" : ""}`}><Link2 size={20} /><input value={videoUrl} onChange={(event) => { setVideoUrl(event.target.value); setMetadata(null); setInputError(""); }} onKeyDown={(event) => event.key === "Enter" && void inspectSource(true)} placeholder="https://youtube.com/watch?v=..." aria-label="Link do YouTube" /><button disabled={inspecting} onClick={() => void inspectSource(true)}><WandSparkles size={17} /> {inspecting ? "Consultando..." : "Criar cortes"}</button></div><div className="source-help"><span>{inputError || "YouTube primeiro • até 90 minutos • use apenas conteúdo autorizado"}</span><div><i>YouTube</i><i>FFmpeg</i><i>OpenAI</i></div></div></div>
            <div className="quick-actions"><button onClick={openNewProject}><span><Sparkles /></span><div><strong>Cortes automáticos</strong><small>Transcrição, seleção e MP4 reais</small></div><ArrowRight /></button><button onClick={() => changeView("projects")}><span><FolderOpen /></span><div><strong>Acompanhar a fila</strong><small>Veja o progresso do servidor</small></div><ArrowRight /></button><button onClick={() => changeView("brand")}><span><Palette /></span><div><strong>Definir identidade</strong><small>Escolha o estilo de legenda</small></div><ArrowRight /></button></div>
          </section>
          <section className="dashboard-grid"><div className="dashboard-main-column"><div className="section-heading"><div><span>SEUS CONTEÚDOS</span><h2>Projetos recentes</h2></div><button onClick={() => changeView("projects")}>Ver todos <ArrowRight size={15} /></button></div><div className="project-grid project-grid-home">{projects.slice(0, 3).map(projectCard)}<button className="empty-project-card" onClick={openNewProject}><span><Plus /></span><strong>Novo projeto</strong><small>Comece com um vídeo do YouTube</small></button></div></div>
            <aside className="insights-panel"><div className="section-heading compact"><div><span>DADOS REAIS</span><h2>Sua produção</h2></div><BarChart3 size={19} /></div><div className="metrics-grid"><div className="metric metric-accent"><strong>{totalClips}</strong><span>cortes renderizados</span></div><div className="metric"><strong>{averageScore || "—"}</strong><span>score médio da IA</span></div><div className="metric"><strong>{readyProjects.length}</strong><span>projetos concluídos</span></div><div className="metric"><strong>{creditBalance}</strong><span>créditos restantes</span></div></div><div className="insight-card"><span><Sparkles /></span><div><strong>Sem números inventados</strong><p>Este painel mostra apenas projetos, cortes e créditos salvos no servidor.</p></div></div></aside>
          </section>
        </div>}

        {view === "projects" && <div className="collection-view"><div className="collection-head"><div><span className="eyebrow simple"><FolderOpen size={14} /> BIBLIOTECA</span><h1>Seus projetos</h1><p>Reprocesse falhas, ajuste configurações e gerencie os arquivos.</p></div><div className="collection-head-actions">{selectedProjectIds.length > 0 && <button className="bulk-delete-button" disabled={projectActionBusy === "bulk-delete"} onClick={() => void removeSelectedProjects()}><Trash2 /> {projectActionBusy === "bulk-delete" ? "Excluindo..." : `Excluir selecionados (${selectedProjectIds.length})`}</button>}<button className="primary-button" onClick={openNewProject}><Plus /> Novo projeto</button></div></div><div className="filter-bar"><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar projeto" /></label><div>{([
          ["all", "Todos"], ["active", "Em andamento"], ["ready", "Prontos"], ["failed", "Falharam"], ["cancelled", "Cancelados"],
        ] as const).map(([id, label]) => <button key={id} className={statusFilter === id ? "active" : ""} onClick={() => setStatusFilter(id)}>{label} <span>{projectCounts[id]}</span></button>)}</div></div>{loadingProjects ? <div className="empty-state"><span><Sparkles /></span><h3>Carregando projetos</h3><p>Consultando a fila no servidor.</p></div> : <><div className="project-grid collection-grid">{filteredProjects.map(projectCard)}</div>{!filteredProjects.length && <div className="empty-state"><span><FolderOpen /></span><h3>Nenhum projeto neste filtro</h3><p>Escolha outro status ou crie um processamento.</p><button className="primary-button" onClick={openNewProject}><Plus /> Criar projeto</button></div>}</>}</div>}

        {view === "clips" && <div className="clips-view">{currentProject?.status === "ready" ? <><div className="clips-head"><div className="project-title-line"><button onClick={() => changeView("projects")}><ArrowLeft /></button><div><span>{currentProject.platform} • {formatDate(currentProject.createdAt)}</span><h1>{currentProject.title}</h1></div></div><div className="head-actions"><button className="primary-button" onClick={openNewProject}><Plus /> Novo projeto</button></div></div><div className="result-summary"><div className="summary-orb"><Check /></div><div><span>PROCESSAMENTO CONCLUÍDO</span><h2>{currentProject.clips.length} cortes renderizados</h2><p>Arquivos MP4 privados, com legenda e prontos para baixar.</p></div><div className="summary-stats"><span><strong>{Math.max(0, ...currentProject.clips.map((clip) => clip.score))}</strong>melhor score</span><span><strong>{currentProject.format}</strong>proporção</span></div></div><div className="clip-toolbar"><div><button className="active">Todos ({currentProject.clips.length})</button></div><button><BarChart3 size={16} /> Maior score</button></div><div className="clips-grid">{currentProject.clips.map((clip, index) => <article className="clip-card" key={clip.id}><button className="clip-preview real-clip-preview" onClick={() => setPreviewClip(clip)}><img src={clip.posterUrl} alt={`Prévia de ${clip.title}`} /><span className="clip-number">{String(index + 1).padStart(2, "0")}</span><span className="play-button"><Play size={20} /></span><span className="clip-caption-preview">{clip.hook}</span><span className="clip-time"><Clock3 size={13} /> {Math.round(clip.durationSeconds)}s</span></button><div className="clip-body"><div className="clip-score"><Sparkles size={14} /><strong>{clip.score}</strong><span>score da IA</span></div><h3>{clip.title}</h3><p>“{clip.hook}”</p><div className="clip-range"><span>{formatClock(clip.startSeconds)} — {formatClock(clip.endSeconds)}</span><span>{currentProject.format}</span></div><div className="clip-actions"><button onClick={() => setPreviewClip(clip)}><Play size={15} /> Prévia</button><button className={copied === clip.id ? "copied" : ""} onClick={() => void copyCaption(clip)}>{copied === clip.id ? <Check size={15} /> : <Copy size={15} />}{copied === clip.id ? "Copiado" : "Legenda"}</button><a href={clip.downloadUrl}><Download size={15} /> Baixar MP4</a></div></div></article>)}</div></> : <div className="empty-state"><span><Video /></span><h3>Nenhum corte pronto selecionado</h3><p>Abra um projeto concluído ou acompanhe a fila.</p><button className="primary-button" onClick={() => changeView("projects")}>Ver projetos</button></div>}</div>}

        {view === "live" && <div className="collection-view"><div className="collection-head"><div><span className="eyebrow simple"><Radio size={14} /> PRÓXIMA ETAPA</span><h1>Monitoramento de lives</h1><p>Essa função ainda não processa transmissões. Ela virá depois da estabilização do YouTube.</p></div></div><div className="empty-state feature-coming"><span><Radio /></span><h3>Em desenvolvimento</h3><p>Nenhuma live fictícia será exibida. Primeiro estamos entregando download, transcrição e cortes reais do YouTube.</p></div></div>}

        {view === "brand" && <div className="collection-view"><div className="collection-head"><div><span className="eyebrow simple"><Palette size={14} /> IDENTIDADE</span><h1>Brand kit</h1><p>Defina a cor de referência e o estilo de legenda dos próximos projetos.</p></div></div><div className="brand-layout"><section className="brand-controls"><div className="brand-control"><label>Cor da marca</label><div className="color-field"><input type="color" value={brandColor} onChange={(event) => setBrandColor(event.target.value)} /><input value={brandColor} onChange={(event) => setBrandColor(event.target.value)} /></div></div><div className="brand-control"><label>Estilo padrão de legenda</label><div className="brand-caption-list">{captionStyles.map((style) => <button key={style.id} className={captionStyle === style.id ? "selected" : ""} onClick={() => setCaptionStyle(style.id)}><span className={style.css}>{style.sample}</span><strong>{style.label}</strong>{captionStyle === style.id && <Check />}</button>)}</div></div><p className="brand-save-note">O estilo escolhido será enviado ao renderizador no próximo projeto.</p></section><aside className="brand-preview"><span>PRÉVIA</span><div className="brand-phone" style={{ borderColor: brandColor }}><VisualArt /><div className={`caption-overlay ${selectedCaption.css}`}>{selectedCaption.sample}</div><small>@{userHandle}</small></div></aside></div></div>}

        {view === "analytics" && <div className="analytics-view"><div className="collection-head"><div><span className="eyebrow simple"><BarChart3 size={14} /> PRODUÇÃO</span><h1>Desempenho</h1><p>Métricas internas dos processamentos concluídos.</p></div></div><div className="analytics-metrics"><article><span>PROJETOS PRONTOS</span><strong>{readyProjects.length}</strong><small>concluídos no servidor</small></article><article><span>CORTES</span><strong>{totalClips}</strong><small>MP4 renderizados</small></article><article><span>SCORE MÉDIO</span><strong>{averageScore || "—"}</strong><small>avaliação editorial da IA</small></article><article><span>CRÉDITOS</span><strong>{creditBalance}</strong><small>saldo disponível</small></article></div><div className="analytics-card"><div><span>VOLUME POR PROJETO</span><h2>Mapa de produção real</h2></div>{readyProjects.length ? <div className="analytics-bars">{readyProjects.slice(0, 8).map((project) => <div key={project.id}><span style={{ height: `${Math.max(18, project.clips.length * 12)}%` }} /><small>{project.clips.length}</small></div>)}</div> : <p>Conclua o primeiro projeto para preencher este gráfico.</p>}<p>Score é uma avaliação editorial da IA, não uma promessa de visualizações.</p></div></div>}

        {view === "billing" && <div className="collection-view account-view"><div className="collection-head"><div><span className="eyebrow simple"><CreditCard size={14} /> CONTA</span><h1>Plano e créditos</h1><p>O saldo é consumido somente quando a renderização termina com sucesso.</p></div></div><div className="balance-card"><div><span><Sparkles /></span><div><small>SALDO DISPONÍVEL</small><strong>{creditBalance} créditos</strong><p>1 crédito por minuto analisado. Falhas e cancelamentos não são cobrados.</p></div></div><em>Plano atual</em></div><div className="studio-plan-grid"><article className="active"><span>ATUAL</span><h3>Explorar</h3><strong>Seu acesso</strong><p>YouTube, transcrição por IA, seleção e renderização privada.</p><button disabled>Plano ativo</button></article><article><span>EM BREVE</span><h3>Criador</h3><strong>Mais capacidade</strong><p>Compra de créditos e maior volume.</p><button disabled>Ainda indisponível</button></article><article><span>SUPORTE</span><h3>Implantação</h3><strong>StormCast</strong><p>Ajuda técnica para o servidor.</p><a href="mailto:contato@stormcast.site">Falar com a equipe</a></article></div></div>}

        {view === "settings" && <div className="collection-view account-view"><div className="collection-head"><div><span className="eyebrow simple"><Settings size={14} /> PREFERÊNCIAS</span><h1>Configurações</h1><p>Informações da conta e segurança.</p></div></div><div className="settings-grid"><section><span className="settings-avatar">{userInitials}</span><div><small>NOME</small><strong>{user.name}</strong></div><div><small>E-MAIL</small><strong>{user.email}</strong></div><div><small>PERFIL</small><strong>{user.role === "admin" ? "Administrador" : "Usuário"}</strong></div></section><section><div className="security-callout"><ShieldCheck /><div><strong>Sessão protegida</strong><p>Projetos e arquivos só são entregues ao proprietário autenticado.</p></div></div><button className="danger-signout" onClick={signOut}><LogOut /> Encerrar esta sessão</button></section></div></div>}
      </main>
    </div>

    {wizardStep !== null && <div className="wizard-layer" role="dialog" aria-modal="true" aria-label={editingProjectId ? "Editar e reprocessar projeto" : "Configurar novo projeto"}>
      <div className="wizard-top"><button className="brand-lockup" onClick={() => setWizardStep(null)}><span className="brand-mark"><span /></span><span><strong>StormCast</strong><small>{editingProjectId ? "RECOVERY FLOW" : "CREATE FLOW"}</small></span></button><div className="stepper">{[0, 1, 2, 3, 4].map((step) => <span key={step} className={step < wizardStep ? "done" : step === wizardStep ? "active" : ""}>{step < wizardStep ? <Check size={13} /> : step + 1}</span>)}</div><button className="wizard-close" onClick={() => setWizardStep(null)} aria-label="Fechar"><X /></button></div>
      <div className="wizard-content">
        {wizardStep === 0 && <section className="wizard-step source-step"><span className="step-kicker">PASSO 1 DE 5</span><h1>Qual vídeo vamos processar?</h1><p>Use um vídeo do YouTube que você tenha autorização para editar.</p><div className={`wizard-link-field${inputError ? " has-error" : ""}`}><Link2 /><input value={videoUrl} onChange={(event) => { setVideoUrl(event.target.value); setMetadata(null); setInputError(""); }} placeholder="https://youtube.com/watch?v=..." /></div>{inputError && <span className="field-error">{inputError}</span>}<div className="safe-note"><ShieldCheck size={15} /> O servidor consulta título e duração reais com yt-dlp.</div></section>}

        {wizardStep === 1 && metadata && <section className="wizard-step format-step"><span className="step-kicker">PASSO 2 DE 5</span><h1>Defina o formato do corte</h1><p>Escolha uma composição disponível no renderizador atual.</p><div className="wizard-source-summary"><SourcePicture src={metadata.thumbnailUrl} alt={metadata.title} compact /><div><strong>{metadata.title}</strong><span>{metadata.channel} • {formatClock(metadata.durationSeconds)}</span></div><button onClick={() => setWizardStep(0)}>Trocar</button></div><div className="option-block"><label>Proporção</label><div className="two-options"><button className={format === "9:16" ? "selected" : ""} onClick={() => setFormat("9:16")}><Monitor /><span><strong>Vertical</strong><small>Reels, Shorts e TikTok</small></span>{format === "9:16" && <Check />}</button><button className={format === "16:9" ? "selected" : ""} onClick={() => setFormat("16:9")}><PanelLeftClose /><span><strong>Horizontal</strong><small>YouTube e apresentações</small></span>{format === "16:9" && <Check />}</button></div></div><div className="option-block"><label>Enquadramento</label><div className="layout-options"><button className={framing === "fit" ? "selected" : ""} onClick={() => setFraming("fit")}><Sparkles /><span>Vídeo inteiro<small>Fundo desfocado</small></span>{framing === "fit" && <Check />}</button><button className={framing === "center" ? "selected" : ""} onClick={() => setFraming("center")}><Frame /><span>Corte central<small>Preenche a tela</small></span>{framing === "center" && <Check />}</button></div></div><div className="option-block"><label htmlFor="custom-prompt">Direção para a IA <span>opcional</span></label><textarea id="custom-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={520} rows={5} /><div className="prompt-bottom"><div><button onClick={() => setPrompt("Busque ensinamentos claros, frases marcantes e reflexões práticas. Evite trechos sem conclusão.")}>Educativo</button><button onClick={() => setPrompt("Encontre perguntas fortes, respostas surpreendentes e momentos de alta curiosidade.")}>Curiosidade</button><button onClick={() => setPrompt("Selecione trechos cristãos com contexto completo, clareza bíblica e uma mensagem edificante.")}>Gospel</button></div><span>{prompt.length}/520</span></div></div></section>}

        {wizardStep === 2 && metadata && <section className="wizard-step duration-step"><span className="step-kicker">PASSO 3 DE 5</span><h1>Ajuste a duração</h1><p>Defina o tamanho aproximado dos cortes e quanto do começo do vídeo será analisado.</p><div className="option-block"><label>Duração de cada corte</label><div className="duration-options">{[["30", "30 seg"], ["60", "1 min"], ["90", "1:30 min"], ["180", "3 min"]].map(([value, label]) => <button key={value} className={clipDuration === value ? "selected" : ""} onClick={() => setClipDuration(value)}>{label}</button>)}</div></div><div className="timeline-card"><div className="timeline-head"><label>Intervalo analisado</label><span>{analysisMinutes} min / {maximumAnalysisMinutes} min</span></div><div className="timeline-time"><span>00:00:00</span><strong>{formatClock(Math.min(metadata.durationSeconds, analysisMinutes * 60))}</strong><span>{formatClock(metadata.durationSeconds)}</span></div><div className="timeline-film">{Array.from({ length: 9 }, (_, index) => <div key={index}><SourcePicture src={metadata.thumbnailUrl} alt="" compact /></div>)}</div><input type="range" min={1} max={maximumAnalysisMinutes} value={Math.min(analysisMinutes, maximumAnalysisMinutes)} onChange={(event) => setAnalysisMinutes(Number(event.target.value))} /></div><div className="credit-notice"><span><Sparkles /></span><div><strong>Máximo: {analysisMinutes} créditos</strong><p>A cobrança ocorre só depois que todos os MP4 forem gerados.</p></div><em>{creditBalance} disponíveis</em></div></section>}

        {wizardStep === 3 && metadata && <section className="wizard-step subtitle-step"><span className="step-kicker">PASSO 4 DE 5</span><h1>Como as legendas vão aparecer?</h1><p>O texto será transcrito e sincronizado pela OpenAI.</p><div className="subtitle-layout"><div className={`phone-preview${format === "16:9" ? " phone-landscape" : ""}`}><SourcePicture src={metadata.thumbnailUrl} alt={metadata.title} /><div className={`caption-overlay ${selectedCaption.css}`}>{selectedCaption.sample}</div><span className="handle-preview">@{userHandle}</span></div><div className="subtitle-choices">{captionStyles.map((style) => <button key={style.id} className={captionStyle === style.id ? "selected" : ""} onClick={() => setCaptionStyle(style.id)}><span className={style.css}>{style.sample}</span><strong>{style.label}</strong>{captionStyle === style.id && <i><Check size={13} /></i>}</button>)}</div></div></section>}

        {wizardStep === 4 && metadata && <section className="wizard-step review-step"><span className="step-kicker">PASSO 5 DE 5</span><h1>Pronto para o processamento real</h1><p>O trabalho entrará na fila única do servidor e poderá levar vários minutos sem GPU.</p><div className="review-hero"><div className="review-art"><SourcePicture src={metadata.thumbnailUrl} alt={metadata.title} /><span><Play /></span></div><div><span>YouTube • {metadata.channel}</span><h2>{metadata.title}</h2><p>{metadata.canonicalUrl}</p></div></div><div className="review-grid"><button onClick={() => setWizardStep(1)}><span><Monitor /></span><div><small>FORMATO</small><strong>{format === "9:16" ? "Vertical 9:16" : "Horizontal 16:9"}</strong><em>{framing === "fit" ? "Vídeo inteiro + fundo" : "Corte central"}</em></div><ChevronRight /></button><button onClick={() => setWizardStep(2)}><span><Clock3 /></span><div><small>DURAÇÃO</small><strong>{clipDuration} segundos</strong><em>{analysisMinutes} minutos analisados</em></div><ChevronRight /></button><button onClick={() => setWizardStep(3)}><span><Captions /></span><div><small>LEGENDA</small><strong>{selectedCaption.label}</strong><em>Português automático</em></div><ChevronRight /></button><button onClick={() => setWizardStep(1)}><span><WandSparkles /></span><div><small>DIREÇÃO DA IA</small><strong>{prompt ? "Personalizada" : "Padrão"}</strong><em>{prompt.length} caracteres</em></div><ChevronRight /></button></div><div className="analysis-note"><Sparkles /><div><strong>Etapas reais</strong><p>Download autorizado, extração de áudio, transcrição, seleção editorial e renderização com FFmpeg.</p></div></div>{inputError && <span className="field-error review-error">{inputError}</span>}</section>}
      </div>
      <div className="wizard-footer"><button className="back-button" onClick={() => wizardStep === 0 ? setWizardStep(null) : setWizardStep(wizardStep - 1)}>{wizardStep === 0 ? "Cancelar" : "Voltar"}</button><span>Nada será cobrado antes da conclusão.</span>{wizardStep < 4 ? <button className="primary-button" disabled={inspecting} onClick={() => void advanceWizard()}>{inspecting ? "Consultando..." : "Continuar"} <ArrowRight /></button> : <button className="primary-button launch-button" disabled={creating || !processorConfigured} onClick={() => void createProject()}><Sparkles /> {creating ? "Enviando..." : processorConfigured ? editingProjectId ? "Salvar e reprocessar" : "Iniciar análise real" : "Processador indisponível"}</button>}</div>
    </div>}

    {processingProject && activeStatuses.includes(processingProject.status) && <div className="processing-layer" role="status"><div className="processing-visual"><div className="scan-frame"><SourcePicture src={processingProject.thumbnailUrl} alt={processingProject.title} /><div className="scan-line" /></div><div className="processing-orbit" style={{ background: `conic-gradient(var(--lime) ${processingProject.progress}%, #1c2028 0)` }}><span>{processingProject.progress}%</span></div></div><span className="step-kicker">PROCESSAMENTO REAL</span><h1>{processingProject.stage}</h1><p>{processingProject.title}</p><div className="processing-stages">{[["downloading", "Baixar vídeo"], ["transcribing", "Transcrever áudio"], ["analyzing", "Escolher momentos"], ["rendering", "Renderizar MP4"]].map(([status, label], index, stages) => { const currentIndex = stages.findIndex(([value]) => value === processingProject.status); return <div key={status} className={index < currentIndex ? "done" : index === currentIndex || (processingProject.status === "queued" && index === 0) ? "active" : ""}><span>{index < currentIndex ? <Check size={14} /> : index + 1}</span><strong>{label}</strong>{index === currentIndex && <i />}</div>; })}</div><small>Seu Xeon processa um trabalho por vez. Você pode fechar esta tela e voltar depois.</small><div className="processing-actions"><button onClick={() => setProcessingId(null)}>Continuar em segundo plano</button><button className="cancel-processing" onClick={() => void cancelProject(processingProject.id)}>Cancelar processamento</button></div></div>}

    {processingProject?.status === "failed" && <div className="processing-layer processing-failed" role="alert"><span className="step-kicker">PROCESSAMENTO INTERROMPIDO</span><h1>Não foi possível gerar os cortes</h1><p>{friendlyProjectError(processingProject.error)}</p><small>Nenhum crédito foi descontado. Você pode reutilizar este mesmo projeto.</small><div className="processing-actions processing-recovery-actions"><button onClick={() => { setProcessingId(null); setView("projects"); }}>Voltar aos projetos</button><button onClick={() => editExistingProject(processingProject)}><Pencil /> Editar configurações</button><button className="primary-button" disabled={projectActionBusy === processingProject.id} onClick={() => void projectAction(processingProject, "retry")}><RotateCcw /> {projectActionBusy === processingProject.id ? "Reenviando..." : "Reprocessar agora"}</button></div></div>}

    {previewClip && currentProject && <div className="preview-modal" role="dialog" aria-modal="true"><button className="preview-scrim" onClick={() => setPreviewClip(null)} aria-label="Fechar prévia" /><div className="preview-dialog"><div className="preview-dialog-head"><div><span>ARQUIVO RENDERIZADO</span><h2>{previewClip.title}</h2></div><button onClick={() => setPreviewClip(null)}><X /></button></div><div className="preview-stage"><video className={`preview-video-element${currentProject.format === "16:9" ? " preview-landscape" : ""}`} src={previewClip.videoUrl} poster={previewClip.posterUrl} controls autoPlay playsInline /></div><div className="preview-info"><div><span><Clock3 /> {formatClock(previewClip.startSeconds)} — {formatClock(previewClip.endSeconds)}</span><span><Sparkles /> Score {previewClip.score}</span></div><p>{previewClip.caption}</p><div className="preview-downloads"><button className="secondary-button" onClick={() => void copyCaption(previewClip)}><Copy /> Copiar legenda</button><a className="primary-button" href={previewClip.downloadUrl}><Download /> Baixar MP4</a></div></div></div></div>}
  </div>;
}
