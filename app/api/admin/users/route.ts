import { NextResponse } from "next/server";
import { assertSameOrigin, userFromRequest } from "../../../../lib/auth";
import {
  execute,
  queryAll,
  queryOne,
  runtimeValue,
} from "../../../../lib/database";
import {
  hashPassword,
  normalizeEmail,
  randomToken,
  validEmail,
  validPassword,
} from "../../../../lib/security";
import { auditAdmin } from "../../../../lib/admin-audit";

export const dynamic = "force-dynamic";
type Row = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  status: "active" | "suspended";
  credits: number;
  created_at: number;
  last_login_at: number | null;
  force_password_change: number;
  plan: string;
  monthly_credit_limit: number;
  max_active_projects: number;
  project_count?: number;
  clip_count?: number;
  session_count?: number;
  media_bytes?: number;
};
async function currentAdmin(request: Request) {
  const user = await userFromRequest(request);
  return user?.role === "admin" ? user : null;
}
const json = (u: Row) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  status: u.status,
  credits: Number(u.credits),
  createdAt: Number(u.created_at),
  lastLoginAt: u.last_login_at ? Number(u.last_login_at) : null,
  forcePasswordChange: Boolean(u.force_password_change),
  plan: u.plan || "free",
  monthlyCreditLimit: Number(u.monthly_credit_limit || 120),
  maxActiveProjects: Number(u.max_active_projects || 1),
  projectCount: Number(u.project_count || 0),
  clipCount: Number(u.clip_count || 0),
  sessionCount: Number(u.session_count || 0),
});

export async function GET(request: Request) {
  if (!(await currentAdmin(request)))
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  const users = await queryAll<Row>(
    `SELECT u.id,u.name,u.email,u.role,u.status,u.credits,u.created_at,u.last_login_at,u.force_password_change,u.plan,u.monthly_credit_limit,u.max_active_projects,
    (SELECT COUNT(*) FROM projects p WHERE p.user_id=u.id) project_count,
    (SELECT COUNT(*) FROM clips c WHERE c.user_id=u.id) clip_count,
    (SELECT COUNT(*) FROM sessions s WHERE s.user_id=u.id AND s.expires_at>?) session_count
    FROM users u ORDER BY u.created_at DESC LIMIT 500`,
    [Date.now()],
  );
  return NextResponse.json(
    { users: users.map(json) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!(await currentAdmin(request)))
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
      credits?: number;
      role?: string;
      forcePasswordChange?: boolean;
      plan?: string;
      monthlyCreditLimit?: number;
      maxActiveProjects?: number;
    };
    const name = (body.name || "").trim().replace(/\s+/g, " ");
    const email = normalizeEmail(body.email || "");
    const password = body.password || "";
    if (name.length < 2 || name.length > 80)
      return NextResponse.json(
        { error: "Informe um nome entre 2 e 80 caracteres." },
        { status: 400 },
      );
    if (!validEmail(email))
      return NextResponse.json(
        { error: "Informe um e-mail válido." },
        { status: 400 },
      );
    if (!validPassword(password))
      return NextResponse.json(
        {
          error:
            "A senha precisa ter ao menos 10 caracteres, com letras e números.",
        },
        { status: 400 },
      );
    if (await queryOne("SELECT id FROM users WHERE email=? LIMIT 1", [email]))
      return NextResponse.json(
        { error: "Já existe uma conta com este e-mail." },
        { status: 409 },
      );
    const now = Date.now(),
      credits = Math.max(
        0,
        Math.min(100000, Math.trunc(Number(body.credits) || 0)),
      );
    const id = randomToken(16),
      plan = ["free", "creator", "pro"].includes(body.plan || "")
        ? body.plan
        : "free";
    await execute(
      `INSERT INTO users (id,name,email,password_hash,role,status,credits,force_password_change,plan,monthly_credit_limit,max_active_projects,created_at,updated_at) VALUES (?,?,?,?,?,'active',?,?,?,?,?,?,?)`,
      [
        id,
        name,
        email,
        await hashPassword(password),
        body.role === "admin" ? "admin" : "user",
        credits,
        body.forcePasswordChange ? 1 : 0,
        plan,
        Math.max(
          0,
          Math.min(100000, Math.trunc(Number(body.monthlyCreditLimit) || 120)),
        ),
        Math.max(
          1,
          Math.min(20, Math.trunc(Number(body.maxActiveProjects) || 1)),
        ),
        now,
        now,
      ],
    );
    await auditAdmin(
      (await currentAdmin(request))!.id,
      "user.create",
      "user",
      id,
      { email, role: body.role || "user" },
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && /unique/i.test(error.message)
            ? "Já existe uma conta com este e-mail."
            : "Não foi possível criar o usuário.",
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await currentAdmin(request);
    if (!admin)
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    const body = (await request.json()) as {
      userId?: string;
      action?: string;
      amount?: number;
      name?: string;
      email?: string;
      password?: string;
      reason?: string;
      plan?: string;
      monthlyCreditLimit?: number;
      maxActiveProjects?: number;
      forcePasswordChange?: boolean;
    };
    if (!body.userId || !body.action)
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    const target = await queryOne<Row>(
      "SELECT * FROM users WHERE id=? LIMIT 1",
      [body.userId],
    );
    if (!target)
      return NextResponse.json(
        { error: "Usuário não encontrado." },
        { status: 404 },
      );
    if (
      target.id === admin.id &&
      ["suspend", "make_user"].includes(body.action)
    )
      return NextResponse.json(
        { error: "Você não pode remover o próprio acesso administrativo." },
        { status: 400 },
      );
    const now = Date.now();
    if (body.action === "activate")
      await execute(
        "UPDATE users SET status='active',updated_at=? WHERE id=?",
        [now, target.id],
      );
    else if (body.action === "suspend") {
      await execute(
        "UPDATE users SET status='suspended',updated_at=? WHERE id=?",
        [now, target.id],
      );
      await execute("DELETE FROM sessions WHERE user_id=?", [target.id]);
    } else if (body.action === "make_admin")
      await execute("UPDATE users SET role='admin',updated_at=? WHERE id=?", [
        now,
        target.id,
      ]);
    else if (body.action === "make_user")
      await execute("UPDATE users SET role='user',updated_at=? WHERE id=?", [
        now,
        target.id,
      ]);
    else if (body.action === "set_credits") {
      const next = Math.max(
        0,
        Math.min(100000, Math.trunc(Number(body.amount) || 0)),
      );
      await execute("UPDATE users SET credits=?,updated_at=? WHERE id=?", [
        next,
        now,
        target.id,
      ]);
      await execute(
        "INSERT INTO credit_history (id,user_id,admin_id,amount,balance_after,reason,created_at) VALUES (?,?,?,?,?,?,?)",
        [
          randomToken(16),
          target.id,
          admin.id,
          next - Number(target.credits),
          next,
          (body.reason || "Ajuste administrativo").slice(0, 180),
          now,
        ],
      );
    } else if (body.action === "logout_all")
      await execute("DELETE FROM sessions WHERE user_id=?", [target.id]);
    else if (body.action === "reset_password") {
      if (!validPassword(body.password || ""))
        return NextResponse.json(
          {
            error:
              "A senha precisa ter ao menos 10 caracteres, com letras e números.",
          },
          { status: 400 },
        );
      await execute(
        "UPDATE users SET password_hash=?,force_password_change=?,updated_at=? WHERE id=?",
        [
          await hashPassword(body.password || ""),
          body.forcePasswordChange === false ? 0 : 1,
          now,
          target.id,
        ],
      );
      await execute("DELETE FROM sessions WHERE user_id=?", [target.id]);
    } else if (body.action === "set_limits") {
      const plan = ["free", "creator", "pro"].includes(body.plan || "")
        ? body.plan
        : "free";
      await execute(
        "UPDATE users SET plan=?,monthly_credit_limit=?,max_active_projects=?,updated_at=? WHERE id=?",
        [
          plan,
          Math.max(
            0,
            Math.min(100000, Math.trunc(Number(body.monthlyCreditLimit) || 0)),
          ),
          Math.max(
            1,
            Math.min(20, Math.trunc(Number(body.maxActiveProjects) || 1)),
          ),
          now,
          target.id,
        ],
      );
    } else if (body.action === "update_profile") {
      const name = (body.name || "").trim().replace(/\s+/g, " "),
        email = normalizeEmail(body.email || "");
      if (name.length < 2 || name.length > 80 || !validEmail(email))
        return NextResponse.json(
          { error: "Nome ou e-mail inválido." },
          { status: 400 },
        );
      if (
        await queryOne("SELECT id FROM users WHERE email=? AND id<>? LIMIT 1", [
          email,
          target.id,
        ])
      )
        return NextResponse.json(
          { error: "Já existe uma conta com este e-mail." },
          { status: 409 },
        );
      await execute("UPDATE users SET name=?,email=?,updated_at=? WHERE id=?", [
        name,
        email,
        now,
        target.id,
      ]);
    } else
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    await auditAdmin(admin.id, `user.${body.action}`, "user", target.id, {
      amount: body.amount,
      plan: body.plan,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível atualizar o usuário." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await currentAdmin(request);
    if (!admin)
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    const { userId } = (await request.json()) as { userId?: string };
    if (!userId || userId === admin.id)
      return NextResponse.json(
        { error: "Você não pode excluir a própria conta." },
        { status: 400 },
      );
    const active = await queryOne<{ total: number }>(
      "SELECT COUNT(*) total FROM projects WHERE user_id=? AND status IN ('queued','downloading','transcribing','analyzing','rendering')",
      [userId],
    );
    if (Number(active?.total || 0) > 0)
      return NextResponse.json(
        {
          error: "Cancele os projetos ativos deste usuário antes de excluí-lo.",
        },
        { status: 409 },
      );
    const changed = await execute("DELETE FROM users WHERE id=?", [userId]);
    if (changed) {
      const runtimeProcess =
        typeof process !== "undefined" ? process : undefined;
      const getBuiltinModule =
        runtimeProcess?.getBuiltinModule?.bind(runtimeProcess);
      if (getBuiltinModule) {
        const fs = getBuiltinModule("node:fs") as typeof import("node:fs");
        const path = getBuiltinModule(
          "node:path",
        ) as typeof import("node:path");
        const mediaRoot = path.resolve(
          runtimeValue("STORMCAST_MEDIA_DIR") ||
            path.resolve(process.cwd(), ".data/media"),
        );
        const target = path.resolve(mediaRoot, "clips", userId);
        if (target.startsWith(mediaRoot + path.sep)) {
          try {
            fs.rmSync(target, { recursive: true, force: true });
          } catch {
            /* The account is removed; periodic cleanup can retry the files. */
          }
        }
      }
      await auditAdmin(admin.id, "user.delete", "user", userId);
    }
    return changed
      ? NextResponse.json({ ok: true })
      : NextResponse.json(
          { error: "Usuário não encontrado." },
          { status: 404 },
        );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível excluir o usuário." },
      { status: 400 },
    );
  }
}
