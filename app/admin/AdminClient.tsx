"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- native links avoid a Vinext dev hydration conflict */

import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Coins,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserCog,
  Users,
  UserX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../../lib/auth";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  status: "active" | "suspended";
  credits: number;
  createdAt: number;
  lastLoginAt: number | null;
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function date(value: number | null) {
  if (!value) return "Nunca";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default function AdminClient({ admin }: { admin: AuthUser }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await response.json() as { users?: ManagedUser[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao carregar usuários.");
      setUsers(data.users || []);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Falha ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/users", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { users?: ManagedUser[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Falha ao carregar usuários.");
        setUsers(data.users || []);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setMessage(reason instanceof Error ? reason.message : "Falha ao carregar usuários.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase())), [query, users]);
  const summary = useMemo(() => ({
    total: users.length,
    active: users.filter((user) => user.status === "active").length,
    admins: users.filter((user) => user.role === "admin").length,
    credits: users.reduce((sum, user) => sum + user.credits, 0),
  }), [users]);

  async function action(user: ManagedUser, name: "activate" | "suspend" | "make_admin" | "make_user" | "add_credits", amount?: number) {
    if (name === "suspend" && !window.confirm(`Suspender a conta de ${user.name}? A sessão atual será encerrada.`)) return;
    setBusy(`${user.id}:${name}`);
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, action: name, amount }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao atualizar a conta.");
      await loadUsers();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Falha ao atualizar a conta.");
    } finally {
      setBusy("");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <a href="/" className="admin-logo"><span className="brand-mark"><span /></span><span><strong>StormCast</strong><small>CONTROL ROOM</small></span></a>
        <nav><span>GESTÃO</span><button className="active"><Users /> Usuários</button><a href="/app"><Sparkles /> Estúdio</a><span>SISTEMA</span><button><Activity /> Atividade</button><button><ShieldCheck /> Segurança</button></nav>
        <div className="admin-account"><span>{initials(admin.name)}</span><div><strong>{admin.name}</strong><small>{admin.email}</small></div><button onClick={logout} aria-label="Sair"><LogOut /></button></div>
      </aside>
      <section className="admin-workspace">
        <header className="admin-top"><div><a href="/app"><ArrowLeft /> Voltar ao estúdio</a><span>Administração</span></div><button onClick={loadUsers} disabled={loading}><RefreshCw className={loading ? "spin" : ""} /> Atualizar</button></header>
        <div className="admin-content">
          <div className="admin-title"><div><span>CONTROLE DE ACESSO</span><h1>Pessoas e permissões</h1><p>Gerencie contas, saldos e acesso administrativo do StormCast.</p></div><div className="admin-identity"><ShieldCheck /><span><small>SESSÃO ATUAL</small><strong>Administrador</strong></span></div></div>
          <div className="admin-metrics">
            <article><span><Users /></span><div><small>CONTAS</small><strong>{summary.total}</strong><em>cadastradas</em></div></article>
            <article><span><CheckCircle2 /></span><div><small>ATIVAS</small><strong>{summary.active}</strong><em>{summary.total ? Math.round(summary.active / summary.total * 100) : 0}% da base</em></div></article>
            <article><span><UserCog /></span><div><small>ADMINISTRADORES</small><strong>{summary.admins}</strong><em>com acesso elevado</em></div></article>
            <article><span><Coins /></span><div><small>CRÉDITOS</small><strong>{summary.credits.toLocaleString("pt-BR")}</strong><em>distribuídos</em></div></article>
          </div>
          <section className="users-panel">
            <div className="users-panel-head"><div><h2>Usuários</h2><span>{filtered.length} resultado{filtered.length === 1 ? "" : "s"}</span></div><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nome ou e-mail" /></label></div>
            {message && <div className="admin-message">{message}</div>}
            <div className="users-table-wrap">
              <table className="users-table">
                <thead><tr><th>Conta</th><th>Perfil</th><th>Status</th><th>Créditos</th><th>Último acesso</th><th>Ações</th></tr></thead>
                <tbody>
                  {filtered.map((user) => (
                    <tr key={user.id}>
                      <td><div className="table-person"><span>{initials(user.name)}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div></td>
                      <td><span className={`role-pill role-${user.role}`}>{user.role === "admin" ? "Admin" : "Usuário"}</span></td>
                      <td><span className={`status-dot status-${user.status}`}><i />{user.status === "active" ? "Ativa" : "Suspensa"}</span></td>
                      <td><strong className="credit-count">{user.credits}</strong></td>
                      <td><span className="last-seen">{date(user.lastLoginAt)}</span></td>
                      <td><div className="row-actions"><button disabled={!!busy} onClick={() => action(user, "add_credits", 50)}><Coins /> +50</button><button disabled={!!busy || user.id === admin.id} onClick={() => action(user, user.role === "admin" ? "make_user" : "make_admin")}><UserCog /> {user.role === "admin" ? "Rebaixar" : "Admin"}</button><button className={user.status === "active" ? "danger" : "success"} disabled={!!busy || user.id === admin.id} onClick={() => action(user, user.status === "active" ? "suspend" : "activate")}>{user.status === "active" ? <UserX /> : <CheckCircle2 />}{user.status === "active" ? "Suspender" : "Ativar"}</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && !filtered.length && <div className="admin-empty"><Users /><strong>Nenhuma conta encontrada</strong><span>Tente outro termo de busca.</span></div>}
              {loading && <div className="admin-empty"><RefreshCw className="spin" /><strong>Carregando contas</strong></div>}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
