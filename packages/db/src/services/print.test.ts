/**
 * Fila de impressão contra o banco real (seed). Usa a mesa 9 do restaurante demo e as
 * impressoras "Cozinha" (KITCHEN) e "Bar" (BAR) do seed.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../index";
import {
  authenticatePrinter,
  claimNextJob,
  completeJob,
  getKitchenBoard,
  MAX_PRINT_ATTEMPTS,
  reprintOrder,
  retryFailedJobs,
  setOrderStatus,
  type PrinterIdentity,
} from "./print";
import { createGuestOrder, findTableByToken, joinTable, type TableByToken } from "./table";

let table: TableByToken;
let rid = "";
let kitchen: PrinterIdentity;
let bar: PrinterIdentity;
let picanha = { id: "", ponto: "" };
let chopp = "";

async function clean() {
  const sessions = await prisma.tableSession.findMany({ where: { tableId: table.id }, select: { id: true } });
  const ids = sessions.map((s) => s.id);
  await prisma.printJob.deleteMany({ where: { order: { sessionId: { in: ids } } } });
  await prisma.orderItem.deleteMany({ where: { order: { sessionId: { in: ids } } } });
  await prisma.order.deleteMany({ where: { sessionId: { in: ids } } });
  await prisma.guest.deleteMany({ where: { sessionId: { in: ids } } });
  await prisma.tableSession.deleteMany({ where: { id: { in: ids } } });
  // Outros testes/E2E podem ter deixado tickets: este ficheiro só olha para os seus.
  await prisma.printJob.deleteMany({ where: { restaurantId: rid, status: { in: ["PENDING", "SENT", "FAILED"] } } });
  await prisma.printer.updateMany({ where: { restaurantId: rid, name: { in: ["Cozinha", "Bar"] } }, data: { active: true, lastSeenAt: null, lastError: null } });
  await prisma.restaurant.update({ where: { id: rid }, data: { requireQrApproval: false } });
}

async function order(lines: { menuItemId: string; quantity: number; optionIds?: string[] }[], name = "Ana") {
  const deviceId = randomUUID();
  const j = await joinTable(table, { deviceId, name });
  const o = await createGuestOrder(rid, j.sessionId, { deviceId, clientRef: randomUUID(), lines });
  return { ...o, sessionId: j.sessionId };
}

beforeAll(async () => {
  const t = await prisma.table.findFirstOrThrow({ where: { restaurant: { slug: "demo" }, number: 9 } });
  table = (await findTableByToken(t.qrToken))!;
  rid = table.restaurant.id;
  const printers = await prisma.printer.findMany({ where: { restaurantId: rid } });
  const k = printers.find((p) => p.name === "Cozinha");
  const b = printers.find((p) => p.name === "Bar");
  if (!k || !b) throw new Error("Rode o seed (impressoras Cozinha e Bar).");
  kitchen = (await authenticatePrinter(k.printerKey))!;
  bar = (await authenticatePrinter(b.printerKey))!;
  const item = await prisma.menuItem.findFirstOrThrow({
    where: { restaurantId: rid, name: "Picanha na chapa" },
    include: { optionGroups: { include: { options: true } } },
  });
  picanha = { id: item.id, ponto: item.optionGroups[0]!.options[0]!.id };
  chopp = (await prisma.menuItem.findFirstOrThrow({ where: { restaurantId: rid, name: "Chopp pilsen" } })).id;
});
beforeEach(clean);
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe("tickets do pedido", () => {
  it("pratos vão para a cozinha e bebidas para o bar, com nome, mesa e itens", async () => {
    const o = await order([
      { menuItemId: picanha.id, quantity: 2, optionIds: [picanha.ponto] },
      { menuItemId: chopp, quantity: 3 },
    ]);
    const jobs = await prisma.printJob.findMany({ where: { orderId: o.orderId }, include: { printer: true } });
    expect(jobs).toHaveLength(2);
    const k = jobs.find((j) => j.printer.name === "Cozinha")!.payload;
    const b = jobs.find((j) => j.printer.name === "Bar")!.payload;
    expect(k).toContain("COZINHA  ·  MESA 9");
    expect(k).toMatch(/Cliente: Ana\s+\(QR\)/);
    expect(k).toContain(`Pedido #${String(o.number).padStart(4, "0")}`);
    expect(k).toContain("2x  Picanha na chapa\n    > Ponto da carne: Mal passada");
    expect(k).not.toContain("Chopp");
    expect(b).toContain("BAR  ·  MESA 9");
    expect(b).toContain("3x  Chopp pilsen");
    expect(b).not.toContain("Picanha");
  });

  it("sem impressora do bar, as bebidas saem na da cozinha (nada se perde)", async () => {
    await prisma.printer.update({ where: { id: bar.id }, data: { active: false } });
    const o = await order([
      { menuItemId: picanha.id, quantity: 1, optionIds: [picanha.ponto] },
      { menuItemId: chopp, quantity: 1 },
    ]);
    const jobs = await prisma.printJob.findMany({ where: { orderId: o.orderId } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.payload).toContain("COZINHA E BAR  ·  MESA 9");
    expect(jobs[0]!.payload).toContain("Chopp pilsen");
  });

  it("pedido à espera de aprovação só imprime depois de aceite; recusado sai da conta", async () => {
    await prisma.restaurant.update({ where: { id: rid }, data: { requireQrApproval: true } });
    const a = await order([{ menuItemId: chopp, quantity: 1 }]);
    expect(a.status).toBe("PENDING_APPROVAL");
    expect(await prisma.printJob.count({ where: { orderId: a.orderId } })).toBe(0);
    await setOrderStatus(rid, a.orderId, "SENT");
    expect(await prisma.printJob.count({ where: { orderId: a.orderId } })).toBe(1);

    const b = await order([{ menuItemId: chopp, quantity: 2 }], "Bia");
    const before = await prisma.tableSession.findUniqueOrThrow({ where: { id: b.sessionId } });
    await setOrderStatus(rid, b.orderId, "CANCELLED");
    const after = await prisma.tableSession.findUniqueOrThrow({ where: { id: b.sessionId } });
    expect(after.total).toBeLessThan(before.total);
    expect(await prisma.orderItem.count({ where: { orderId: b.orderId, cancelled: false } })).toBe(0);
    await expect(setOrderStatus(rid, b.orderId, "PREPARING")).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
});

describe("entrega à impressora", () => {
  it("um ticket nunca é entregue duas vezes, mesmo com pedidos simultâneos", async () => {
    await order([{ menuItemId: chopp, quantity: 1 }]);
    const results = await Promise.all(Array.from({ length: 5 }, () => claimNextJob(bar)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("impresso → pedido PRINTED; o painel vê a impressora online", async () => {
    const o = await order([
      { menuItemId: picanha.id, quantity: 1, optionIds: [picanha.ponto] },
      { menuItemId: chopp, quantity: 1 },
    ]);
    const k = await claimNextJob(kitchen);
    expect(k?.payload).toContain("Picanha");
    expect(await completeJob(kitchen, k!.id, { ok: true })).toEqual({ found: true, status: "PRINTED" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } })).status).toBe("SENT"); // falta o bar

    const b = await claimNextJob(bar);
    await completeJob(bar, b!.id, { ok: true });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } })).status).toBe("PRINTED");

    await authenticatePrinter((await prisma.printer.findUniqueOrThrow({ where: { id: kitchen.id } })).printerKey);
    const board = await getKitchenBoard(rid);
    expect(board.printers.find((p) => p.id === kitchen.id)).toMatchObject({ online: true, pendingJobs: 0 });
    expect(board.orders.find((x) => x.id === o.orderId)).toMatchObject({ status: "PRINTED", tableNumber: 9, byName: "Ana", print: { printed: 2, total: 2 } });
  });

  it("falha volta para a fila; à 5.ª tentativa fica FAILED e pode ser reenviado", async () => {
    await order([{ menuItemId: chopp, quantity: 1 }]);
    for (let i = 1; i <= MAX_PRINT_ATTEMPTS; i++) {
      const job = await claimNextJob(bar);
      expect(job?.attempt).toBe(i);
      const r = await completeJob(bar, job!.id, { ok: false, error: "Sem papel" });
      expect(r.status).toBe(i < MAX_PRINT_ATTEMPTS ? "PENDING" : "FAILED");
    }
    expect(await claimNextJob(bar)).toBeNull();
    const board = await getKitchenBoard(rid);
    expect(board.printers.find((p) => p.id === bar.id)).toMatchObject({ failedJobs: 1, lastError: "Sem papel" });
    expect(await retryFailedJobs(rid, bar.id)).toBe(1);
    expect(await claimNextJob(bar)).not.toBeNull();
  });

  it("ticket entregue sem confirmação em 30 s volta para a fila", async () => {
    await order([{ menuItemId: chopp, quantity: 1 }]);
    const first = await claimNextJob(bar);
    await prisma.printJob.update({ where: { id: first!.id }, data: { sentAt: new Date(Date.now() - 31_000) } });
    const again = await claimNextJob(bar);
    expect(again?.id).toBe(first!.id);
    expect(again?.attempt).toBe(2);
  });

  it("reimprimir cria um ticket marcado como reimpressão", async () => {
    const o = await order([{ menuItemId: chopp, quantity: 1 }]);
    await reprintOrder(rid, o.orderId);
    const reprints = await prisma.printJob.findMany({ where: { orderId: o.orderId, reprint: true } });
    expect(reprints).toHaveLength(1);
    expect(reprints[0]!.payload).toContain("REIMPRESSÃO");
  });

  it("uma impressora de outro restaurante não consegue buscar tickets daqui (RLS)", async () => {
    const o = await order([{ menuItemId: chopp, quantity: 1 }]);
    const job = await prisma.printJob.findFirstOrThrow({ where: { orderId: o.orderId } });
    const auroraPrinter = await prisma.printer.findFirstOrThrow({ where: { restaurant: { slug: "aurora" } } });
    const intruder = (await authenticatePrinter(auroraPrinter.printerKey))!;
    expect(await claimNextJob({ ...intruder, id: bar.id }, { jobId: job.id })).toBeNull();
    expect(await authenticatePrinter("chave-que-nao-existe-0000000000000")).toBeNull();
  });
});
