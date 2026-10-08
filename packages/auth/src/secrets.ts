/**
 * Segredos com fallback SÓ para desenvolvimento. Em produção a ausência é um erro fatal.
 * (Edge-safe: não importa módulos do Node.)
 */
const DEV_FALLBACKS: Record<string, string> = {
  AUTH_SECRET: "dev-only-auth-secret-troque-em-producao-0123456789",
  PIN_PEPPER: "dev-only-pin-pepper-troque-em-producao-0123456789",
};

export function getSecret(name: "AUTH_SECRET" | "PIN_PEPPER"): string {
  const value = process.env[name];
  if (value && value.length > 0) {
    if (value.length < 32) throw new Error(`${name} precisa de pelo menos 32 caracteres`);
    return value;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} não definido. Gere com: openssl rand -base64 32`);
  }
  return DEV_FALLBACKS[name] as string;
}
