# StormCast

Plataforma web para transformar podcasts, vídeos longos e transmissões em cortes para Shorts, Reels e TikTok.

## O que está disponível

- landing page pública, responsiva e com identidade própria;
- cadastro, login, logout e sessões persistidas no servidor;
- senhas derivadas com PBKDF2-SHA256 e salt individual;
- cookies de sessão `HttpOnly`, `SameSite=Lax` e `Secure` sob HTTPS;
- estúdio protegido em `/app`;
- área administrativa protegida em `/admin`;
- gestão de usuários, funções, status e créditos;
- banco SQLite local no Ubuntu e D1 na hospedagem Cloudflare;
- projetos separados por conta no armazenamento do navegador;
- fluxo de criação em cinco etapas, biblioteca, cortes, lives, Brand Kit e métricas;
- cabeçalhos de segurança contra iframe, MIME sniffing e permissões desnecessárias.

## Limite atual do produto

O fluxo do estúdio é um MVP funcional de interface. A análise e os resultados ainda operam em modo demonstrativo. A fase seguinte deve conectar ingestão, armazenamento, transcrição, análise semântica, filas e renderização com FFmpeg.

## Desenvolvimento

Requer Node.js 22.13 ou superior.

```bash
npm ci
cp .env.example .env
npm run dev
```

Para validar:

```bash
npm run lint
npm run build
npm run test
```

## Produção no Ubuntu 24.04

O servidor precisa de um arquivo de ambiente fora do repositório e de um diretório persistente para o SQLite.

1. Crie o diretório do banco para o mesmo usuário que executa o serviço:

```bash
sudo install -d -m 750 -o "$USER" -g "$USER" /var/lib/stormcast
```

2. Gere uma senha longa e aleatória:

```bash
openssl rand -base64 36
```

3. Crie `/etc/stormcast.env` como `root` e preencha os valores reais:

```dotenv
STORMCAST_ADMIN_NAME="Administrador StormCast"
STORMCAST_ADMIN_EMAIL="seu-email@dominio.com"
STORMCAST_ADMIN_PASSWORD="senha-longa-gerada-no-passo-anterior"
STORMCAST_DB_PATH="/var/lib/stormcast/stormcast.db"
STORMCAST_DISABLE_REGISTRATION="0"
STORMCAST_SESSION_DAYS="30"
```

Proteja o arquivo:

```bash
sudo chown root:root /etc/stormcast.env
sudo chmod 600 /etc/stormcast.env
```

4. O serviço `/etc/systemd/system/stormcast.service` deve conter `EnvironmentFile=/etc/stormcast.env`:

```ini
[Unit]
Description=StormCast
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=SEU_USUARIO
Group=SEU_USUARIO
WorkingDirectory=/var/www/stormcast
Environment=NODE_ENV=production
EnvironmentFile=/etc/stormcast.env
ExecStart=/usr/bin/npm run start -- --hostname 127.0.0.1 --port 3000
Restart=always
RestartSec=5
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

5. Atualize e reinicie:

```bash
cd /var/www/stormcast
git pull --ff-only
npm ci
npm run lint
npm run build
sudo systemctl daemon-reload
sudo systemctl restart stormcast
sudo systemctl status stormcast --no-pager
```

Na primeira requisição, o usuário configurado por `STORMCAST_ADMIN_EMAIL` será criado ou promovido a administrador. Não publique a nova versão sem configurar essas variáveis.

## Stack

- React 19 e Next.js/Vinext
- TypeScript e Tailwind CSS
- Cloudflare Workers/D1 na hospedagem gerenciada
- SQLite nativo do Node.js na instalação Ubuntu
- Lucide Icons
