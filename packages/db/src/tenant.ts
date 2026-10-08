import type { Prisma } from "./generated/prisma/client";
import { prisma } from "./index";

export type TenantTx = Prisma.TransactionClient;

/**
 * Executa `fn` numa transação limitada a um restaurante pelo Row Level Security do Postgres.
 * Mesmo que uma consulta esqueça o filtro `restaurantId`, o banco só devolve/aceita linhas
 * desse restaurante (defesa em profundidade além das verificações no código).
 */
export async function withTenant<T>(
  restaurantId: string,
  fn: (tx: TenantTx) => Promise<T>,
  options?: { timeoutMs?: number },
): Promise<T> {
  if (!restaurantId) throw new Error("withTenant: restaurantId obrigatório");
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.restaurant_id', ${restaurantId}, true)`;
      await tx.$executeRawUnsafe("SET LOCAL ROLE mesapay_app");
      return fn(tx);
    },
    { timeout: options?.timeoutMs ?? 10_000 },
  );
}
