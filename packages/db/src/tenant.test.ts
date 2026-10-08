/**
 * Isolamento multi-tenant (secção 12 do plano): tentar ler ou escrever dados de outro
 * restaurante dentro de `withTenant` TEM de falhar. Precisa do banco com seed (pnpm setup).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, withTenant } from "./index";

let demoId = "";
let auroraId = "";

beforeAll(async () => {
  const [demo, aurora] = await Promise.all([
    prisma.restaurant.findUnique({ where: { slug: "demo" } }),
    prisma.restaurant.findUnique({ where: { slug: "aurora" } }),
  ]);
  if (!demo || !aurora) throw new Error("Rode `pnpm setup` (seed) antes dos testes de banco.");
  demoId = demo.id;
  auroraId = aurora.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("seed", () => {
  it("tem 1 restaurante demo com 10 mesas, 30 pratos e 3 funcionários", async () => {
    const [tables, items, staff] = await Promise.all([
      prisma.table.count({ where: { restaurantId: demoId } }),
      prisma.menuItem.count({ where: { restaurantId: demoId } }),
      prisma.staff.count({ where: { restaurantId: demoId } }),
    ]);
    expect({ tables, items, staff }).toEqual({ tables: 10, items: 30, staff: 3 });
  });
});

describe("Row Level Security", () => {
  it("só vê as linhas do próprio restaurante, mesmo sem filtro no código", async () => {
    const tables = await withTenant(demoId, (tx) => tx.table.findMany());
    expect(tables).toHaveLength(10);
    expect(tables.every((t) => t.restaurantId === demoId)).toBe(true);

    const restaurants = await withTenant(demoId, (tx) => tx.restaurant.findMany());
    expect(restaurants.map((r) => r.id)).toEqual([demoId]);
  });

  it("não encontra um registo de outro restaurante pelo id", async () => {
    const auroraTable = await prisma.table.findFirstOrThrow({ where: { restaurantId: auroraId } });
    const leaked = await withTenant(demoId, (tx) => tx.table.findUnique({ where: { id: auroraTable.id } }));
    expect(leaked).toBeNull();
  });

  it("não deixa alterar dados de outro restaurante", async () => {
    const auroraItem = await prisma.menuItem.findFirstOrThrow({ where: { restaurantId: auroraId } });
    const result = await withTenant(demoId, (tx) =>
      tx.menuItem.updateMany({ where: { id: auroraItem.id }, data: { soldOut: true } }),
    );
    expect(result.count).toBe(0);
    const after = await prisma.menuItem.findUniqueOrThrow({ where: { id: auroraItem.id } });
    expect(after.soldOut).toBe(auroraItem.soldOut);
  });

  it("não deixa inserir linhas com o id de outro restaurante", async () => {
    await expect(
      withTenant(demoId, (tx) =>
        tx.table.create({ data: { restaurantId: auroraId, number: 999, qrToken: "rls-test-token-0000000" } }),
      ),
    ).rejects.toThrow();
    expect(await prisma.table.count({ where: { number: 999 } })).toBe(0);
  });

  it("não vê dados globais da plataforma (contas SaaS)", async () => {
    const admins = await withTenant(demoId, (tx) => tx.saasUser.findMany());
    expect(admins).toHaveLength(0);
  });

  it("sem contexto de restaurante não vê nada", async () => {
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE mesapay_app");
      return tx.table.findMany();
    });
    expect(rows).toHaveLength(0);
  });
});
