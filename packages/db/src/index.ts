import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export * from "./generated/prisma/client";

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não definida. Copie .env.example para .env na raiz do projeto.");
  }
  const adapter = new PrismaPg({ connectionString, max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
  return new PrismaClient({
    adapter,
    log: process.env.PRISMA_LOG_QUERIES === "1" ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

// Uma única instância por processo (evita esgotar conexões com o hot reload do Next em dev).
const globalForPrisma = globalThis as unknown as { __mesapayPrisma?: PrismaClient };

/**
 * Cliente "de sistema": liga como dono das tabelas e NÃO é limitado pelo RLS.
 * Use-o só no painel admin SaaS, em jobs e em código que já validou o restaurante.
 * Para tudo o que é feito em nome de um restaurante use `withTenant` (./tenant).
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    globalForPrisma.__mesapayPrisma ??= createClient();
    const value = Reflect.get(globalForPrisma.__mesapayPrisma, prop, receiver);
    return typeof value === "function" ? value.bind(globalForPrisma.__mesapayPrisma) : value;
  },
});

export { withTenant, type TenantTx } from "./tenant";
