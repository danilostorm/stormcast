export const framingIds = ["auto", "face", "participant", "center", "split", "react", "fit", "manual"] as const;
export const captionStyleIds = ["impact", "karaoke", "clean", "bold", "box", "keyword", "minimal", "neon", "podcast", "cinematic", "gospel", "reels", "twolines", "lower", "title", "brand"] as const;
export type FramingId = typeof framingIds[number];
export type CaptionStyleId = typeof captionStyleIds[number];

export type RenderOptions = {
  manualPosition: number;
  blurStrength: number;
  safeArea: "shorts" | "reels" | "tiktok";
  captionFont: string;
  captionSize: number;
  captionPosition: "top" | "middle" | "bottom";
  primaryColor: string;
  highlightColor: string;
  outline: number;
  shadow: number;
  textCase: "original" | "upper" | "lower";
  wordsPerBlock: number;
  animation: "none" | "pop" | "fade" | "bounce";
  removeFillers: boolean;
  subtitleText: string;
};

export const defaultRenderOptions: RenderOptions = {
  manualPosition: 0,
  blurStrength: 20,
  safeArea: "shorts",
  captionFont: "DejaVu Sans",
  captionSize: 54,
  captionPosition: "bottom",
  primaryColor: "#ffffff",
  highlightColor: "#ffd700",
  outline: 3,
  shadow: 2,
  textCase: "original",
  wordsPerBlock: 5,
  animation: "pop",
  removeFillers: true,
  subtitleText: "",
};

function number(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}
function color(value: unknown, fallback: string) { return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback; }
function choice<T extends string>(value: unknown, allowed: readonly T[], fallback: T) { return allowed.includes(value as T) ? value as T : fallback; }

export function normalizeRenderOptions(value: unknown): RenderOptions {
  let input: Record<string, unknown> = {};
  if (typeof value === "string") { try { input = JSON.parse(value); } catch { input = {}; } }
  else if (value && typeof value === "object") input = value as Record<string, unknown>;
  return {
    manualPosition: number(input.manualPosition, 0, -1, 1),
    blurStrength: number(input.blurStrength, 20, 0, 50),
    safeArea: choice(input.safeArea, ["shorts", "reels", "tiktok"], "shorts"),
    captionFont: choice(input.captionFont, ["DejaVu Sans", "DejaVu Serif", "Liberation Sans", "Liberation Serif", "Montserrat"], "DejaVu Sans"),
    captionSize: number(input.captionSize, 54, 28, 96),
    captionPosition: choice(input.captionPosition, ["top", "middle", "bottom"], "bottom"),
    primaryColor: color(input.primaryColor, "#ffffff"),
    highlightColor: color(input.highlightColor, "#ffd700"),
    outline: number(input.outline, 3, 0, 8),
    shadow: number(input.shadow, 2, 0, 8),
    textCase: choice(input.textCase, ["original", "upper", "lower"], "original"),
    wordsPerBlock: Math.round(number(input.wordsPerBlock, 5, 1, 10)),
    animation: choice(input.animation, ["none", "pop", "fade", "bounce"], "pop"),
    removeFillers: input.removeFillers !== false,
    subtitleText: typeof input.subtitleText === "string" ? input.subtitleText.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120) : "",
  };
}
