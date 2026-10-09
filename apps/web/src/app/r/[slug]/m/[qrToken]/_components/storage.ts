/**
 * Memória do navegador (localStorage), sempre protegida: em modo privado ou com
 * armazenamento bloqueado o app continua a funcionar, só não se lembra.
 *
 * - mp_device: UUID deste navegador (também vai num cookie httpOnly pelo servidor).
 * - mp_name:   nome digitado uma vez; vale para todos os restaurantes MesaPay.
 * - mp_cart:{token}: carrinho ainda não enviado desta mesa.
 */
export function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStore(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* sem armazenamento: segue sem lembrar */
  }
}

export function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("").replace(/^(.{8})(.{4})(.{4})(.{4})/, "$1-$2-$3-$4-");
}

export function getDeviceId(): string {
  const existing = readStore("mp_device");
  if (existing && /^[A-Za-z0-9-]{16,64}$/.test(existing)) return existing;
  const id = randomId();
  writeStore("mp_device", id);
  return id;
}
