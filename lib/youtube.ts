import { runtimeValue } from "./database";

export type YouTubeMetadata = {
  videoId: string;
  title: string;
  durationSeconds: number;
  thumbnailUrl: string;
  channel: string;
  canonicalUrl: string;
};

export class YouTubeInspectionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "YouTubeInspectionError";
    this.status = status;
  }
}

function videoIdFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "shorts" || parts[0] === "live" || parts[0] === "embed")
    return parts[1] || "";
  return "";
}

export function normalizeYouTubeUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new YouTubeInspectionError("Cole um link válido do YouTube.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new YouTubeInspectionError("O link precisa usar HTTP ou HTTPS.");
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let videoId = "";
  if (host === "youtu.be")
    videoId = url.pathname.split("/").filter(Boolean)[0] || "";
  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    videoId = url.searchParams.get("v") || videoIdFromPath(url.pathname);
  }

  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new YouTubeInspectionError(
      "Use o link de um vídeo individual do YouTube. Playlists não são aceitas.",
    );
  }

  return {
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

function safeText(value: unknown, fallback: string, maximum: number) {
  if (typeof value !== "string") return fallback;
  const clean = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean ? clean.slice(0, maximum) : fallback;
}

function nodeChildProcess() {
  const runtimeProcess = typeof process !== "undefined" ? process : undefined;
  const getBuiltinModule =
    runtimeProcess?.getBuiltinModule?.bind(runtimeProcess);
  if (!getBuiltinModule) return null;
  return getBuiltinModule(
    "node:child_process",
  ) as typeof import("node:child_process");
}

function executeFile(file: string, args: string[]) {
  const childProcess = nodeChildProcess();
  if (!childProcess) {
    throw new YouTubeInspectionError(
      "A inspeção de vídeos só está disponível no servidor Ubuntu.",
      503,
    );
  }

  return new Promise<string>((resolve, reject) => {
    childProcess.execFile(
      file,
      args,
      { timeout: 60_000, maxBuffer: 2 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout);
          return;
        }

        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          reject(
            new YouTubeInspectionError(
              "O yt-dlp ainda não está instalado no servidor.",
              503,
            ),
          );
          return;
        }
        const detail = safeText(stderr, "", 500).toLowerCase();
        if (detail.includes("private video") || detail.includes("sign in")) {
          reject(
            new YouTubeInspectionError(
              "Esse vídeo exige autenticação ou não é público.",
            ),
          );
          return;
        }
        if (
          detail.includes("unsupported url") ||
          detail.includes("video unavailable")
        ) {
          reject(
            new YouTubeInspectionError(
              "O vídeo não está disponível para processamento.",
            ),
          );
          return;
        }
        reject(
          new YouTubeInspectionError(
            "Não foi possível consultar o vídeo no YouTube. Tente novamente.",
            502,
          ),
        );
      },
    );
  });
}

export function processorConfigured() {
  return (
    runtimeValue("STORMCAST_PROCESSOR_ENABLED") === "1" &&
    Boolean(runtimeValue("OPENAI_API_KEY"))
  );
}

export function maximumVideoMinutes() {
  const configured = Number(runtimeValue("STORMCAST_MAX_VIDEO_MINUTES"));
  return Number.isFinite(configured) && configured >= 5 && configured <= 240
    ? Math.floor(configured)
    : 90;
}

export async function inspectYouTube(input: string): Promise<YouTubeMetadata> {
  const normalized = normalizeYouTubeUrl(input);
  const executable = runtimeValue("STORMCAST_YTDLP_PATH") || "yt-dlp";
  const baseArgs = [
    "--dump-single-json",
    "--skip-download",
    "--no-playlist",
    "--no-warnings",
    "--socket-timeout",
    "20",
    "--retries",
    "2",
  ];
  const runtimeProcess = typeof process !== "undefined" ? process : undefined;
  const cookiesPath = runtimeValue("STORMCAST_YTDLP_COOKIES");
  const cookiesArgs = cookiesPath ? ["--cookies", cookiesPath] : [];
  const nodeArgs = runtimeProcess?.execPath
    ? ["--js-runtimes", `node:${runtimeProcess.execPath}`]
    : [];
  const attempts = [
    [...nodeArgs],
    [
      ...nodeArgs,
      "--extractor-args",
      "youtube:player_client=default,-web_safari",
    ],
    ["--extractor-args", "youtube:player_client=android_vr"],
  ];
  let output = "";
  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      output = await executeFile(executable, [
        ...baseArgs,
        ...attempt,
        ...cookiesArgs,
        normalized.canonicalUrl,
      ]);
      break;
    } catch (error) {
      if (error instanceof YouTubeInspectionError && error.status !== 502)
        throw error;
      lastError = error;
    }
  }
  if (!output) {
    if (lastError instanceof YouTubeInspectionError) throw lastError;
    throw new YouTubeInspectionError(
      "Não foi possível consultar o vídeo no YouTube. Tente novamente.",
      502,
    );
  }
  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(output) as Record<string, unknown>;
  } catch {
    throw new YouTubeInspectionError(
      "O YouTube retornou metadados inválidos.",
      502,
    );
  }

  const returnedId = typeof metadata.id === "string" ? metadata.id : "";
  if (returnedId !== normalized.videoId) {
    throw new YouTubeInspectionError(
      "O vídeo retornado não corresponde ao link informado.",
    );
  }

  const durationSeconds = Math.ceil(Number(metadata.duration));
  if (!Number.isFinite(durationSeconds) || durationSeconds < 10) {
    throw new YouTubeInspectionError(
      "Não foi possível determinar a duração real do vídeo.",
    );
  }
  const maxSeconds = maximumVideoMinutes() * 60;
  if (durationSeconds > maxSeconds) {
    throw new YouTubeInspectionError(
      `O vídeo ultrapassa o limite atual de ${maximumVideoMinutes()} minutos.`,
    );
  }

  return {
    videoId: normalized.videoId,
    canonicalUrl: normalized.canonicalUrl,
    title: safeText(metadata.title, "Vídeo do YouTube", 180),
    durationSeconds,
    channel: safeText(
      metadata.channel || metadata.uploader,
      "Canal do YouTube",
      120,
    ),
    thumbnailUrl: `https://i.ytimg.com/vi/${normalized.videoId}/hqdefault.jpg`,
  };
}
