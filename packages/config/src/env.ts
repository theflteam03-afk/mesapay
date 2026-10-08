/**
 * Leitura centralizada e validada de variáveis de ambiente do servidor.
 * Falha cedo, com mensagem clara, se uma variável obrigatória estiver em falta.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(
      `Variável de ambiente ${name} não definida. Copie .env.example para .env e preencha-a.`,
    );
  }
  return value;
}

export function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

export const appUrls = {
  web: () => optionalEnv("NEXT_PUBLIC_WEB_URL", "http://localhost:3000"),
  dashboard: () => optionalEnv("NEXT_PUBLIC_DASHBOARD_URL", "http://localhost:3001"),
  admin: () => optionalEnv("NEXT_PUBLIC_ADMIN_URL", "http://localhost:3002"),
};
