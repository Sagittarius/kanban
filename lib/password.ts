const ITERATIONS = 210000;
const HASH_LENGTH_BYTES = 32;
const encoder = new TextEncoder();

export async function hashPassword(password: string, saltBytes = randomBytes(16)) {
  const hash = await derivePasswordHash(password, saltBytes, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${base64UrlEncode(saltBytes)}$${base64UrlEncode(hash)}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, iterationsText, saltText, expectedText] = storedHash.split("$");
  const iterations = Number(iterationsText);

  if (algorithm !== "pbkdf2" || !Number.isFinite(iterations) || !saltText || !expectedText) {
    return false;
  }

  const salt = base64UrlDecode(saltText);
  const expected = base64UrlDecode(expectedText);
  const actual = await derivePasswordHash(password, salt, iterations);
  return constantTimeEqual(actual, expected);
}

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    key,
    HASH_LENGTH_BYTES * 8
  );
  return new Uint8Array(bits);
}

function randomBytes(length: number) {
  const value = new Uint8Array(length);
  crypto.getRandomValues(value);
  return value;
}

export function base64UrlEncode(value: Uint8Array) {
  const binary = Array.from(value, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
}
