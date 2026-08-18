"use client";

import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  Captions,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  CreditCard,
  Download,
  FileVideo2,
  Focus,
  FolderOpen,
  Frame,
  Home,
  Layers3,
  Link2,
  LogOut,
  Menu,
  Monitor,
  Palette,
  PanelLeftClose,
  Play,
  Plus,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  SplitSquareVertical,
  Upload,
  Video,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type View = "dashboard" | "projects" | "clips" | "live" | "brand" | "analytics" | "billing" | "settings";
type Platform = "YouTube" | "Twitch" | "Kick" | "Drive" | "Arquivo";

type Clip = {
  id: string;
  title: string;
  hook: string;
  start: string;
  end: string;
  duration: number;
  score: number;
  caption: string;
  theme: string;
};

type Project = {
  id: string;
  title: string;
  platform: Platform;
  createdAt: string;
  status: "Pronto" | "Analisando";
  format: "9:16" | "16:9";
  source: string;
  clips: Clip[];
};

const captionStyles = [
  { id: "impact", label: "Impacto dourado", css: "caption-gold", sample: "NÃO FOI POR ACASO" },
  { id: "clean", label: "Clean", css: "caption-clean", sample: "Existe um propósito" },
  { id: "viral", label: "Viral pop", css: "caption-pop", sample: "VOCÊ PRECISA OUVIR" },
  { id: "neon", label: "Neon", css: "caption-neon", sample: "ISSO MUDA TUDO" },
  { id: "focus", label: "Foco", css: "caption-focus", sample: "preste atenção" },
  { id: "editorial", label: "Editorial", css: "caption-editorial", sample: "Uma verdade simples" },
];

const clipSeed: Omit<Clip, "id">[] = [
  {
    title: "A pergunta que muda a leitura de Gênesis",
    hook: "E se o texto estiver respondendo uma pergunta diferente da nossa?",
    start: "02:14",
    end: "03:02",
    duration: 48,
    score: 96,
    caption: "E se você estiver lendo Gênesis com a pergunta errada? O contexto muda tudo — sem complicar a mensagem.",
    theme: "violet",
  },
  {
    title: "Fé não é ausência de perguntas",
    hook: "A dúvida honesta pode ser o começo de uma fé mais madura.",
    start: "11:38",
    end: "12:31",
    duration: 53,
    score: 93,
    caption: "Perguntar não diminui a fé. Quando a busca é sincera, ela pode aprofundar aquilo em que acreditamos.",
    theme: "blue",
  },
  {
    title: "O detalhe bíblico que quase todos ignoram",
    hook: "Uma palavra pequena muda o sentido de toda a passagem.",
    start: "18:05",
    end: "18:44",
    duration: 39,
    score: 91,
    caption: "Um detalhe no texto revela uma camada que muita gente passa rápido demais. Salve para estudar depois.",
    theme: "amber",
  },
  {
    title: "Como responder sem transformar tudo em briga",
    hook: "Verdade sem amor vira apenas barulho.",
    start: "26:17",
    end: "27:13",
    duration: 56,
    score: 89,
    caption: "Dá para defender uma convicção sem perder o respeito. Clareza e amor não são opostos.",
    theme: "rose",
  },
  {
    title: "O contexto antes da conclusão",
    hook: "Não use um versículo antes de ouvir o que o capítulo está dizendo.",
    start: "34:42",
    end: "35:27",
    duration: 45,
    score: 87,
    caption: "Antes de tirar uma frase do texto, veja a conversa inteira. Contexto protege a mensagem.",
    theme: "cyan",
  },
  {
    title: "Uma reflexão para terminar o dia",
    hook: "Talvez você não precise de todas as respostas hoje.",
    start: "48:09",
    end: "49:02",
    duration: 53,
    score: 84,
    caption: "Nem tudo precisa ser resolvido agora. Às vezes, confiar também é continuar caminhando.",
    theme: "green",
  },
];

const demoProjects: Project[] = [
  {
    id: "demo-genesis",
    title: "Gênesis: um relato ou duas tradições?",
    platform: "YouTube",
    createdAt: "Hoje, 09:42",
    status: "Pronto",
    format: "9:16",
    source: "youtube.com/watch?v=stormcast-demo",
    clips: clipSeed.slice(0, 4).map((clip, index) => ({ ...clip, id: "demo-" + index })),
  },
  {
    id: "demo-proposito",
    title: "Como manter o propósito nos dias difíceis",
    platform: "YouTube",
    createdAt: "Ontem, 21:18",
    status: "Pronto",
    format: "9:16",
    source: "youtube.com/watch?v=stormcast-proposito",
    clips: clipSeed.slice(2, 5).map((clip, index) => ({ ...clip, id: "purpose-" + index })),
  },
];

const supportedHosts: Record<string, Platform> = {
  "youtube.com": "YouTube",
  "www.youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "twitch.tv": "Twitch",
  "www.twitch.tv": "Twitch",
  "kick.com": "Kick",
  "www.kick.com": "Kick",
  "drive.google.com": "Drive",
};

function platformFromUrl(value: string): Platform | null {
  try {
    return supportedHosts[new URL(value).hostname.toLowerCase()] || null;
  } catch {
    return null;
  }
}

function formatClock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const short = String(minutes).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
  return hours ? String(hours).padStart(2, "0") + ":" + short : short;
}

function formatBytes(bytes: number) {
  return bytes > 1024 * 1024 ? (bytes / (1024 * 1024)).toFixed(1) + " MB" : Math.ceil(bytes / 1024) + " KB";
}

function projectTitle(source: string, fileName: string) {
  if (fileName) return fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
  const platform = platformFromUrl(source);
  if (platform === "YouTube") return "Novo podcast importado do YouTube";
  if (platform === "Twitch") return "Transmissão importada da Twitch";
  if (platform === "Kick") return "Transmissão importada da Kick";
  if (platform === "Drive") return "Vídeo importado do Google Drive";
  return "Novo projeto StormCast";
}

function VisualArt({ theme = "violet", compact = false }: { theme?: string; compact?: boolean }) {
  return (
    <div className={"visual-art theme-" + theme + (compact ? " visual-art-compact" : "")} aria-hidden="true">
      <div className="visual-orbit orbit-one" />
      <div className="visual-orbit orbit-two" />
      <div className="visual-mic"><span /></div>
      <div className="visual-wave">
        {[18, 34, 22, 48, 62, 30, 54, 26, 44, 18, 36].map((height, index) => (
          <i key={index} style={{ height: height + "%" }} />
        ))}
      </div>
      <div className="visual-tag">STORMCAST</div>
    </div>
  );
}

function ProjectCard({ project, onOpen }: { project: Project; onOpen: () => void }) {
  const bestScore = Math.max(...project.clips.map((clip) => clip.score), 0);
  return (
    <button className="project-card" onClick={onOpen}>
      <div className="project-cover">
        <VisualArt theme={project.clips[0]?.theme} compact />
        <span className="score-chip"><Sparkles size={13} /> {bestScore}%</span>
        <span className="project-format">{project.format}</span>
      </div>
      <div className="project-card-body">
        <div className="project-source"><i />{project.platform}</div>
        <h3>{project.title}</h3>
        <div className="project-meta"><span>{project.clips.length} cortes</span><span>{project.createdAt}</span></div>
      </div>
    </button>
  );
}

const nav: { label: string; items: { id: View; label: string; Icon: LucideIcon; badge?: string }[] }[] = [
  { label: "Visão geral", items: [{ id: "dashboard", label: "Início", Icon: Home }] },
  {
    label: "Produzir",
    items: [
      { id: "projects", label: "Projetos", Icon: FolderOpen },
      { id: "clips", label: "Meus cortes", Icon: Video },
      { id: "brand", label: "Brand kit", Icon: Palette },
    ],
  },
  {
    label: "Acompanhar",
    items: [
      { id: "live", label: "Monitorar lives", Icon: Radio, badge: "BETA" },
      { id: "analytics", label: "Desempenho", Icon: BarChart3 },
    ],
  },
  {
    label: "Conta",
    items: [
      { id: "billing", label: "Plano e créditos", Icon: CreditCard },
      { id: "settings", label: "Configurações", Icon: Settings },
    ],
  },
];

const viewTitles: Record<View, string> = {
  dashboard: "Início",
  projects: "Projetos",
  clips: "Meus cortes",
  live: "Monitorar lives",
  brand: "Brand kit",
  analytics: "Desempenho",
  billing: "Plano e créditos",
  settings: "Configurações",
};

export type StudioUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  credits: number;
};

export default function StudioApp({ user }: { user: StudioUser }) {
  const [view, setView] = useState<View>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [inputError, setInputError] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState("");
  const [fileDuration, setFileDuration] = useState(3600);
  const [fileUrl, setFileUrl] = useState("");
  const [wizardStep, setWizardStep] = useState<number | null>(null);
  const [format, setFormat] = useState<"9:16" | "16:9">("9:16");
  const [framing, setFraming] = useState("auto");
  const [prompt, setPrompt] = useState("Selecione os melhores cortes deste podcast cristão para Shorts, Reels e TikTok. Priorize trechos claros, perguntas fortes, explicações bíblicas, curiosidades, reflexões e frases marcantes. Preserve o contexto e não distorça a mensagem.");
  const [clipDuration, setClipDuration] = useState("60");
  const [analysisMinutes, setAnalysisMinutes] = useState(60);
  const [captionStyle, setCaptionStyle] = useState("impact");
  const [projects, setProjects] = useState<Project[]>(demoProjects);
  const [currentProject, setCurrentProject] = useState<Project | null>(demoProjects[0]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewClip, setPreviewClip] = useState<Clip | null>(null);
  const [copied, setCopied] = useState("");
  const [query, setQuery] = useState("");
  const [liveQuery, setLiveQuery] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const storageKey = `stormcast-projects-v2:${user.id}`;
  const userInitials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "SC";
  const userHandle = user.email.split("@")[0].replace(/[^a-z0-9_.-]/gi, "").toLowerCase() || "stormcast";
  const workspaceName = `${user.name.split(/\s+/)[0] || "Meu"} Studio`;

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return;
    let timer = 0;
    try {
      const parsed = JSON.parse(saved) as Project[];
      if (parsed.length) {
        timer = window.setTimeout(() => {
          setProjects(parsed);
          setCurrentProject(parsed[0]);
        }, 0);
      }
    } catch {
      // Keep the demo workspace if browser data is invalid.
    }
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  const platform = useMemo<Platform>(() => fileName ? "Arquivo" : platformFromUrl(videoUrl) || "YouTube", [fileName, videoUrl]);
  const selectedCaption = captionStyles.find((style) => style.id === captionStyle) || captionStyles[0];
  const maxMinutes = Math.max(5, Math.min(240, Math.ceil(fileDuration / 60) || 60));
  const totalClips = projects.reduce((sum, item) => sum + item.clips.length, 0);
  const filteredProjects = projects.filter((item) => (item.title + " " + item.platform).toLowerCase().includes(query.toLowerCase()));

  function persist(next: Project[]) {
    setProjects(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  function resetSource() {
    setVideoUrl("");
    setFileName("");
    setFileSize("");
    setFileDuration(3600);
    setInputError("");
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFileUrl("");
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setInputError("Escolha um arquivo de vídeo válido.");
      return;
    }
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    const nextUrl = URL.createObjectURL(file);
    setFileUrl(nextUrl);
    setFileName(file.name);
    setFileSize(formatBytes(file.size));
    setVideoUrl("");
    setInputError("");
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      const duration = Number.isFinite(probe.duration) ? probe.duration : 3600;
      setFileDuration(duration);
      setAnalysisMinutes(Math.min(60, Math.max(5, Math.ceil(duration / 60))));
    };
    probe.src = nextUrl;
  }

  function validSource() {
    if (fileName) return true;
    if (!videoUrl.trim()) {
      setInputError("Cole o link do vídeo ou envie um arquivo para continuar.");
      return false;
    }
    if (!platformFromUrl(videoUrl.trim())) {
      setInputError("Use um link do YouTube, Twitch, Kick ou Google Drive.");
      return false;
    }
    setInputError("");
    return true;
  }

  function startFromDashboard() {
    if (validSource()) setWizardStep(1);
  }

  function openNewProject() {
    resetSource();
    setWizardStep(0);
  }

  function changeView(next: View) {
    setView(next);
    setMenuOpen(false);
  }

  function openProject(project: Project) {
    setCurrentProject(project);
    changeView("clips");
  }

  function createClips() {
    setWizardStep(null);
    setProcessing(true);
    setProgress(0);
    let value = 0;
    const timer = window.setInterval(() => {
      value += value < 65 ? 4 : value < 90 ? 2 : 1;
      const safe = Math.min(100, value);
      setProgress(safe);
      if (safe < 100) return;
      window.clearInterval(timer);
      const seconds = clipDuration === "auto" ? 52 : Number(clipDuration);
      const count = analysisMinutes <= 20 ? 3 : analysisMinutes <= 60 ? 6 : 8;
      const clips = Array.from({ length: count }, (_, index) => ({
        ...clipSeed[index % clipSeed.length],
        id: "clip-" + Date.now() + "-" + index,
        duration: seconds,
      }));
      const project: Project = {
        id: "project-" + Date.now(),
        title: projectTitle(videoUrl, fileName),
        platform,
        createdAt: "Agora",
        status: "Pronto",
        format,
        source: fileName || videoUrl,
        clips,
      };
      persist([project, ...projects]);
      setCurrentProject(project);
      setView("clips");
      window.setTimeout(() => setProcessing(false), 350);
    }, 100);
  }

  async function copyCaption(clip: Clip) {
    try {
      await navigator.clipboard.writeText(clip.caption);
      setCopied(clip.id);
      window.setTimeout(() => setCopied(""), 1500);
    } catch {
      setCopied("");
    }
  }

  function exportProject(project: Project) {
    const payload = { project: project.title, source: project.source, format: project.format, prompt, captionStyle: selectedCaption.label, clips: project.clips };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "stormcast-cortes.json";
    anchor.click();
    URL.revokeObjectURL(href);
  }

  const stage = progress < 28 ? 0 : progress < 58 ? 1 : progress < 82 ? 2 : 3;

  return (
    <div className="app-shell">
      <aside className={"sidebar" + (menuOpen ? " sidebar-open" : "")}>
        <div className="sidebar-head">
          <button className="brand-lockup" onClick={() => changeView("dashboard")}>
            <span className="brand-mark"><span /></span>
            <span><strong>StormCast</strong><small>AI VIDEO STUDIO</small></span>
          </button>
          <button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"><X /></button>
        </div>

        <button className="workspace-switcher">
          <span className="workspace-avatar">{userInitials}</span>
          <span><small>ESPAÇO DE TRABALHO</small><strong>{workspaceName}</strong></span>
          <ChevronRight size={15} />
        </button>
        <button className="new-project-side" onClick={openNewProject}><Plus size={17} /> Novo projeto</button>

        <nav className="side-nav" aria-label="Navegação principal">
          {nav.map((group, groupIndex) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-label"><span>0{groupIndex + 1}</span>{group.label}</div>
              {group.items.map((item) => (
                <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => changeView(item.id)}>
                  <item.Icon size={17} /><span>{item.label}</span>{item.badge && <em>{item.badge}</em>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button><CircleHelp size={17} /> Central de ajuda</button>
          {user.role === "admin" && <a className="sidebar-admin-link" href="/admin"><ShieldCheck size={17} /> Administração</a>}
          <button onClick={() => changeView("settings")}><Settings size={17} /> Configurações</button>
          <div className="user-card"><span className="user-avatar">{userInitials}</span><span><strong>{user.name}</strong><small>{user.role === "admin" ? "Administrador" : "Plano gratuito"}</small></span><button onClick={signOut} aria-label="Sair da conta"><LogOut /></button></div>
        </div>
      </aside>
      {menuOpen && <button className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-label="Fechar menu" />}

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu /></button>
            <i />
            <span>{viewTitles[view]}</span>
          </div>
          <div className="top-actions">
            <span className="status-pill"><i /> Sistema operacional</span>
            <button className="credit-pill" onClick={() => changeView("billing")}><Sparkles size={15} /><strong>{user.credits}</strong><span>créditos</span></button>
            <button className="icon-button" aria-label="Notificações"><Bell size={18} /><i /></button>
            <span className="top-avatar">{userInitials}</span>
          </div>
        </header>

        <main className="main-content">
          {view === "dashboard" && (
            <div className="dashboard-view">
              <section className="hero-section">
                <div className="hero-glow" />
                <div className="hero-copy">
                  <div className="eyebrow"><span><Sparkles size={14} /></span> CORTE INTELIGENTE POR IA</div>
                  <h1>Transforme conversas em<br /><em>cortes que prendem.</em></h1>
                  <p>Cole um link ou envie seu vídeo. O StormCast encontra os melhores momentos, enquadra, legenda e deixa tudo pronto para publicar.</p>
                </div>

                <div className="creator-panel">
                  <div className="source-tabs">
                    <button className={!fileName ? "active" : ""} onClick={() => fileName && resetSource()}><Link2 size={16} /> Link do vídeo</button>
                    <button className={fileName ? "active" : ""} onClick={() => fileInput.current?.click()}><Upload size={16} /> Enviar arquivo</button>
                  </div>
                  {fileName ? (
                    <div className="uploaded-file">
                      <span><FileVideo2 /></span><div><strong>{fileName}</strong><small>{fileSize} • {formatClock(fileDuration)}</small></div>
                      <button onClick={resetSource} aria-label="Remover arquivo"><X size={17} /></button>
                    </div>
                  ) : (
                    <div className={"hero-input" + (inputError ? " has-error" : "")}>
                      <Link2 size={20} />
                      <input value={videoUrl} onChange={(event) => { setVideoUrl(event.target.value); setInputError(""); }} onKeyDown={(event) => event.key === "Enter" && startFromDashboard()} placeholder="Cole um link do YouTube, Twitch, Kick ou Drive" aria-label="Link do vídeo" />
                      <button onClick={startFromDashboard}><WandSparkles size={17} /> Criar cortes</button>
                    </div>
                  )}
                  {fileName && <button className="file-continue" onClick={startFromDashboard}><WandSparkles size={17} /> Configurar cortes</button>}
                  <input ref={fileInput} type="file" accept="video/*" hidden onChange={handleFile} />
                  <div className="source-help"><span>{inputError || "Funciona com vídeos de até 4 horas"}</span><div><i>YouTube</i><i>Twitch</i><i>Kick</i><i>Drive</i><i>MP4</i></div></div>
                </div>

                <div className="quick-actions">
                  <button onClick={openNewProject}><span><Sparkles /></span><div><strong>Cortes automáticos</strong><small>A IA encontra os melhores momentos</small></div><ArrowRight /></button>
                  <button onClick={() => changeView("live")}><span><Radio /></span><div><strong>Monitorar uma live</strong><small>Capture destaques em tempo real</small></div><ArrowRight /></button>
                  <button onClick={() => changeView("brand")}><span><Palette /></span><div><strong>Definir identidade</strong><small>Fontes, cores e assinatura visual</small></div><ArrowRight /></button>
                </div>
              </section>

              <section className="dashboard-grid">
                <div className="dashboard-main-column">
                  <div className="section-heading"><div><span>SEUS CONTEÚDOS</span><h2>Projetos recentes</h2></div><button onClick={() => changeView("projects")}>Ver todos <ArrowRight size={15} /></button></div>
                  <div className="project-grid project-grid-home">
                    {projects.slice(0, 3).map((item) => <ProjectCard key={item.id} project={item} onOpen={() => openProject(item)} />)}
                    <button className="empty-project-card" onClick={openNewProject}><span><Plus /></span><strong>Novo projeto</strong><small>Comece com um link ou arquivo</small></button>
                  </div>
                </div>
                <aside className="insights-panel">
                  <div className="section-heading compact"><div><span>ESTA SEMANA</span><h2>Seu ritmo</h2></div><BarChart3 size={19} /></div>
                  <div className="metrics-grid">
                    <div className="metric metric-accent"><strong>{totalClips}</strong><span>cortes gerados</span></div>
                    <div className="metric"><strong>92</strong><span>score médio</span></div>
                    <div className="metric"><strong>3h</strong><span>tempo poupado</span></div>
                    <div className="metric"><strong>9:16</strong><span>formato favorito</span></div>
                  </div>
                  <div className="insight-card"><span><Sparkles /></span><div><strong>Seu melhor padrão</strong><p>Cortes de 45–60 segundos com pergunta no início recebem os maiores scores.</p></div></div>
                </aside>
              </section>
            </div>
          )}

          {view === "projects" && (
            <div className="collection-view">
              <div className="collection-head">
                <div><span className="eyebrow simple"><FolderOpen size={14} /> BIBLIOTECA</span><h1>Seus projetos</h1><p>Tudo o que você criou, organizado em um só lugar.</p></div>
                <button className="primary-button" onClick={openNewProject}><Plus /> Novo projeto</button>
              </div>
              <div className="filter-bar"><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome ou plataforma" /></label><div><button className="active">Todos</button><button>Prontos</button><button>Em análise</button></div></div>
              <div className="project-grid collection-grid">{filteredProjects.map((item) => <ProjectCard key={item.id} project={item} onOpen={() => openProject(item)} />)}</div>
              {!filteredProjects.length && <div className="empty-state"><span><Search /></span><h3>Nenhum projeto encontrado</h3><p>Tente outro termo de busca.</p></div>}
            </div>
          )}

          {view === "clips" && currentProject && (
            <div className="clips-view">
              <div className="clips-head">
                <div className="project-title-line"><button onClick={() => changeView("projects")}><ArrowLeft /></button><div><span>{currentProject.platform} • {currentProject.createdAt}</span><h1>{currentProject.title}</h1></div></div>
                <div className="head-actions"><button className="secondary-button" onClick={() => exportProject(currentProject)}><Download /> Exportar lista</button><button className="primary-button" onClick={openNewProject}><Plus /> Novo projeto</button></div>
              </div>
              <div className="result-summary">
                <div className="summary-orb"><Check /></div>
                <div><span>ANÁLISE CONCLUÍDA</span><h2>{currentProject.clips.length} cortes encontrados</h2><p>Ordenados por retenção, clareza e força do gancho.</p></div>
                <div className="summary-stats"><span><strong>{Math.max(...currentProject.clips.map((clip) => clip.score))}%</strong>melhor score</span><span><strong>{currentProject.format}</strong>proporção</span></div>
              </div>
              <div className="clip-toolbar"><div><button className="active">Todos ({currentProject.clips.length})</button><button>Favoritos</button><button>Publicados</button></div><button><BarChart3 size={16} /> Maior score</button></div>
              <div className="clips-grid">
                {currentProject.clips.map((clip, index) => (
                  <article className="clip-card" key={clip.id}>
                    <button className="clip-preview" onClick={() => setPreviewClip(clip)}>
                      <VisualArt theme={clip.theme} />
                      <span className="clip-number">0{index + 1}</span><span className="play-button"><Play size={20} /></span>
                      <span className="clip-caption-preview">{clip.hook}</span><span className="clip-time"><Clock3 size={13} /> {clip.duration}s</span>
                    </button>
                    <div className="clip-body">
                      <div className="clip-score"><Sparkles size={14} /><strong>{clip.score}</strong><span>Viral score</span></div>
                      <h3>{clip.title}</h3><p>“{clip.hook}”</p>
                      <div className="clip-range"><span>{clip.start} — {clip.end}</span><span>{currentProject.format}</span></div>
                      <div className="clip-actions"><button onClick={() => setPreviewClip(clip)}><Play size={15} /> Prévia</button><button className={copied === clip.id ? "copied" : ""} onClick={() => copyCaption(clip)}>{copied === clip.id ? <Check size={15} /> : <Copy size={15} />}{copied === clip.id ? "Copiado" : "Copiar legenda"}</button></div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {view === "live" && (
            <div className="live-view">
              <div className="collection-head live-head">
                <div><span className="eyebrow simple live"><i /> AO VIVO • CAPTURA INTELIGENTE</span><h1>Monitoramento de <em>lives</em></h1><p>Acompanhe transmissões e marque automaticamente os momentos com maior energia.</p></div>
                <button className="primary-button" onClick={openNewProject}><Plus /> Criar monitoramento</button>
              </div>
              <div className="live-info"><span><Radio /></span><div><strong>Como funciona</strong><p>O StormCast acompanha a transmissão e prepara uma fila de destaques. Este painel demonstra o fluxo de monitoramento.</p></div><em>BETA</em></div>
              <div className="filter-bar live-filters"><label><Search size={17} /><input value={liveQuery} onChange={(event) => setLiveQuery(event.target.value)} placeholder="Buscar canal" /></label><div><button className="active">Todos</button><button>Ao vivo</button><button>Encerrados</button></div></div>
              <div className="live-grid">
                {[
                  { name: "Storm Gospel", game: "Podcast • Estudo bíblico", status: "Ao vivo", clips: 18, theme: "violet" },
                  { name: "DaniloStorm", game: "Just Chatting • Comunidade", status: "Ao vivo", clips: 11, theme: "blue" },
                  { name: "Vida com Propósito", game: "Mensagem • Reflexão", status: "Encerrada", clips: 24, theme: "amber" },
                  { name: "Portal Super Game", game: "Gameplay • RPG", status: "Encerrada", clips: 16, theme: "rose" },
                ].filter((stream) => stream.name.toLowerCase().includes(liveQuery.toLowerCase())).map((stream) => (
                  <article className="stream-card" key={stream.name}>
                    <div className="stream-cover"><VisualArt theme={stream.theme} compact /><span className={stream.status === "Ao vivo" ? "live-badge" : "ended-badge"}>{stream.status === "Ao vivo" && <i />}{stream.status}</span><button>☆</button></div>
                    <div className="stream-body"><span className={"stream-avatar theme-" + stream.theme}>{stream.name[0]}</span><div><h3>{stream.name}</h3><p>{stream.game}</p></div></div>
                    <div className="stream-stats"><span><Clock3 size={14} /> 1h 42m</span><span><Captions size={14} /> {stream.clips} cortes</span></div>
                    <div className={stream.status === "Ao vivo" ? "monitoring-status" : "ended-status"}><i />{stream.status === "Ao vivo" ? "Monitorando agora" : "Monitoramento concluído"}</div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {view === "brand" && (
            <div className="brand-view">
              <div className="collection-head"><div><span className="eyebrow simple"><Palette size={14} /> IDENTIDADE VISUAL</span><h1>Brand kit</h1><p>Deixe todos os cortes com a mesma assinatura visual.</p></div><button className="primary-button"><Check /> Salvar identidade</button></div>
              <div className="brand-layout">
                <section className="brand-form-card">
                  <div className="form-section"><div><span>01</span><h2>Cores da marca</h2></div><p>Cores usadas nas legendas, destaques e elementos.</p><div className="color-pickers"><label><i style={{ background: "#7c3cff" }} /><span><small>Principal</small>#7C3CFF</span></label><label><i style={{ background: "#b8ff59" }} /><span><small>Destaque</small>#B8FF59</span></label><label><i style={{ background: "#f7f5f2" }} /><span><small>Texto</small>#F7F5F2</span></label></div></div>
                  <div className="form-section"><div><span>02</span><h2>Tipografia</h2></div><p>Uma combinação forte e legível em telas pequenas.</p><div className="font-choice"><span>Aa</span><div><small>FONTE PRINCIPAL</small><strong>Manrope ExtraBold</strong></div><ChevronRight /></div></div>
                  <div className="form-section"><div><span>03</span><h2>Assinatura</h2></div><p>Seu @ aparece discretamente nos cortes exportados.</p><label className="text-field"><span>@</span><input defaultValue={userHandle} /></label></div>
                </section>
                <aside className="brand-preview-card"><span>PRÉVIA EM TEMPO REAL</span><div className="brand-phone"><VisualArt /><div className="brand-caption"><strong>UMA MENSAGEM</strong><em>pode mudar o seu dia</em></div><small>@{userHandle}</small></div><p>Formato vertical • 1080 × 1920</p></aside>
              </div>
            </div>
          )}

          {view === "analytics" && (
            <div className="collection-view account-view">
              <div className="collection-head"><div><span className="eyebrow simple"><BarChart3 size={14} /> LEITURA DO FLUXO</span><h1>Desempenho</h1><p>Acompanhe sua produção sem métricas inventadas de redes sociais.</p></div><button className="secondary-button">Últimos 30 dias</button></div>
              <div className="account-metrics"><article><span>PROJETOS</span><strong>{projects.length}</strong><small>no seu navegador</small></article><article><span>CORTES</span><strong>{totalClips}</strong><small>gerados no fluxo</small></article><article><span>SCORE MÉDIO</span><strong>{Math.round(projects.flatMap((project) => project.clips).reduce((sum, clip) => sum + clip.score, 0) / Math.max(1, totalClips))}</strong><small>potencial estimado</small></article><article><span>CRÉDITOS</span><strong>{user.credits}</strong><small>saldo disponível</small></article></div>
              <div className="analytics-card"><div><span>VOLUME POR PROJETO</span><h2>Seu mapa de produção</h2></div><div className="analytics-bars">{projects.slice(0, 8).map((project) => <div key={project.id}><span style={{ height: `${Math.max(18, project.clips.length * 12)}%` }} /><small>{project.platform}</small></div>)}</div><p>Esses dados representam apenas os projetos desta conta salvos neste dispositivo.</p></div>
            </div>
          )}

          {view === "billing" && (
            <div className="collection-view account-view">
              <div className="collection-head"><div><span className="eyebrow simple"><CreditCard size={14} /> CONTA</span><h1>Plano e créditos</h1><p>Veja o saldo atual e o que estará disponível na próxima fase.</p></div></div>
              <div className="balance-card"><div><span><Sparkles /></span><div><small>SALDO DISPONÍVEL</small><strong>{user.credits} créditos</strong><p>O processamento desta versão ainda opera em modo demonstrativo.</p></div></div><em>Plano gratuito</em></div>
              <div className="studio-plan-grid"><article className="active"><span>ATUAL</span><h3>Explorar</h3><strong>R$ 0</strong><p>Projetos, cortes demonstrativos e Brand Kit básico.</p><button disabled>Plano ativo</button></article><article><span>EM BREVE</span><h3>Criador</h3><strong>Créditos mensais</strong><p>Renderização, exportação e mais capacidade de análise.</p><button>Entrar na lista</button></article><article><span>EQUIPES</span><h3>Estúdio</h3><strong>Sob medida</strong><p>Mais usuários, volume e implantação acompanhada.</p><a href="mailto:contato@stormcast.site">Falar com a equipe</a></article></div>
            </div>
          )}

          {view === "settings" && (
            <div className="collection-view account-view">
              <div className="collection-head"><div><span className="eyebrow simple"><Settings size={14} /> PREFERÊNCIAS</span><h1>Configurações</h1><p>Informações da conta e segurança da sessão.</p></div></div>
              <div className="settings-grid"><section><span className="settings-avatar">{userInitials}</span><div><small>NOME</small><strong>{user.name}</strong></div><div><small>E-MAIL</small><strong>{user.email}</strong></div><div><small>PERFIL</small><strong>{user.role === "admin" ? "Administrador" : "Usuário"}</strong></div></section><section><div className="security-callout"><ShieldCheck /><div><strong>Sessão protegida</strong><p>Seu painel exige login e usa um cookie inacessível a scripts do navegador.</p></div></div><button className="danger-signout" onClick={signOut}><LogOut /> Encerrar esta sessão</button></section></div>
            </div>
          )}
        </main>
      </div>

      {wizardStep !== null && (
        <div className="wizard-layer" role="dialog" aria-modal="true" aria-label="Configurar novo projeto">
          <div className="wizard-top">
            <button className="brand-lockup" onClick={() => setWizardStep(null)}><span className="brand-mark"><span /></span><span><strong>StormCast</strong><small>CREATE FLOW</small></span></button>
            <div className="stepper">{[0, 1, 2, 3, 4].map((stepNumber) => <span key={stepNumber} className={stepNumber < wizardStep ? "done" : stepNumber === wizardStep ? "active" : ""}>{stepNumber < wizardStep ? <Check size={13} /> : stepNumber + 1}</span>)}</div>
            <button className="wizard-close" onClick={() => setWizardStep(null)} aria-label="Fechar"><X /></button>
          </div>

          <div className="wizard-content">
            {wizardStep === 0 && (
              <section className="wizard-step source-step">
                <span className="step-kicker">PASSO 1 DE 5</span><h1>De onde vem seu vídeo?</h1><p>Cole um link público ou envie um arquivo do computador.</p>
                <div className={"wizard-link-field" + (inputError ? " has-error" : "")}><Link2 /><input value={videoUrl} onChange={(event) => { setVideoUrl(event.target.value); setFileName(""); setInputError(""); }} placeholder="https://youtube.com/watch?v=..." /></div>
                <button className="upload-drop" onClick={() => fileInput.current?.click()}><span><Upload /></span><strong>{fileName || "Clique para escolher um vídeo"}</strong><small>{fileName ? fileSize + " • " + formatClock(fileDuration) : "MP4, MOV ou WebM • até 4 horas"}</small></button>
                {inputError && <span className="field-error">{inputError}</span>}
                <div className="safe-note"><Check size={15} /> Use somente vídeos seus ou com permissão para editar.</div>
              </section>
            )}

            {wizardStep === 1 && (
              <section className="wizard-step format-step">
                <span className="step-kicker">PASSO 2 DE 5</span><h1>Defina o formato do corte</h1><p>Escolha a proporção e como o StormCast deve acompanhar quem está falando.</p>
                <div className="wizard-source-summary"><VisualArt compact /><div><strong>{projectTitle(videoUrl, fileName)}</strong><span>{platform} • {formatClock(fileDuration)}</span></div><button onClick={() => setWizardStep(0)}>Trocar</button></div>
                <div className="option-block"><label>Proporção</label><div className="two-options"><button className={format === "9:16" ? "selected" : ""} onClick={() => setFormat("9:16")}><Monitor /><span><strong>Vertical</strong><small>Reels, Shorts e TikTok</small></span>{format === "9:16" && <Check />}</button><button className={format === "16:9" ? "selected" : ""} onClick={() => setFormat("16:9")}><PanelLeftClose /><span><strong>Horizontal</strong><small>YouTube e apresentações</small></span>{format === "16:9" && <Check />}</button></div></div>
                <div className="option-block"><label>Enquadramento</label><div className="layout-options">
                  {[
                    { id: "auto", label: "Automático", note: "Recomendado", Icon: Sparkles },
                    { id: "face", label: "Foco no rosto", note: "", Icon: Focus },
                    { id: "center", label: "Centro", note: "", Icon: Frame },
                    { id: "split", label: "Tela dividida", note: "", Icon: SplitSquareVertical },
                    { id: "react", label: "React", note: "", Icon: Layers3 },
                  ].map((item) => <button key={item.id} className={framing === item.id ? "selected" : ""} onClick={() => setFraming(item.id)}><item.Icon /><span>{item.label}<small>{item.note}</small></span>{framing === item.id && <Check />}</button>)}
                </div></div>
                <div className="option-block"><label htmlFor="custom-prompt">Prompt personalizado <span>opcional</span></label><textarea id="custom-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={520} rows={5} /><div className="prompt-bottom"><div><button onClick={() => setPrompt("Busque ensinamentos claros, frases marcantes e reflexões práticas. Evite trechos sem conclusão.")}>Educativo</button><button onClick={() => setPrompt("Encontre perguntas fortes, respostas surpreendentes e momentos de alta curiosidade.")}>Curiosidade</button><button onClick={() => setPrompt("Selecione trechos cristãos com contexto completo, clareza bíblica e uma mensagem edificante.")}>Gospel</button></div><span>{prompt.length}/520</span></div></div>
              </section>
            )}

            {wizardStep === 2 && (
              <section className="wizard-step duration-step">
                <span className="step-kicker">PASSO 3 DE 5</span><h1>Ajuste a duração</h1><p>Defina o tamanho de cada corte e quanto do vídeo será analisado.</p>
                <div className="option-block"><label>Duração de cada corte</label><div className="duration-options">{[["auto", "Automático"], ["30", "30 seg"], ["60", "1 min"], ["90", "1:30 min"], ["180", "3 min"]].map(([value, label]) => <button key={value} className={clipDuration === value ? "selected" : ""} onClick={() => setClipDuration(value)}>{value === "auto" && <Sparkles size={15} />}{label}</button>)}</div></div>
                <div className="timeline-card">
                  <div className="timeline-head"><label>Intervalo analisado</label><span>{analysisMinutes} min / {maxMinutes} min</span></div>
                  <div className="timeline-time"><span>00:00:00</span><strong>{formatClock(analysisMinutes * 60)}</strong><span>{formatClock(fileDuration)}</span></div>
                  <div className="timeline-film">{Array.from({ length: 9 }, (_, index) => <div key={index}><VisualArt theme={index % 3 === 0 ? "violet" : index % 3 === 1 ? "blue" : "amber"} compact /></div>)}</div>
                  <input type="range" min={5} max={maxMinutes} value={Math.min(analysisMinutes, maxMinutes)} onChange={(event) => setAnalysisMinutes(Number(event.target.value))} />
                </div>
                <div className="credit-notice"><span><Sparkles /></span><div><strong>Estimativa: {analysisMinutes} créditos</strong><p>Cada crédito representa um minuto de análise quando o processamento real estiver conectado.</p></div><em>{user.credits} disponíveis</em></div>
              </section>
            )}

            {wizardStep === 3 && (
              <section className="wizard-step subtitle-step">
                <span className="step-kicker">PASSO 4 DE 5</span><h1>Como suas legendas vão aparecer?</h1><p>Escolha um estilo. Você poderá mudar isso em cada corte.</p>
                <div className="subtitle-layout">
                  <div className={"phone-preview" + (format === "16:9" ? " phone-landscape" : "")}>{fileUrl ? <video src={fileUrl} muted playsInline /> : <VisualArt />}<div className={"caption-overlay " + selectedCaption.css}>{selectedCaption.sample}</div><span className="handle-preview">@{userHandle}</span></div>
                  <div className="subtitle-choices">{captionStyles.map((style) => <button key={style.id} className={captionStyle === style.id ? "selected" : ""} onClick={() => setCaptionStyle(style.id)}><span className={style.css}>{style.sample}</span><strong>{style.label}</strong>{captionStyle === style.id && <i><Check size={13} /></i>}</button>)}</div>
                </div>
              </section>
            )}

            {wizardStep === 4 && (
              <section className="wizard-step review-step">
                <span className="step-kicker">PASSO 5 DE 5</span><h1>Tudo pronto para encontrar os melhores momentos</h1><p>Confira as escolhas antes de iniciar a análise.</p>
                <div className="review-hero"><div className="review-art"><VisualArt /><span><Play /></span></div><div><span>{platform}</span><h2>{projectTitle(videoUrl, fileName)}</h2><p>{fileName || videoUrl}</p></div></div>
                <div className="review-grid">
                  <button onClick={() => setWizardStep(1)}><span><Monitor /></span><div><small>FORMATO</small><strong>{format === "9:16" ? "Vertical 9:16" : "Horizontal 16:9"}</strong><em>Enquadramento {framing}</em></div><ChevronRight /></button>
                  <button onClick={() => setWizardStep(2)}><span><Clock3 /></span><div><small>DURAÇÃO</small><strong>{clipDuration === "auto" ? "Automática" : clipDuration + " segundos"}</strong><em>{analysisMinutes} minutos analisados</em></div><ChevronRight /></button>
                  <button onClick={() => setWizardStep(3)}><span><Captions /></span><div><small>LEGENDA</small><strong>{selectedCaption.label}</strong><em>Português automático</em></div><ChevronRight /></button>
                  <button onClick={() => setWizardStep(1)}><span><WandSparkles /></span><div><small>DIREÇÃO DA IA</small><strong>Prompt personalizado</strong><em>{prompt.length} caracteres</em></div><ChevronRight /></button>
                </div>
                <div className="analysis-note"><Sparkles /><div><strong>O StormCast vai procurar</strong><p>Ganchos fortes, ideias completas, mudanças de emoção, perguntas, respostas e frases com potencial de retenção.</p></div></div>
              </section>
            )}
          </div>

          <div className="wizard-footer">
            <button className="back-button" onClick={() => wizardStep === 0 ? setWizardStep(null) : setWizardStep(wizardStep - 1)}>{wizardStep === 0 ? "Cancelar" : "Voltar"}</button>
            <span>Suas escolhas ficam salvas neste navegador.</span>
            {wizardStep < 4 ? <button className="primary-button" onClick={() => { if (wizardStep === 0 && !validSource()) return; setWizardStep(wizardStep + 1); }}>Continuar <ArrowRight /></button> : <button className="primary-button launch-button" onClick={createClips}><Sparkles /> Iniciar análise</button>}
          </div>
        </div>
      )}

      {processing && (
        <div className={"processing-layer" + (progress === 100 ? " processing-done" : "")} role="status">
          <div className="processing-visual"><div className="scan-frame"><VisualArt /><div className="scan-line" /><span className="face-box box-one" /><span className="face-box box-two" /></div><div className="processing-orbit" style={{ background: "conic-gradient(var(--lime) " + progress + "%, #1c2028 0)" }}><span>{progress}%</span></div></div>
          <span className="step-kicker">STORMCAST VISION</span><h1>{progress === 100 ? "Seus cortes estão prontos" : "Assistindo cada segundo por você"}</h1><p>{progress === 100 ? "Organizamos os melhores momentos por potencial de retenção." : "Cruzando fala, ritmo e contexto para encontrar momentos completos."}</p>
          <div className="processing-stages">{["Preparando o vídeo", "Entendendo falas e contexto", "Encontrando ganchos fortes", "Montando seus cortes"].map((label, index) => <div key={label} className={index < stage || progress === 100 ? "done" : index === stage ? "active" : ""}><span>{index < stage || progress === 100 ? <Check size={14} /> : index + 1}</span><strong>{label}</strong>{index === stage && progress < 100 && <i />}</div>)}</div>
          <small>Modo de demonstração: a análise termina em poucos segundos.</small>
        </div>
      )}

      {previewClip && (
        <div className="preview-modal" role="dialog" aria-modal="true">
          <button className="preview-scrim" onClick={() => setPreviewClip(null)} aria-label="Fechar prévia" />
          <div className="preview-dialog">
            <div className="preview-dialog-head"><div><span>PRÉVIA DO CORTE</span><h2>{previewClip.title}</h2></div><button onClick={() => setPreviewClip(null)}><X /></button></div>
            <div className="preview-stage"><div className={"preview-video" + (format === "16:9" ? " preview-landscape" : "")}>{fileUrl ? <video src={fileUrl} controls playsInline /> : <><VisualArt theme={previewClip.theme} /><span className="preview-play"><Play /></span><div className={"caption-overlay " + selectedCaption.css}>{previewClip.hook}</div><small>@{userHandle}</small></>}</div></div>
            <div className="preview-info"><div><span><Clock3 /> {previewClip.start} — {previewClip.end}</span><span><Sparkles /> Score {previewClip.score}</span></div><p>{previewClip.caption}</p><button className="primary-button" onClick={() => copyCaption(previewClip)}><Copy /> Copiar legenda</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
