# StormCast

Plataforma para transformar vídeos longos autorizados em cortes legendados para Shorts, Reels, TikTok e YouTube.

## O que funciona de verdade

- landing page pública, cadastro, login, logout e sessões persistentes;
- painel individual protegido e administração em `/admin`;
- usuários, funções, suspensão e créditos no SQLite;
- consulta real de título e duração do YouTube com `yt-dlp`;
- fila persistente: um trabalho por vez, adequada a servidor sem GPU;
- download temporário, áudio segmentado e limpeza automática;
- transcrição com timestamps pela OpenAI ou Groq;
- escolha estruturada dos melhores trechos por OpenAI, Groq, DeepSeek, Gemini, OpenRouter ou provedor compatível;
- renderização local com FFmpeg em 9:16 ou 16:9, cinco enquadramentos e 12 estilos de legenda;
- detecção facial opcional com OpenCV para movimentar o recorte vertical automaticamente;
- prévia e download de MP4 acessíveis somente pelo dono do projeto;
- cobrança de créditos apenas depois da conclusão de todos os cortes;
- cancelamento, falha sem cobrança e retomada da fila após reinício.

O primeiro conector real é o YouTube. Upload, lives, publicação social e compra de créditos aparecem como indisponíveis até serem implementados; o painel não cria conteúdo fictício.

## Arquitetura híbrida

O servidor Ubuntu executa as partes pesadas de arquivo (`yt-dlp` e FFmpeg). O provedor escolhido recebe apenas os trechos de áudio para transcrição e/ou a transcrição textual para seleção editorial. O vídeo completo não é enviado ao provedor de análise.

O padrão continua sendo OpenAI com `whisper-1` e `gpt-5-mini`. Em `/admin`, a área **Provedores de IA** permite cadastrar chaves criptografadas, testar conexões, alterar modelos e escolher provedores diferentes para transcrição e análise. A variável `OPENAI_API_KEY` permanece como fallback compatível com instalações existentes.

## Desenvolvimento

Requer Node.js 22.13 ou superior.

```bash
npm ci
cp .env.example .env
npm run dev
```

Validação:

```bash
npm run lint
npm run test
npm run processor:check
```

`processor:check` termina com erro enquanto os provedores selecionados, o `yt-dlp` e `STORMCAST_PROCESSOR_ENABLED=1` não estiverem configurados. Isso é intencional.

## Instalação do processamento real no Ubuntu 24.04

Os comandos abaixo consideram o projeto em `/var/www/stormcast` e o serviço executado por `SEU_USUARIO`. Use o mesmo usuário dos dois serviços.

### 1. Instale FFmpeg e o yt-dlp isolado

```bash
sudo apt update
sudo apt install -y ffmpeg python3-venv ca-certificates
sudo python3 -m venv /opt/stormcast-tools
sudo /opt/stormcast-tools/bin/pip install --upgrade pip yt-dlp opencv-python-headless
/usr/bin/ffmpeg -version
/opt/stormcast-tools/bin/yt-dlp --version
/opt/stormcast-tools/bin/python -c "import cv2; print(cv2.__version__)"
```

Não instale pacotes NVIDIA: este fluxo foi preparado para CPU.

### 2. Prepare o armazenamento persistente

```bash
sudo install -d -m 750 -o SEU_USUARIO -g SEU_USUARIO /var/lib/stormcast
sudo install -d -m 750 -o SEU_USUARIO -g SEU_USUARIO /var/lib/stormcast/media
sudo install -d -m 750 -o SEU_USUARIO -g SEU_USUARIO /var/lib/stormcast/media/work
sudo install -d -m 750 -o SEU_USUARIO -g SEU_USUARIO /var/lib/stormcast/media/clips
```

Arquivos de trabalho são apagados ao terminar, falhar ou cancelar. Os MP4 concluídos ficam em `/var/lib/stormcast/media/clips`.

### 3. Configure a chave-mestra e a OpenAI inicial

Crie a chave no painel da OpenAI e coloque-a diretamente no servidor. Gere também uma chave-mestra aleatória, usada para criptografar no banco as chaves que forem cadastradas depois pelo administrativo. Não cole nenhuma delas em conversa, issue ou commit.

Edite como `root`:

```bash
openssl rand -hex 32
sudo nano /etc/stormcast.env
```

Conteúdo mínimo:

```dotenv
NODE_ENV="production"
STORMCAST_ADMIN_NAME="Administrador StormCast"
STORMCAST_ADMIN_EMAIL="seu-email@dominio.com"
STORMCAST_ADMIN_PASSWORD="sua-senha-longa"
STORMCAST_DB_PATH="/var/lib/stormcast/stormcast.db"
STORMCAST_DISABLE_REGISTRATION="0"
STORMCAST_SESSION_DAYS="30"

OPENAI_API_KEY="sk-COLOQUE_A_CHAVE_SOMENTE_AQUI"
OPENAI_TRANSCRIPTION_MODEL="whisper-1"
OPENAI_ANALYSIS_MODEL="gpt-5-mini"
STORMCAST_SECRETS_KEY="COLE_AQUI_O_RESULTADO_DE_OPENSSL_RAND_HEX_32"
STORMCAST_PROCESSOR_ENABLED="1"

STORMCAST_YTDLP_PATH="/opt/stormcast-tools/bin/yt-dlp"
STORMCAST_FFMPEG_PATH="/usr/bin/ffmpeg"
STORMCAST_FFPROBE_PATH="/usr/bin/ffprobe"
STORMCAST_PYTHON_PATH="/opt/stormcast-tools/bin/python"
STORMCAST_MEDIA_DIR="/var/lib/stormcast/media"
STORMCAST_MAX_VIDEO_MINUTES="90"
STORMCAST_MIN_FREE_GB="5"
STORMCAST_FFMPEG_THREADS="8"
STORMCAST_PROCESSOR_POLL_MS="3000"
```

Proteja o arquivo:

```bash
sudo chown root:root /etc/stormcast.env
sudo chmod 600 /etc/stormcast.env
```

### 4. Valide as ferramentas locais

```bash
cd /var/www/stormcast
sudo -u SEU_USUARIO test -x /opt/stormcast-tools/bin/yt-dlp
sudo -u SEU_USUARIO test -x /usr/bin/ffmpeg
sudo -u SEU_USUARIO test -w /var/lib/stormcast/media/work
```

O teste completo, incluindo as variáveis secretas, será executado pelo mesmo ambiente protegido do serviço nos passos seguintes.

### 5. Serviço web

`/etc/systemd/system/stormcast.service`:

```ini
[Unit]
Description=StormCast Web
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=SEU_USUARIO
Group=SEU_USUARIO
WorkingDirectory=/var/www/stormcast
EnvironmentFile=/etc/stormcast.env
ExecStart=/usr/bin/npm run start -- --hostname 127.0.0.1 --port 3000
Restart=always
RestartSec=5
TimeoutStopSec=30
UMask=0027

[Install]
WantedBy=multi-user.target
```

### 6. Serviço do processador

`/etc/systemd/system/stormcast-processor.service`:

```ini
[Unit]
Description=StormCast YouTube and AI Processor
After=network-online.target stormcast.service
Wants=network-online.target

[Service]
Type=simple
User=SEU_USUARIO
Group=SEU_USUARIO
WorkingDirectory=/var/www/stormcast
EnvironmentFile=/etc/stormcast.env
ExecStartPre=/usr/bin/npm run processor:check
ExecStart=/usr/bin/npm run processor
Restart=always
RestartSec=5
TimeoutStopSec=120
KillSignal=SIGTERM
UMask=0027
Nice=5

[Install]
WantedBy=multi-user.target
```

O worker processa somente um projeto por vez. `STORMCAST_FFMPEG_THREADS=8` deixa metade dos 16 processadores lógicos livre para o site e para o sistema.

### 7. Atualize e inicie

```bash
cd /var/www/stormcast
git pull --ff-only
npm ci
npm run lint
npm run build
sudo systemctl daemon-reload
sudo systemctl enable --now stormcast stormcast-processor
sudo systemctl restart stormcast stormcast-processor
sudo systemctl status stormcast --no-pager
sudo systemctl status stormcast-processor --no-pager
```

O `ExecStartPre` executa a checagem completa com o mesmo `EnvironmentFile` do worker, sem colocar a chave no histórico do shell. Se algo estiver ausente, o serviço não inicia e informa exatamente o motivo no journal.

Logs do processamento:

```bash
sudo journalctl -u stormcast-processor -f
```

### 8. Primeiro teste seguro

Comece com um vídeo seu de 2 a 5 minutos e selecione apenas 1 minuto para análise. Acompanhe o projeto no painel e, em paralelo:

```bash
sudo journalctl -u stormcast-processor -f
df -h /
free -h
```

O projeto deve passar por `Na fila`, `Baixando`, `Transcrevendo`, `Analisando`, `Renderizando` e `Pronto`. Se falhar, o motivo real aparece no projeto e nenhum crédito é descontado.

## Limites e segurança

- somente URLs individuais de domínios oficiais do YouTube são aceitas;
- playlists e URLs arbitrárias são rejeitadas para evitar SSRF;
- limite padrão: 90 minutos analisados e arquivo de até 2 GB;
- um novo job é recusado se houver menos de 5 GB livres no volume de mídia;
- áudio é dividido em blocos de 15 minutos, abaixo do limite de 25 MB da API;
- uma conta pode manter apenas um trabalho ativo;
- os vídeos não ficam em pasta pública e toda leitura verifica sessão e proprietário;
- use somente vídeos próprios ou com autorização para baixar e editar;
- cookies do YouTube são opcionais e devem ser usados apenas para conteúdo autorizado.

## Stack

- React 19, Next.js/Vinext e TypeScript
- SQLite nativo do Node.js no Ubuntu
- `yt-dlp`, FFmpeg/libass e H.264/AAC
- APIs compatíveis com OpenAI: OpenAI, Groq, DeepSeek, Gemini e OpenRouter
- Cloudflare Workers/D1 para a prévia hospedada (sem o worker pesado)
