/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  STORMCAST_ADMIN_EMAIL?: string;
  STORMCAST_ADMIN_PASSWORD?: string;
  STORMCAST_ADMIN_NAME?: string;
  STORMCAST_DISABLE_REGISTRATION?: string;
  OPENAI_API_KEY?: string;
  OPENAI_ANALYSIS_MODEL?: string;
  OPENAI_TRANSCRIPTION_MODEL?: string;
  STORMCAST_SECRETS_KEY?: string;
  STORMCAST_FFMPEG_PATH?: string;
  STORMCAST_FFPROBE_PATH?: string;
  STORMCAST_MEDIA_DIR?: string;
  STORMCAST_MAX_VIDEO_MINUTES?: string;
  STORMCAST_MIN_FREE_GB?: string;
  STORMCAST_PROCESSOR_ENABLED?: string;
  STORMCAST_SESSION_DAYS?: string;
  STORMCAST_YTDLP_COOKIES?: string;
  STORMCAST_YTDLP_PATH?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Server-rendered routes access bindings through this request-scoped worker
    // bootstrap. On the Ubuntu build, the application uses local SQLite instead.
    (globalThis as typeof globalThis & { __STORMCAST_RUNTIME_ENV__?: Env }).__STORMCAST_RUNTIME_ENV__ = env;
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx);
    const secured = new Response(response.body, response);
    secured.headers.set("X-Content-Type-Options", "nosniff");
    secured.headers.set("X-Frame-Options", "DENY");
    secured.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    secured.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (request.headers.get("x-forwarded-proto") === "https" || url.protocol === "https:") {
      secured.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    return secured;
  },
};

export default worker;
