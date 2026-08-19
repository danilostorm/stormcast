import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["admin", "user"] }).notNull().default("user"),
    status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
    credits: integer("credits").notNull().default(120),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    lastLoginAt: integer("last_login_at"),
    forcePasswordChange: integer("force_password_change", { mode: "boolean" }).notNull().default(false),
    plan: text("plan").notNull().default("free"),
    monthlyCreditLimit: integer("monthly_credit_limit").notNull().default(120),
    maxActiveProjects: integer("max_active_projects").notNull().default(1),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    index("users_email_idx").on(table.email),
    index("users_role_idx").on(table.role),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("sessions_user_idx").on(table.userId),
    index("sessions_expires_idx").on(table.expiresAt),
  ],
);

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourcePlatform: text("source_platform").notNull().default("YouTube"),
    sourceVideoId: text("source_video_id").notNull(),
    sourceDurationSeconds: integer("source_duration_seconds").notNull().default(0),
    requestedAnalysisMinutes: integer("requested_analysis_minutes").notNull(),
    analysisSeconds: integer("analysis_seconds").notNull().default(0),
    requestedClipSeconds: integer("requested_clip_seconds").notNull().default(60),
    format: text("format", { enum: ["9:16", "16:9"] }).notNull().default("9:16"),
    framing: text("framing", { enum: ["auto", "fit", "center", "split", "spotlight"] }).notNull().default("fit"),
    prompt: text("prompt").notNull().default(""),
    captionStyle: text("caption_style").notNull().default("impact"),
    renderOptions: text("render_options").notNull().default("{}"),
    thumbnailUrl: text("thumbnail_url"),
    status: text("status", {
      enum: ["queued", "downloading", "transcribing", "analyzing", "rendering", "ready", "failed", "cancelled"],
    }).notNull().default("queued"),
    stage: text("stage").notNull().default("Aguardando processador"),
    progress: integer("progress").notNull().default(0),
    errorMessage: text("error_message"),
    cancelRequested: integer("cancel_requested", { mode: "boolean" }).notNull().default(false),
    creditsCharged: integer("credits_charged").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    startedAt: integer("started_at"),
    completedAt: integer("completed_at"),
  },
  (table) => [
    index("projects_user_idx").on(table.userId),
    index("projects_status_idx").on(table.status),
    index("projects_created_idx").on(table.createdAt),
  ],
);

export const clips = sqliteTable(
  "clips",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    hook: text("hook").notNull(),
    caption: text("caption").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    durationMs: integer("duration_ms").notNull(),
    score: integer("score").notNull(),
    fileName: text("file_name").notNull(),
    posterFileName: text("poster_file_name").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("clips_project_idx").on(table.projectId),
    index("clips_user_idx").on(table.userId),
  ],
);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const aiProviders = sqliteTable("ai_providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  apiKeyEncrypted: text("api_key_encrypted"),
  apiKeyHint: text("api_key_hint"),
  analysisModel: text("analysis_model").notNull().default(""),
  transcriptionModel: text("transcription_model").notNull().default(""),
  supportsAnalysis: integer("supports_analysis", { mode: "boolean" }).notNull().default(true),
  supportsTranscription: integer("supports_transcription", { mode: "boolean" }).notNull().default(false),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  builtIn: integer("built_in", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const creditHistory = sqliteTable("credit_history", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  adminId: text("admin_id").references(() => users.id, { onDelete: "set null" }),
  amount: integer("amount").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  reason: text("reason").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("credit_history_user_idx").on(table.userId), index("credit_history_created_idx").on(table.createdAt)]);

export const adminAudit = sqliteTable("admin_audit", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  details: text("details").notNull().default("{}"),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("admin_audit_created_idx").on(table.createdAt), index("admin_audit_admin_idx").on(table.adminId)]);

export const processorState = sqliteTable("processor_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
