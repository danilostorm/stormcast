type D1Result<T = Record<string, unknown>> = {
  results?: T[];
  meta?: { changes?: number };
};

type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  run: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
};

type D1DatabaseLike = {
  prepare: (sql: string) => D1Statement;
  batch: (statements: D1Statement[]) => Promise<unknown[]>;
};

type NodeStatement = {
  run: (...values: unknown[]) => { changes?: number | bigint };
  get: (...values: unknown[]) => Record<string, unknown> | undefined;
  all: (...values: unknown[]) => Record<string, unknown>[];
};

type NodeDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => NodeStatement;
};

export type RuntimeBindings = {
  DB?: D1DatabaseLike;
  STORMCAST_ADMIN_EMAIL?: string;
  STORMCAST_ADMIN_PASSWORD?: string;
  STORMCAST_ADMIN_NAME?: string;
  STORMCAST_DISABLE_REGISTRATION?: string;
  STORMCAST_SESSION_DAYS?: string;
};

declare global {
  // The Worker entry makes bindings available to server-rendered routes.
  // Node self-hosting deliberately falls back to the built-in SQLite module.
  var __STORMCAST_RUNTIME_ENV__: RuntimeBindings | undefined;
  var __STORMCAST_NODE_DB__: NodeDatabase | undefined;
  var __STORMCAST_SCHEMA_READY__: Promise<void> | undefined;
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'active',
    credits INTEGER NOT NULL DEFAULT 120,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_login_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS users_email_idx ON users (email)`,
  `CREATE INDEX IF NOT EXISTS users_role_idx ON users (role)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)`,
  `CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at)`,
];

function cloudflareDatabase() {
  return globalThis.__STORMCAST_RUNTIME_ENV__?.DB;
}

function nodeDatabase(): NodeDatabase {
  if (globalThis.__STORMCAST_NODE_DB__) return globalThis.__STORMCAST_NODE_DB__;

  const runtimeProcess = typeof process !== "undefined" ? process : undefined;
  const getBuiltinModule = runtimeProcess?.getBuiltinModule?.bind(runtimeProcess);
  if (!getBuiltinModule) {
    throw new Error("Nenhum banco de dados foi configurado para o StormCast.");
  }

  const sqlite = getBuiltinModule("node:sqlite") as {
    DatabaseSync: new (path: string) => NodeDatabase;
  };
  const fs = getBuiltinModule("node:fs") as typeof import("node:fs");
  const path = getBuiltinModule("node:path") as typeof import("node:path");
  const databasePath = runtimeValue("STORMCAST_DB_PATH") || path.resolve(process.cwd(), ".data/stormcast.db");

  fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o750 });
  const db = new sqlite.DatabaseSync(databasePath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  globalThis.__STORMCAST_NODE_DB__ = db;
  return db;
}

export function runtimeValue(key: keyof RuntimeBindings | "STORMCAST_DB_PATH") {
  const bindingValue = globalThis.__STORMCAST_RUNTIME_ENV__?.[key as keyof RuntimeBindings];
  if (typeof bindingValue === "string" && bindingValue.trim()) return bindingValue.trim();
  if (typeof process !== "undefined") {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export async function ensureSchema() {
  if (globalThis.__STORMCAST_SCHEMA_READY__) return globalThis.__STORMCAST_SCHEMA_READY__;

  globalThis.__STORMCAST_SCHEMA_READY__ = (async () => {
    const d1 = cloudflareDatabase();
    if (d1) {
      await d1.batch(schemaStatements.map((statement) => d1.prepare(statement)));
      return;
    }

    const db = nodeDatabase();
    for (const statement of schemaStatements) db.prepare(statement).run();
  })();

  return globalThis.__STORMCAST_SCHEMA_READY__;
}

export async function execute(sql: string, values: unknown[] = []) {
  await ensureSchema();
  const d1 = cloudflareDatabase();
  if (d1) {
    const result = await d1.prepare(sql).bind(...values).run();
    return Number(result.meta?.changes || 0);
  }

  const result = nodeDatabase().prepare(sql).run(...values);
  return Number(result.changes || 0);
}

export async function queryOne<T>(sql: string, values: unknown[] = []): Promise<T | null> {
  await ensureSchema();
  const d1 = cloudflareDatabase();
  if (d1) return d1.prepare(sql).bind(...values).first<T>();
  return (nodeDatabase().prepare(sql).get(...values) as T | undefined) ?? null;
}

export async function queryAll<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const d1 = cloudflareDatabase();
  if (d1) {
    const result = await d1.prepare(sql).bind(...values).all<T>();
    return result.results || [];
  }
  return nodeDatabase().prepare(sql).all(...values) as T[];
}
