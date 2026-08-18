import { queryAll, queryOne } from "./database";

export type ProjectStatus = "queued" | "downloading" | "transcribing" | "analyzing" | "rendering" | "ready" | "failed" | "cancelled";

type ProjectRow = {
  id: string;
  user_id: string;
  title: string;
  source_url: string;
  source_platform: string;
  source_video_id: string;
  source_duration_seconds: number;
  requested_analysis_minutes: number;
  analysis_seconds: number;
  requested_clip_seconds: number;
  format: "9:16" | "16:9";
  framing: "fit" | "center";
  prompt: string;
  caption_style: string;
  thumbnail_url: string | null;
  status: ProjectStatus;
  stage: string;
  progress: number;
  error_message: string | null;
  credits_charged: number;
  created_at: number;
  updated_at: number;
  started_at: number | null;
  completed_at: number | null;
};

type ClipRow = {
  id: string;
  project_id: string;
  title: string;
  hook: string;
  caption: string;
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  score: number;
};

export type PublicClip = {
  id: string;
  title: string;
  hook: string;
  caption: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  score: number;
  videoUrl: string;
  posterUrl: string;
  downloadUrl: string;
};

export type PublicProject = {
  id: string;
  title: string;
  platform: string;
  sourceUrl: string;
  sourceVideoId: string;
  sourceDurationSeconds: number;
  requestedAnalysisMinutes: number;
  analysisSeconds: number;
  requestedClipSeconds: number;
  format: "9:16" | "16:9";
  framing: "fit" | "center";
  prompt: string;
  captionStyle: string;
  thumbnailUrl: string | null;
  status: ProjectStatus;
  stage: string;
  progress: number;
  error: string | null;
  creditsCharged: number;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  clips: PublicClip[];
};

function publicClip(row: ClipRow): PublicClip {
  return {
    id: row.id,
    title: row.title,
    hook: row.hook,
    caption: row.caption,
    startSeconds: Number(row.start_ms) / 1000,
    endSeconds: Number(row.end_ms) / 1000,
    durationSeconds: Number(row.duration_ms) / 1000,
    score: Number(row.score),
    videoUrl: `/api/clips/${row.id}/asset`,
    posterUrl: `/api/clips/${row.id}/asset?kind=poster`,
    downloadUrl: `/api/clips/${row.id}/asset?download=1`,
  };
}

function publicProject(row: ProjectRow, clips: ClipRow[]): PublicProject {
  return {
    id: row.id,
    title: row.title,
    platform: row.source_platform,
    sourceUrl: row.source_url,
    sourceVideoId: row.source_video_id,
    sourceDurationSeconds: Number(row.source_duration_seconds),
    requestedAnalysisMinutes: Number(row.requested_analysis_minutes),
    analysisSeconds: Number(row.analysis_seconds),
    requestedClipSeconds: Number(row.requested_clip_seconds),
    format: row.format,
    framing: row.framing,
    prompt: row.prompt,
    captionStyle: row.caption_style,
    thumbnailUrl: row.thumbnail_url,
    status: row.status,
    stage: row.stage,
    progress: Number(row.progress),
    error: row.error_message,
    creditsCharged: Number(row.credits_charged),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    completedAt: row.completed_at ? Number(row.completed_at) : null,
    clips: clips.filter((clip) => clip.project_id === row.id).map(publicClip),
  };
}

const projectColumns = `id, user_id, title, source_url, source_platform, source_video_id,
  source_duration_seconds, requested_analysis_minutes, analysis_seconds, requested_clip_seconds,
  format, framing, prompt, caption_style, thumbnail_url, status, stage, progress, error_message,
  credits_charged, created_at, updated_at, started_at, completed_at`;

const clipColumns = `id, project_id, title, hook, caption, start_ms, end_ms, duration_ms, score`;

export async function listProjects(userId: string) {
  const rows = await queryAll<ProjectRow>(
    `SELECT ${projectColumns} FROM projects WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
    [userId],
  );
  if (!rows.length) return [];
  const clips = await queryAll<ClipRow>(
    `SELECT ${clipColumns} FROM clips WHERE user_id = ? ORDER BY score DESC, created_at ASC`,
    [userId],
  );
  return rows.map((row) => publicProject(row, clips));
}

export async function getProject(userId: string, projectId: string) {
  const row = await queryOne<ProjectRow>(
    `SELECT ${projectColumns} FROM projects WHERE id = ? AND user_id = ? LIMIT 1`,
    [projectId, userId],
  );
  if (!row) return null;
  const clips = await queryAll<ClipRow>(
    `SELECT ${clipColumns} FROM clips WHERE project_id = ? AND user_id = ? ORDER BY score DESC, created_at ASC`,
    [projectId, userId],
  );
  return publicProject(row, clips);
}
