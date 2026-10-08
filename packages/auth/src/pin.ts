import { createHmac } from "node:crypto";
import bcrypt from "bcryptjs";
import { getSecret } from "./secrets";

/**
 * PIN dos funcionários:
 *  - pinHash   = bcrypt(PIN)            → verificação lenta, resistente a força bruta offline
 *  - pinLookup = HMAC-SHA256(PIN, pepper) → encontrar o funcionário pelo PIN e garantir
 *                                          unicidade dentro do restaurante
 */
export function pinLookup(pin: string, restaurantId: string): string {
  return createHmac("sha256", getSecret("PIN_PEPPER")).update(`${restaurantId}:${pin}`).digest("hex");
}

export function hashPin(pin: string): Promise<string> {
  if (!/^\d{4,6}$/.test(pin)) throw new Error("O PIN deve ter de 4 a 6 dígitos");
  return bcrypt.hash(pin, 10);
}

export function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}
