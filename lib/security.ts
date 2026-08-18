const encoder = new TextEncoder();
const PASSWORD_ITERATIONS = 240_000;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string) {
  if (!/^[a-f0-9]+$/i.test(value) || value.length % 2) return new Uint8Array();
  return new Uint8Array(value.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) || []);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export function randomToken(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return bytesToHex(data);
}

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return bytesToHex(new Uint8Array(digest));
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const digest = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(digest)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, iterationsText, saltHex, digestHex] = stored.split("$");
  if (algorithm !== "pbkdf2-sha256") return false;
  const iterations = Number(iterationsText);
  if (!Number.isSafeInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) return false;
  const salt = hexToBytes(saltHex);
  const expected = hexToBytes(digestHex);
  if (!salt.length || !expected.length) return false;
  const actual = await derivePassword(password, salt, iterations);
  return constantTimeEqual(actual, expected);
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value) && value.length <= 190;
}

export function validPassword(value: string) {
  return value.length >= 10 && value.length <= 160 && /[A-Za-z]/.test(value) && /\d/.test(value);
}
