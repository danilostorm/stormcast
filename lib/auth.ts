import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { execute, queryOne, runtimeValue } from "./database";
import { hashPassword, hashToken, normalizeEmail, randomToken, validEmail, validPassword, verifyPassword } from "./security";

export const SESSION_COOKIE = "stormcast_session";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  status: "active" | "suspended";
  credits: number;
  createdAt: number;
  lastLoginAt: number | null;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: "admin" | "user";
  status: "active" | "suspended";
  credits: number;
  created_at: number;
  last_login_at: number | null;
};

type SessionUserRow = UserRow & { expires_at: number };

declare global {
  var __STORMCAST_BOOTSTRAP_READY__: Promise<void> | undefined;
  var __STORMCAST_RATE_LIMITS__: Map<string, { count: number; resetAt: number }> | undefined;
}

function publicUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    credits: Number(row.credits),
    createdAt: Number(row.created_at),
    lastLoginAt: row.last_login_at ? Number(row.last_login_at) : null,
  };
}

export async function ensureBootstrapAdmin() {
  if (globalThis.__STORMCAST_BOOTSTRAP_READY__) return globalThis.__STORMCAST_BOOTSTRAP_READY__;

  globalThis.__STORMCAST_BOOTSTRAP_READY__ = (async () => {
    const email = normalizeEmail(runtimeValue("STORMCAST_ADMIN_EMAIL"));
    const password = runtimeValue("STORMCAST_ADMIN_PASSWORD");
    if (!validEmail(email) || !validPassword(password)) return;

    const existing = await queryOne<UserRow>("SELECT * FROM users WHERE email = ? LIMIT 1", [email]);
    if (existing) {
      if (existing.role !== "admin" || existing.status !== "active") {
        await execute("UPDATE users SET role = 'admin', status = 'active', updated_at = ? WHERE id = ?", [Date.now(), existing.id]);
      }
      return;
    }

    const now = Date.now();
    await execute(
      `INSERT INTO users (id, name, email, password_hash, role, status, credits, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'admin', 'active', 1000, ?, ?)`,
      [randomToken(16), runtimeValue("STORMCAST_ADMIN_NAME") || "Administrador", email, await hashPassword(password), now, now],
    );
  })();

  return globalThis.__STORMCAST_BOOTSTRAP_READY__;
}

function cookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

export async function userFromCookie(cookieHeader: string | null): Promise<AuthUser | null> {
  await ensureBootstrapAdmin();
  const token = cookieValue(cookieHeader, SESSION_COOKIE);
  if (!token) return null;

  const sessionId = await hashToken(token);
  const now = Date.now();
  const row = await queryOne<SessionUserRow>(
    `SELECT users.*, sessions.expires_at
     FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.id = ? LIMIT 1`,
    [sessionId],
  );

  if (!row || Number(row.expires_at) <= now || row.status !== "active") {
    if (row) await execute("DELETE FROM sessions WHERE id = ?", [sessionId]);
    return null;
  }
  return publicUser(row);
}

export async function getCurrentUser() {
  const requestHeaders = await headers();
  return userFromCookie(requestHeaders.get("cookie"));
}

export async function requireUser(returnTo = "/app") {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}

export async function requireAdmin(returnTo = "/admin") {
  const user = await requireUser(returnTo);
  if (user.role !== "admin") redirect("/app");
  return user;
}

export async function authenticate(emailInput: string, password: string) {
  await ensureBootstrapAdmin();
  const email = normalizeEmail(emailInput);
  const row = await queryOne<UserRow>("SELECT * FROM users WHERE email = ? LIMIT 1", [email]);
  if (!row || !(await verifyPassword(password, row.password_hash))) return null;
  if (row.status !== "active") return { suspended: true as const };

  const now = Date.now();
  await execute("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?", [now, now, row.id]);
  return { user: publicUser({ ...row, last_login_at: now }) };
}

export async function createSession(userId: string) {
  const token = randomToken(32);
  const sessionId = await hashToken(token);
  const configuredDays = Number(runtimeValue("STORMCAST_SESSION_DAYS"));
  const days = Number.isFinite(configuredDays) && configuredDays >= 1 && configuredDays <= 90 ? configuredDays : 30;
  const now = Date.now();
  const expiresAt = now + days * 86_400_000;
  await execute("DELETE FROM sessions WHERE expires_at <= ?", [now]);
  await execute("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)", [sessionId, userId, expiresAt, now]);
  return { token, expiresAt };
}

export async function destroySession(cookieHeader: string | null) {
  const token = cookieValue(cookieHeader, SESSION_COOKIE);
  if (token) await execute("DELETE FROM sessions WHERE id = ?", [await hashToken(token)]);
}

export function sessionCookie(token: string, expiresAt: number, request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const secure = forwardedProto === "https" || new URL(request.url).protocol === "https:";
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const secure = forwardedProto === "https" || new URL(request.url).protocol === "https:";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new Error("Origem inválida.");
  }
  const expectedHost = (request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host)
    .split(",")[0]
    .trim();
  if (originHost !== expectedHost) throw new Error("Origem não autorizada.");
}

export function clientAddress(request: Request) {
  return (request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "local")
    .split(",")[0]
    .trim();
}

export function allowRequest(key: string, maximum = 10, windowMs = 15 * 60_000) {
  const now = Date.now();
  const limits = (globalThis.__STORMCAST_RATE_LIMITS__ ||= new Map());
  const current = limits.get(key);
  if (!current || current.resetAt <= now) {
    limits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= maximum) return false;
  current.count += 1;
  return true;
}

export async function userFromRequest(request: Request) {
  return userFromCookie(request.headers.get("cookie"));
}
