"use client";

import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const register = mode === "register";
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    if (register && password !== String(form.get("confirmPassword") || "")) {
      setError("As senhas não coincidem.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/auth/${register ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") || ""),
          email: String(form.get("email") || ""),
          password,
        }),
      });
      const data = await response.json() as { error?: string; user?: { role?: string } };
      if (!response.ok) throw new Error(data.error || "Não foi possível continuar.");
      window.location.assign(data.user?.role === "admin" ? "/admin" : "/app");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível continuar.");
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {register && <label><span>Seu nome</span><div><UserRound /><input name="name" autoComplete="name" minLength={2} maxLength={80} placeholder="Como podemos chamar você?" required /></div></label>}
      <label><span>E-mail</span><div><Mail /><input name="email" type="email" autoComplete="email" placeholder="voce@exemplo.com" required /></div></label>
      <label><span>Senha</span><div><LockKeyhole /><input name="password" type={showPassword ? "text" : "password"} autoComplete={register ? "new-password" : "current-password"} minLength={register ? 10 : undefined} placeholder={register ? "Mínimo de 10 caracteres" : "Sua senha"} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
      {register && <label><span>Confirme a senha</span><div><LockKeyhole /><input name="confirmPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={10} placeholder="Digite novamente" required /></div></label>}
      {register && <label className="auth-consent"><input type="checkbox" required /><span>Concordo em usar esta versão demonstrativa e entendo que o processamento real de vídeos será integrado em uma próxima fase.</span></label>}
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button className="auth-submit" disabled={loading}>{loading ? "Aguarde…" : register ? "Criar minha conta" : "Entrar no StormCast"}<ArrowRight /></button>
      <p className="auth-switch">{register ? "Já tem uma conta?" : "Ainda não tem conta?"} <a href={register ? "/login" : "/cadastro"}>{register ? "Entrar" : "Cadastrar gratuitamente"}</a></p>
    </form>
  );
}
