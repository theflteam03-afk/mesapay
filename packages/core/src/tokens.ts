/**
 * Tokens aleatórios seguros (funciona em Node e no navegador via Web Crypto).
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // sem 0/O/1/l/I

export function randomToken(length = 20): string {
  if (length < 16) throw new RangeError("tokens de QR precisam de 16+ caracteres");
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** Token do QR da mesa: aleatório, nunca derivado do número da mesa. */
export function generateQrToken(): string {
  return randomToken(20);
}

/** PIN numérico aleatório de 4–6 dígitos (para "gerar PIN" no cadastro do funcionário). */
export function generatePin(digits = 4): string {
  if (!Number.isInteger(digits) || digits < 4 || digits > 6) throw new RangeError("PIN deve ter 4 a 6 dígitos");
  const bytes = new Uint32Array(digits);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => String(b % 10)).join("");
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}
