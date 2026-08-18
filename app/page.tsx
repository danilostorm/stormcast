/* eslint-disable @next/next/no-html-link-for-pages -- native links avoid a Vinext dev hydration conflict */
import {
  ArrowRight,
  BadgeCheck,
  Captions,
  ChartNoAxesCombined,
  Check,
  Clapperboard,
  Focus,
  Gauge,
  Layers3,
  Play,
  Radio,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  Zap,
} from "lucide-react";
import { getCurrentUser } from "../lib/auth";

export const dynamic = "force-dynamic";

function Logo() {
  return (
    <span className="marketing-logo">
      <span className="brand-mark"><span /></span>
      <span><strong>StormCast</strong><small>AI VIDEO STUDIO</small></span>
    </span>
  );
}

export default async function MarketingPage() {
  const user = await getCurrentUser();
  const dashboardHref = user?.role === "admin" ? "/admin" : "/app";

  return (
    <main className="marketing-page">
      <header className="marketing-header">
        <a href="/" aria-label="StormCast — página inicial"><Logo /></a>
        <nav aria-label="Navegação pública">
          <a href="#metodo">Como funciona</a>
          <a href="#recursos">Recursos</a>
          <a href="#planos">Planos</a>
          <a href="#faq">Dúvidas</a>
        </nav>
        <div className="marketing-header-actions">
          {user ? (
            <a className="header-cta" href={dashboardHref}>Abrir painel <ArrowRight size={15} /></a>
          ) : (
            <>
              <a className="header-login" href="/login">Entrar</a>
              <a className="header-cta" href="/cadastro">Criar conta <ArrowRight size={15} /></a>
            </>
          )}
        </div>
      </header>

      <section className="marketing-hero">
        <div className="hero-grid-glow" />
        <div className="marketing-hero-copy">
          <span className="launch-pill"><i /> Seu conteúdo longo, pronto para o feed</span>
          <h1>Encontre o trecho que<br /><em>ninguém vai pular.</em></h1>
          <p>O StormCast organiza seu vídeo, destaca os momentos mais fortes e prepara cortes com enquadramento, legenda e contexto — em um fluxo simples.</p>
          <div className="hero-ctas">
            <a className="hero-primary" href={user ? dashboardHref : "/cadastro"}><WandSparkles size={18} /> {user ? "Continuar no StormCast" : "Começar gratuitamente"}</a>
            <a className="hero-secondary" href="#metodo"><Play size={16} fill="currentColor" /> Ver como funciona</a>
          </div>
          <div className="hero-proof">
            <span><Check size={14} /> Cadastro gratuito</span>
            <span><Check size={14} /> 120 créditos iniciais</span>
            <span><Check size={14} /> Sem cartão</span>
          </div>
        </div>

        <div className="signal-console" aria-label="Prévia visual do produto">
          <div className="console-head"><span><i /> radar de momentos</span><em>01:12:08</em></div>
          <div className="console-stage">
            <div className="speaker speaker-one"><span>Host</span></div>
            <div className="speaker speaker-two"><span>Convidado</span></div>
            <div className="caption-sample">“A história muda quando você percebe este detalhe.”</div>
            <div className="focus-frame frame-one" /><div className="focus-frame frame-two" />
          </div>
          <div className="signal-track">
            <div className="signal-label"><span>INTENSIDADE DA CONVERSA</span><strong>6 momentos encontrados</strong></div>
            <div className="signal-bars">{[22, 38, 30, 62, 45, 84, 54, 42, 91, 64, 35, 72, 48, 29, 57, 36, 76, 44, 28, 55].map((height, index) => <i key={index} className={[5, 8, 16].includes(index) ? "peak" : ""} style={{ height: `${height}%` }} />)}</div>
          </div>
          <div className="moment-card"><span><Sparkles size={15} /></span><div><small>MELHOR GANCHO</small><strong>Score de retenção 96</strong></div><ArrowRight size={17} /></div>
        </div>

        <div className="platform-strip">
          <span>ENTRADAS COMPATÍVEIS</span><div><i>YouTube</i><i>Twitch</i><i>Kick</i><i>Google Drive</i><i>MP4</i></div>
        </div>
      </section>

      <section className="method-section" id="metodo">
        <div className="section-intro centered"><span>UM FLUXO, SEM ATRITO</span><h2>Da conversa ao corte em três movimentos.</h2><p>Você mantém a direção criativa. O StormCast cuida da parte repetitiva.</p></div>
        <div className="method-grid">
          <article><span className="method-number">01</span><div className="method-icon"><Clapperboard /></div><h3>Traga o conteúdo</h3><p>Cole um link ou envie o arquivo. Escolha quanto do vídeo deve ser analisado.</p><small>LINK OU UPLOAD</small></article>
          <article><span className="method-number">02</span><div className="method-icon"><ScanSearch /></div><h3>Defina a intenção</h3><p>Informe tema, duração, formato e o tipo de momento que vale a pena encontrar.</p><small>DIREÇÃO CRIATIVA</small></article>
          <article><span className="method-number">03</span><div className="method-icon"><Layers3 /></div><h3>Revise e publique</h3><p>Compare scores, ajuste a legenda e prepare cada corte para o canal certo.</p><small>SAÍDA ORGANIZADA</small></article>
        </div>
      </section>

      <section className="product-section" id="recursos">
        <div className="product-copy">
          <span className="section-kicker">STORMCAST SIGNAL</span>
          <h2>Contexto antes do clique.</h2>
          <p>Um corte forte não começa em um efeito. Começa na ideia certa. O painel prioriza clareza, ritmo e força do gancho para você decidir com segurança.</p>
          <ul>
            <li><span><Gauge /></span><div><strong>Score explicado</strong><small>Veja por que um trecho merece atenção.</small></div></li>
            <li><span><Focus /></span><div><strong>Enquadramento adaptável</strong><small>Vertical, horizontal, rosto ou tela dividida.</small></div></li>
            <li><span><Captions /></span><div><strong>Legenda com identidade</strong><small>Cores e estilos consistentes em todo projeto.</small></div></li>
          </ul>
          <a href={user ? dashboardHref : "/cadastro"}>Explorar o estúdio <ArrowRight size={16} /></a>
        </div>
        <div className="product-board">
          <div className="board-sidebar"><Logo /><i className="active" /><i /><i /><i /><i /></div>
          <div className="board-main">
            <div className="board-top"><span>Projeto / Entrevista completa</span><em>96 créditos</em></div>
            <div className="board-summary"><div><small>ANÁLISE CONCLUÍDA</small><strong>6 momentos para revisar</strong></div><span><BadgeCheck /> Pronto</span></div>
            <div className="board-cards">
              {["A pergunta inesperada", "O detalhe que muda tudo", "Uma resposta em 42 segundos"].map((title, index) => (
                <article key={title}><div className={`board-thumb board-thumb-${index + 1}`}><span>0{index + 1}</span><Play size={17} fill="currentColor" /></div><small>SCORE {96 - index * 4}</small><strong>{title}</strong><i><span style={{ width: `${88 - index * 10}%` }} /></i></article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="feature-section">
        <div className="section-intro"><span>FERRAMENTAS QUE CONVERSAM</span><h2>Seu conteúdo em um único lugar.</h2></div>
        <div className="feature-grid">
          <article className="feature-wide"><span><Radio /></span><div><small>CAPTURA CONTÍNUA</small><h3>Monitore lives sem perder o melhor minuto.</h3><p>Acompanhe canais e reúna destaques no mesmo espaço dos projetos gravados.</p></div><div className="live-pulse"><i /><b>AO VIVO</b><strong>18</strong><small>momentos</small></div></article>
          <article><span><Captions /></span><small>LEGENDAS</small><h3>Leitura rápida, estilo seu.</h3><p>Presets visuais prontos para personalizar.</p></article>
          <article><span><ChartNoAxesCombined /></span><small>ANÁLISE</small><h3>Entenda seu ritmo de produção.</h3><p>Projetos, cortes, consumo e histórico.</p></article>
          <article><span><ShieldCheck /></span><small>ACESSO</small><h3>Conta e painel protegidos.</h3><p>Sessões seguras e controle administrativo.</p></article>
          <article><span><Zap /></span><small>FLUXO</small><h3>Do link à revisão sem atalhos confusos.</h3><p>Um passo claro por decisão.</p></article>
        </div>
      </section>

      <section className="plans-section" id="planos">
        <div className="section-intro centered"><span>COMECE NO SEU RITMO</span><h2>Planos claros para validar primeiro.</h2><p>A cobrança ainda não está ativa. Você pode criar a conta e explorar o fluxo gratuitamente.</p></div>
        <div className="plans-grid">
          <article><small>EXPLORAR</small><h3>Grátis</h3><p>Para conhecer o produto e montar os primeiros projetos.</p><strong>R$ 0 <span>/ agora</span></strong><ul><li><Check /> 120 créditos iniciais</li><li><Check /> Projetos e cortes demonstrativos</li><li><Check /> Brand kit básico</li></ul><a href="/cadastro">Criar conta</a></article>
          <article className="plan-featured"><em>MAIS ESCOLHIDO NO LANÇAMENTO</em><small>CRIADOR</small><h3>Em breve</h3><p>Para quem produz conteúdo toda semana e quer acelerar a edição.</p><strong>Lista antecipada</strong><ul><li><Check /> Mais créditos mensais</li><li><Check /> Exportações sem marca</li><li><Check /> Monitoramento de lives</li></ul><a href="/cadastro">Garantir acesso</a></article>
          <article><small>ESTÚDIO</small><h3>Sob medida</h3><p>Para equipes, canais e operações com maior volume.</p><strong>Fale conosco</strong><ul><li><Check /> Múltiplos usuários</li><li><Check /> Limites personalizados</li><li><Check /> Suporte de implantação</li></ul><a href="mailto:contato@stormcast.site">Conversar</a></article>
        </div>
      </section>

      <section className="faq-section" id="faq">
        <div className="section-intro"><span>SEM LETRAS MIÚDAS</span><h2>Perguntas frequentes.</h2></div>
        <div className="faq-list">
          <details><summary>O StormCast já processa vídeos reais?<span>+</span></summary><p>Esta versão entrega o fluxo completo de produto em modo demonstrativo. A infraestrutura de transcrição, IA e renderização por FFmpeg será conectada na próxima fase.</p></details>
          <details><summary>Quais fontes de vídeo são aceitas?<span>+</span></summary><p>O painel aceita links do YouTube, Twitch, Kick e Google Drive, além de arquivos de vídeo enviados pelo navegador.</p></details>
          <details><summary>Minha área fica aberta para qualquer pessoa?<span>+</span></summary><p>Não. O estúdio e a administração exigem sessão autenticada. Cada conta usa seu próprio espaço local de projetos.</p></details>
          <details><summary>Posso usar a identidade da minha marca?<span>+</span></summary><p>Sim. O Brand Kit permite definir cores, estilo de legenda e assinatura visual para manter consistência.</p></details>
        </div>
      </section>

      <section className="final-cta">
        <div><span><Sparkles /></span><small>SEU PRÓXIMO CORTE COMEÇA AQUI</small><h2>Menos tempo procurando.<br />Mais tempo publicando.</h2><p>Crie sua conta e entre no novo espaço protegido do StormCast.</p><a href={user ? dashboardHref : "/cadastro"}>{user ? "Abrir meu painel" : "Criar conta gratuita"} <ArrowRight size={17} /></a></div>
      </section>

      <footer className="marketing-footer"><Logo /><p>Uma plataforma brasileira para transformar conversas em conteúdo vertical.</p><div><a href="#metodo">Produto</a><a href="#planos">Planos</a><a href="/login">Entrar</a></div><small>© {new Date().getFullYear()} StormCast. Produto independente.</small></footer>
    </main>
  );
}
