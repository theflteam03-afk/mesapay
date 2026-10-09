/**
 * Serviços do app da mesa contra o banco real (seed). Usa a mesa 10 do restaurante demo
 * e apaga as comandas criadas no fim.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../index";
import {
  createGuestOrder,
  findTableByToken,
  getBill,
  getOrOpenSession,
  joinTable,
  loadMenu,
  ServiceError,
  type TableByToken,
} from "./table";

let table: TableByToken;
let picanhaId = "";
let pontoMal = "";
let baconId = "";
let cervejaId = "";
let pudimId = "";

async function cleanTable(tableId: string) {
  const sessions = await prisma.tableSession.findMany({ where: { tableId }, select: { id: true } });
  const ids = sessions.map((s) => s.id);
  await prisma.printJob.deleteMany({ where: { order: { sessionId: { in: ids } } } });
  await prisma.orderItem.deleteMany({ where: { order: { sessionId: { in: ids } } } });
  await prisma.order.deleteMany({ where: { sessionId: { in: ids } } });
  await prisma.guest.deleteMany({ where: { sessionId: { in: ids } } });
  await prisma.tableSession.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(async () => {
  const t = await prisma.table.findFirstOrThrow({ where: { restaurant: { slug: "demo" }, number: 10 } });
  table = (await findTableByToken(t.qrToken))!;
  const items = await prisma.menuItem.findMany({
    where: { restaurantId: table.restaurant.id },
    include: { optionGroups: { include: { options: true } } },
  });
  const picanha = items.find((i) => i.optionGroups.some((g) => g.minSelect === 1))!;
  picanhaId = picanha.id;
  pontoMal = picanha.optionGroups.find((g) => g.minSelect === 1)!.options[0]!.id;
  const withExtras = items.find((i) => i.optionGroups.some((g) => g.options.some((o) => o.name === "Bacon")))!;
  baconId = withExtras.optionGroups.flatMap((g) => g.options).find((o) => o.name === "Bacon")!.id;
  cervejaId = items.find((i) => i.station === "BAR" && i.optionGroups.length === 0 && !i.soldOut)!.id;
  pudimId = items.find((i) => i.soldOut)!.id;
});

beforeEach(() => cleanTable(table.id));
afterAll(async () => {
  await cleanTable(table.id);
  await prisma.$disconnect();
});

const device = () => randomUUID();

describe("menu", () => {
  it("traz categorias, opções e esgotados, traduzidos", async () => {
    const pt = await loadMenu(table.restaurant.id, "pt-BR");
    const en = await loadMenu(table.restaurant.id, "en");
    expect(pt.flatMap((c) => c.items)).toHaveLength(30);
    expect(pt.flatMap((c) => c.items).find((i) => i.id === pudimId)?.soldOut).toBe(true);
    expect(pt.flatMap((c) => c.items).find((i) => i.id === picanhaId)?.optionGroups.length).toBeGreaterThan(0);
    expect(en[0]?.name).not.toBe(pt[0]?.name);
  });
});

describe("entrar na mesa", () => {
  it("o primeiro celular abre a comanda; os seguintes entram nela; nomes repetidos ganham número", async () => {
    const d1 = device();
    const a = await joinTable(table, { deviceId: d1, name: "Ana" });
    const b = await joinTable(table, { deviceId: device(), name: "  ana " });
    const c = await joinTable(table, { deviceId: device(), name: "Caio" });
    expect(b.sessionId).toBe(a.sessionId);
    expect(c.sessionId).toBe(a.sessionId);
    expect([a.displayName, b.displayName, c.displayName]).toEqual(["Ana", "ana (2)", "Caio"]);

    // Reabrir no mesmo celular reaproveita a pessoa (não pede nome de novo nem duplica).
    const again = await joinTable(table, { deviceId: d1, name: "Ana" });
    expect(again).toEqual(a);
    expect(await prisma.guest.count({ where: { sessionId: a.sessionId } })).toBe(3);

    // Trocar o nome no mesmo celular.
    const renamed = await joinTable(table, { deviceId: d1, name: "Ana Paula" });
    expect(renamed).toMatchObject({ guestId: a.guestId, displayName: "Ana Paula" });
  });

  it("vários celulares ao mesmo tempo abrem UMA só comanda", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => getOrOpenSession(table.restaurant.id, table.id)));
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
  });

  it("recusa nome vazio e deviceId inválido", async () => {
    await expect(joinTable(table, { deviceId: device(), name: "   " })).rejects.toMatchObject({ code: "INVALID_NAME" });
    await expect(joinTable(table, { deviceId: "x", name: "Ana" })).rejects.toMatchObject({ code: "INVALID_DEVICE" });
  });
});

describe("pedido e conta", () => {
  it("cria o pedido com preço do servidor e todos na mesa veem a conta agrupada", async () => {
    const dAna = device();
    const dBia = device();
    const ana = await joinTable(table, { deviceId: dAna, name: "Ana" });
    await joinTable(table, { deviceId: dBia, name: "Bia" });

    const before = (await prisma.restaurant.findUniqueOrThrow({ where: { id: table.restaurant.id } })).nextOrderNumber;
    const order = await createGuestOrder(table.restaurant.id, ana.sessionId, {
      deviceId: dAna,
      clientRef: randomUUID(),
      lines: [
        { menuItemId: picanhaId, quantity: 2, optionIds: [pontoMal], note: "sem cebola" },
        { menuItemId: cervejaId, quantity: 1 },
      ],
    });
    expect(order).toMatchObject({ number: before, status: "SENT", duplicate: false });

    const items = await prisma.orderItem.findMany({ where: { orderId: order.orderId } });
    const picanha = await prisma.menuItem.findUniqueOrThrow({ where: { id: picanhaId } });
    const cerveja = await prisma.menuItem.findUniqueOrThrow({ where: { id: cervejaId } });
    expect(items.find((i) => i.menuItemId === picanhaId)).toMatchObject({ unitPriceCents: picanha.priceCents, quantity: 2, note: "sem cebola", station: "KITCHEN" });
    expect(items.find((i) => i.menuItemId === cervejaId)).toMatchObject({ station: "BAR" });

    // A Bia vê o pedido da Ana na conta da mesa.
    const bill = await getBill(table.restaurant.id, ana.sessionId, dBia);
    const subtotal = 2 * picanha.priceCents + cerveja.priceCents;
    expect(bill).toMatchObject({
      status: "OPEN",
      tableNumber: 10,
      subtotalCents: subtotal,
      serviceFeeCents: Math.floor((subtotal * 10 + 50) / 100),
      paidCents: 0,
      me: { name: "Bia" },
    });
    expect(bill.totalCents).toBe(bill.subtotalCents + bill.serviceFeeCents);
    expect(bill.groups).toHaveLength(1);
    expect(bill.groups[0]).toMatchObject({ name: "Ana", isMe: false, subtotalCents: subtotal });
    expect(bill.groups[0]?.items.find((i) => i.quantity === 2)?.options).toEqual(["Mal passada"]);
    expect(bill.orders[0]).toMatchObject({ byName: "Ana", status: "SENT", channel: "QR", itemCount: 3 });

    // Totais gravados na comanda batem com a conta.
    const session = await prisma.tableSession.findUniqueOrThrow({ where: { id: ana.sessionId } });
    expect(session.total).toBe(bill.totalCents);
  });

  it("reenviar o mesmo carrinho não duplica o pedido", async () => {
    const d = device();
    const j = await joinTable(table, { deviceId: d, name: "Ana" });
    const input = { deviceId: d, clientRef: randomUUID(), lines: [{ menuItemId: cervejaId, quantity: 1 }] };
    const [a, b] = await Promise.all([createGuestOrder(table.restaurant.id, j.sessionId, input), createGuestOrder(table.restaurant.id, j.sessionId, input)]);
    expect(a.orderId).toBe(b.orderId);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    expect(await prisma.order.count({ where: { sessionId: j.sessionId } })).toBe(1);
  });

  it("recusa item esgotado, opção obrigatória em falta e quem não está na mesa", async () => {
    const d = device();
    const j = await joinTable(table, { deviceId: d, name: "Ana" });
    const order = (lines: { menuItemId: string; quantity: number; optionIds?: string[] }[], deviceId = d) =>
      createGuestOrder(table.restaurant.id, j.sessionId, { deviceId, clientRef: randomUUID(), lines });

    await expect(order([{ menuItemId: pudimId, quantity: 1 }])).rejects.toMatchObject({ code: "SOLD_OUT", status: 409 });
    await expect(order([{ menuItemId: picanhaId, quantity: 1 }])).rejects.toMatchObject({ code: "OPTION_MIN" });
    await expect(order([{ menuItemId: cervejaId, quantity: 1, optionIds: [baconId] }])).rejects.toMatchObject({ code: "INVALID_OPTION" });
    await expect(order([{ menuItemId: cervejaId, quantity: 31 }])).rejects.toBeInstanceOf(ServiceError);
    await expect(order([{ menuItemId: cervejaId, quantity: 1 }], device())).rejects.toMatchObject({ code: "NOT_A_GUEST", status: 403 });
    await expect(getBill(table.restaurant.id, j.sessionId, device())).rejects.toMatchObject({ code: "NOT_A_GUEST" });
  });

  it("comanda encerrada: não aceita pedidos e o próximo scan abre uma nova", async () => {
    const d = device();
    const j = await joinTable(table, { deviceId: d, name: "Ana" });
    await prisma.tableSession.update({ where: { id: j.sessionId }, data: { status: "CLOSED", closedAt: new Date() } });

    await expect(
      createGuestOrder(table.restaurant.id, j.sessionId, { deviceId: d, clientRef: randomUUID(), lines: [{ menuItemId: cervejaId, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: "SESSION_CLOSED" });
    expect((await getBill(table.restaurant.id, j.sessionId, d)).status).toBe("CLOSED");

    const next = await joinTable(table, { deviceId: d, name: "Ana" });
    expect(next.sessionId).not.toBe(j.sessionId);
  });

  it("pedido do QR fica a aguardar aprovação quando o restaurante exige", async () => {
    await prisma.restaurant.update({ where: { id: table.restaurant.id }, data: { requireQrApproval: true } });
    try {
      const d = device();
      const j = await joinTable(table, { deviceId: d, name: "Ana" });
      const o = await createGuestOrder(table.restaurant.id, j.sessionId, { deviceId: d, clientRef: randomUUID(), lines: [{ menuItemId: cervejaId, quantity: 1 }] });
      expect(o.status).toBe("PENDING_APPROVAL");
    } finally {
      await prisma.restaurant.update({ where: { id: table.restaurant.id }, data: { requireQrApproval: false } });
    }
  });
});
