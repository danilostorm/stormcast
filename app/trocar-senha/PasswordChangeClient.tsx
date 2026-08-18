"use client";
import { useState } from "react";
export default function PasswordChangeClient({ name }: { name: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      password = String(form.get("password") || ""),
      confirm = String(form.get("confirm") || "");
    if (password !== confirm) {
      setMessage("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Falha.");
      setBusy(false);
      return;
    }
    location.assign("/login");
  }
  return (
    <main className="auth-page password-change-page">
      <section className="auth-panel">
        <div className="auth-card">
          <span>SEGURANÇA</span>
          <h1>Crie uma nova senha</h1>
          <p>
            Olá, {name}. O administrador solicitou a troca da sua senha antes de
            continuar.
          </p>
          <form onSubmit={submit}>
            <label>
              <span>Nova senha</span>
              <input name="password" type="password" minLength={10} required />
            </label>
            <label>
              <span>Confirmar senha</span>
              <input name="confirm" type="password" minLength={10} required />
            </label>
            {message && <div className="field-error">{message}</div>}
            <button className="primary-button" disabled={busy}>
              {busy ? "Salvando..." : "Alterar senha e entrar novamente"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
