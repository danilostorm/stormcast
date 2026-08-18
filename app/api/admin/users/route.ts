import { NextResponse } from "next/server";
import { assertSameOrigin, userFromRequest } from "../../../../lib/auth";
import { execute, queryAll, queryOne } from "../../../../lib/database";

export const dynamic = "force-dynamic";

type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  status: "active" | "suspended";
  credits: number;
  created_at: number;
  last_login_at: number | null;
};

async function currentAdmin(request: Request) {
  const user = await userFromRequest(request);
  return user?.role === "admin" ? user : null;
}

export async function GET(request: Request) {
  if (!(await currentAdmin(request))) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  const users = await queryAll<AdminUserRow>(
    `SELECT id, name, email, role, status, credits, created_at, last_login_at
     FROM users ORDER BY created_at DESC LIMIT 500`,
  );
  return NextResponse.json({
    users: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      credits: Number(user.credits),
      createdAt: Number(user.created_at),
      lastLoginAt: user.last_login_at ? Number(user.last_login_at) : null,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await currentAdmin(request);
    if (!admin) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });

    const body = (await request.json()) as {
      userId?: string;
      action?: "activate" | "suspend" | "make_admin" | "make_user" | "add_credits";
      amount?: number;
    };
    if (!body.userId || !body.action) return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    const target = await queryOne<AdminUserRow>("SELECT * FROM users WHERE id = ? LIMIT 1", [body.userId]);
    if (!target) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    if (target.id === admin.id && ["suspend", "make_user"].includes(body.action)) {
      return NextResponse.json({ error: "Você não pode remover o próprio acesso administrativo." }, { status: 400 });
    }

    const now = Date.now();
    if (body.action === "activate") await execute("UPDATE users SET status = 'active', updated_at = ? WHERE id = ?", [now, target.id]);
    if (body.action === "suspend") {
      await execute("UPDATE users SET status = 'suspended', updated_at = ? WHERE id = ?", [now, target.id]);
      await execute("DELETE FROM sessions WHERE user_id = ?", [target.id]);
    }
    if (body.action === "make_admin") await execute("UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?", [now, target.id]);
    if (body.action === "make_user") await execute("UPDATE users SET role = 'user', updated_at = ? WHERE id = ?", [now, target.id]);
    if (body.action === "add_credits") {
      const amount = Math.max(-100_000, Math.min(100_000, Math.trunc(Number(body.amount) || 0)));
      if (!amount) return NextResponse.json({ error: "Informe uma quantidade diferente de zero." }, { status: 400 });
      await execute("UPDATE users SET credits = MAX(0, credits + ?), updated_at = ? WHERE id = ?", [amount, now, target.id]);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Não foi possível atualizar o usuário." }, { status: 400 });
  }
}
