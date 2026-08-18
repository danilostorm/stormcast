/* eslint-disable @next/next/no-html-link-for-pages -- native links avoid a Vinext dev hydration conflict */
import { redirect } from "next/navigation";
import { ShieldCheck, Sparkles } from "lucide-react";
import { getCurrentUser } from "../../lib/auth";
import AuthForm from "./AuthForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entrar", robots: { index: false, follow: false } };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "admin" ? "/admin" : "/app");
  return <AuthPage mode="login" />;
}

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const register = mode === "register";
  return (
    <main className="auth-page">
      <section className="auth-story">
        <a href="/" className="auth-logo"><span className="brand-mark"><span /></span><span><strong>StormCast</strong><small>AI VIDEO STUDIO</small></span></a>
        <div className="auth-story-copy"><span><Sparkles /> ESPAÇO CRIATIVO PROTEGIDO</span><h1>{register ? "Seu conteúdo merece um fluxo só seu." : "Volte para o momento certo."}</h1><p>{register ? "Crie projetos, organize cortes e mantenha sua identidade visual em um ambiente separado por conta." : "Entre para continuar seus projetos e revisar os momentos que você selecionou."}</p></div>
        <div className="auth-signal"><i /><i /><i /><i /><i /><i /><i /><i /><span>STORMCAST SIGNAL</span></div>
        <div className="auth-security"><ShieldCheck /><div><strong>Sessão protegida no servidor</strong><small>Senha derivada com PBKDF2 e cookie HttpOnly.</small></div></div>
      </section>
      <section className="auth-panel"><div className="auth-panel-inner"><a href="/" className="auth-back">← Voltar ao site</a><span className="auth-kicker">{register ? "NOVA CONTA" : "BEM-VINDO DE VOLTA"}</span><h2>{register ? "Comece no StormCast" : "Acesse seu estúdio"}</h2><p>{register ? "São 120 créditos iniciais para explorar o produto." : "Use o e-mail e a senha da sua conta."}</p><AuthForm mode={mode} /></div></section>
    </main>
  );
}
