import { runtimeValue } from "./database";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const secret = runtimeValue("STORMCAST_SECRETS_KEY");
  if (secret.length < 32) {
    throw new Error(
      "Configure STORMCAST_SECRETS_KEY com uma chave aleatória de pelo menos 32 caracteres antes de salvar chaves de API.",
    );
  }
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export function secretsConfigured() {
  return runtimeValue("STORMCAST_SECRETS_KEY").length >= 32;
}

export async function encryptSecret(value: string) {
  const clean = value.trim();
  if (!clean) throw new Error("A chave de API está vazia.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    encoder.encode(clean),
  );
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(envelope: string) {
  const [version, ivText, encryptedText] = envelope.split(".");
  if (version !== "v1" || !ivText || !encryptedText) {
    throw new Error("A chave de API armazenada possui formato inválido.");
  }
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(ivText) },
      await encryptionKey(),
      fromBase64(encryptedText),
    );
    return decoder.decode(decrypted);
  } catch {
    throw new Error(
      "Não foi possível descriptografar a chave de API. Verifique STORMCAST_SECRETS_KEY.",
    );
  }
}

export function secretHint(value: string) {
  const clean = value.trim();
  if (clean.length < 8) return "••••";
  return `${clean.slice(0, 3)}••••${clean.slice(-4)}`;
}
