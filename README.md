# StormCast AI

Uma experiência web para transformar podcasts, vídeos longos e transmissões em cortes prontos para Shorts, Reels e TikTok.

## O que já está funcionando

- dashboard responsivo com navegação lateral;
- entrada por link do YouTube, Twitch, Kick ou Google Drive;
- upload e leitura local de metadados de arquivos de vídeo;
- fluxo de criação em cinco etapas;
- escolha de proporção, enquadramento, duração e estilo de legenda;
- prompt personalizado, incluindo uma direção pronta para conteúdo gospel;
- demonstração completa da análise e geração de sugestões;
- biblioteca persistida no navegador;
- tela de resultados com viral score, prévia e cópia de legenda;
- exportação do planejamento dos cortes em JSON;
- painel de monitoramento de lives;
- brand kit com cores, fonte e assinatura visual;
- layout adaptado para desktop, tablet e celular.

## Estado do produto

Esta entrega é um MVP funcional de interface. A análise exibida está identificada como modo de demonstração e gera sugestões realistas para validar todo o produto antes de ligar a infraestrutura de processamento.

Para processar vídeos reais em produção, a próxima fase deve conectar:

1. ingestão e armazenamento do vídeo;
2. transcrição e diarização;
3. análise semântica dos melhores momentos;
4. enquadramento automático e renderização com FFmpeg;
5. fila de trabalhos, créditos, usuários e cobrança.

## Desenvolvimento

Requer Node.js 22.13 ou superior.

```bash
npm install
npm run dev
```

Validações:

```bash
npm run lint
npm run build
```

## Stack

- React 19
- Next.js/Vinext
- TypeScript
- Tailwind CSS
- Lucide Icons
- Cloudflare Workers

---

Criado para o projeto StormCast.
