import { computeTotals, randomToken } from "@mesapay/core";
import { renderTicket, type TicketItem, type TicketStation } from "@mesapay/print";
import { publish } from "@mesapay/realtime/events";
import { prisma } from "../index";
import { withTenant, type TenantTx } from "../tenant";
import { ServiceError } from "./errors";

/**
 * Fila de impressão (secção 7 do plano).
 *
 *   pedido criado ──► PrintJob PENDING (um por impressora; pratos → cozinha, bebidas → bar)
 *   impressora/agente/navegador pede trabalho ──► SENT (tentativa +1)
 *   confirma ──► PRINTED        falha ou não confirma em 30 s ──► PENDING de novo
 *   5.ª tentativa falhada ──► FAILED (alerta no painel + botão Reimprimir)
 *
 * Quando todos os tickets de um pedido saem, o pedido passa de SENT a PRINTED.
 */

export const MAX_PRINT_ATTEMPTS = 5;
/** Sem confirmação neste prazo, o ticket volta para a fila (impressora desligou a meio). */
export const PRINT_ACK_TIMEOUT_MS = 30_000;
/** Impressora sem consultar a fila há mais do que isto = offline (alerta vermelho no painel). */
export const PRINTER_OFFLINE_AFTER_MS = 30_000;

export const PRINTER_KEY_RE = /^[A-Za-z0-9]{24,64}$/;

export function generatePrinterKey(): string {
  return randomToken(32);
}

type ItemForTicket = TicketItem & { station: "KITCHEN" | "BAR" };

interface OptionSnapshot {
  group?: unknown;
  name?: unknown;
}

function ticketOptions(json: unknown): { group: string; name: string }[] {
  if (!Array.isArray(json)) return [];
  return (json as OptionSnapshot[])
    .filter((o) => o && typeof o.name === "string")
    .map((o) => ({ group: typeof o.group === "string" ? o.group : "", name: o.name as string }));
}

/**
 * Cria os tickets de um pedido, já formatados na largura de cada impressora.
 * Cada estação vai para as impressoras dessa estação; se não houver (ex.: plano Start com
 * uma só impressora), vai para as outras, para nada se perder.
 * Devolve quantos tickets foram criados (0 = restaurante sem impressora: fica só no KDS).
 */
export async function createPrintJobs(tx: TenantTx, orderId: string, opts: { reprint?: boolean } = {}): Promise<number> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      id: true,
      restaurantId: true,
      number: true,
      note: true,
      createdAt: true,
      channel: true,
      guestId: true,
      staff: { select: { name: true } },
      table: { select: { number: true } },
      restaurant: { select: { timezone: true } },
      items: {
        where: { cancelled: false },
        orderBy: { id: "asc" },
        select: { nameSnapshot: true, quantity: true, station: true, optionsJson: true, note: true },
      },
    },
  });
  if (order.items.length === 0) return 0;
  const printers = await tx.printer.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
  if (printers.length === 0) return 0;

  const guestName = order.guestId
    ? ((await tx.guest.findUnique({ where: { id: order.guestId }, select: { name: true } }))?.name ?? "Cliente")
    : null;
  const by = order.channel === "QR" ? { kind: "guest" as const, name: guestName ?? "Cliente" } : { kind: "staff" as const, name: order.staff?.name ?? "Equipe" };

  const items: ItemForTicket[] = order.items.map((i) => ({
    quantity: i.quantity,
    name: i.nameSnapshot,
    options: ticketOptions(i.optionsJson),
    note: i.note,
    station: i.station,
  }));

  // Impressora → itens que ela deve imprimir.
  const routes = new Map<string, { printer: (typeof printers)[number]; items: ItemForTicket[] }>();
  for (const station of ["KITCHEN", "BAR"] as const) {
    const stationItems = items.filter((i) => i.station === station);
    if (!stationItems.length) continue;
    const own = printers.filter((p) => p.station === station);
    const targets = own.length ? own : printers;
    for (const p of targets) {
      const r = routes.get(p.id) ?? { printer: p, items: [] };
      r.items.push(...stationItems);
      routes.set(p.id, r);
    }
  }

  for (const { printer, items: its } of routes.values()) {
    const stations = new Set(its.map((i) => i.station));
    const station: TicketStation = stations.size > 1 ? "ALL" : (its[0]?.station ?? printer.station);
    const payload = renderTicket(
      {
        station,
        tableNumber: order.table.number,
        by,
        createdAt: order.createdAt,
        timezone: order.restaurant.timezone,
        orderNumber: order.number,
        items: its.map(({ station: _s, ...rest }) => rest),
        orderNote: order.note,
        reprint: opts.reprint,
      },
      printer.width,
    );
    await tx.printJob.create({
      data: { restaurantId: order.restaurantId, orderId: order.id, printerId: printer.id, payload, reprint: !!opts.reprint },
    });
  }
  await publish(tx, { type: "print.updated", restaurantId: order.restaurantId });
  return routes.size;
}

// ───────────────────────── Impressora a pedir trabalho ─────────────────────────

export interface PrinterIdentity {
  id: string;
  restaurantId: string;
  name: string;
  type: "BROWSER" | "LOCAL_AGENT" | "CLOUDPRNT" | "EPSON_SDP";
  width: number;
  address: string | null;
}

/** Identifica a impressora pelo segredo `printerKey` e regista que está viva. */
export async function authenticatePrinter(printerKey: string): Promise<PrinterIdentity | null> {
  if (!PRINTER_KEY_RE.test(printerKey)) return null;
  const p = await prisma.printer.findUnique({
    where: { printerKey },
    select: { id: true, restaurantId: true, name: true, type: true, width: true, address: true, active: true, lastSeenAt: true, restaurant: { select: { status: true } } },
  });
  if (!p || !p.active || p.restaurant.status === "DISABLED") return null;
  await touchPrinter(p.restaurantId, p.id, p.lastSeenAt);
  return { id: p.id, restaurantId: p.restaurantId, name: p.name, type: p.type, width: p.width, address: p.address };
}

/** Atualiza lastSeenAt; se a impressora estava offline, avisa o painel (o alerta some na hora). */
export async function touchPrinter(restaurantId: string, printerId: string, previous?: Date | null): Promise<void> {
  const wasOffline = !previous || Date.now() - previous.getTime() > PRINTER_OFFLINE_AFTER_MS;
  await withTenant(restaurantId, async (tx) => {
    await tx.printer.update({ where: { id: printerId }, data: { lastSeenAt: new Date() } });
    if (wasOffline) await publish(tx, { type: "print.updated", restaurantId, printerId });
  });
}

/** Tickets enviados sem confirmação há mais de 30 s voltam para a fila (ou falham na 5.ª vez). */
async function requeueStale(tx: TenantTx, printerId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - PRINT_ACK_TIMEOUT_MS);
  const failed = await tx.printJob.updateMany({
    where: { printerId, status: "SENT", sentAt: { lt: cutoff }, attempts: { gte: MAX_PRINT_ATTEMPTS } },
    data: { status: "FAILED", lastError: "A impressora não confirmou a impressão." },
  });
  await tx.printJob.updateMany({
    where: { printerId, status: "SENT", sentAt: { lt: cutoff } },
    data: { status: "PENDING", lastError: "A impressora não confirmou a impressão." },
  });
  return failed.count > 0;
}

export interface ClaimedJob {
  id: string;
  orderId: string;
  payload: string;
  attempt: number;
}

/**
 * Entrega o ticket mais antigo da fila desta impressora (ou o `jobId` pedido) e marca-o SENT.
 * `FOR UPDATE SKIP LOCKED`: dois pedidos simultâneos da mesma impressora nunca recebem o mesmo ticket.
 */
export async function claimNextJob(printer: PrinterIdentity, opts: { jobId?: string } = {}): Promise<ClaimedJob | null> {
  return withTenant(printer.restaurantId, async (tx) => {
    const newlyFailed = await requeueStale(tx, printer.id);
    const rows = opts.jobId
      ? await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "PrintJob" WHERE "printerId" = ${printer.id} AND id = ${opts.jobId} AND status = 'PENDING'
          FOR UPDATE SKIP LOCKED`
      : await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "PrintJob" WHERE "printerId" = ${printer.id} AND status = 'PENDING'
          ORDER BY "createdAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED`;
    const id = rows[0]?.id;
    if (!id) {
      if (newlyFailed) await publish(tx, { type: "print.updated", restaurantId: printer.restaurantId, printerId: printer.id });
      return null;
    }
    const job = await tx.printJob.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } },
      select: { id: true, orderId: true, payload: true, attempts: true },
    });
    await publish(tx, { type: "print.updated", restaurantId: printer.restaurantId, printerId: printer.id });
    return { id: job.id, orderId: job.orderId, payload: job.payload, attempt: job.attempts };
  });
}

/** Próximo ticket na fila, sem o entregar (CloudPRNT pergunta antes de descarregar). */
export async function peekNextJob(printer: PrinterIdentity): Promise<string | null> {
  return withTenant(printer.restaurantId, async (tx) => {
    await requeueStale(tx, printer.id);
    const job = await tx.printJob.findFirst({
      where: { printerId: printer.id, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    return job?.id ?? null;
  });
}

/**
 * Resultado de um ticket. `jobId` null = o último ticket entregue a esta impressora
 * (impressoras CloudPRNT antigas não devolvem o token).
 */
export async function completeJob(
  printer: PrinterIdentity,
  jobId: string | null,
  result: { ok: true } | { ok: false; error: string },
): Promise<{ found: boolean; status?: "PRINTED" | "PENDING" | "FAILED" }> {
  return withTenant(printer.restaurantId, async (tx) => {
    const job = await tx.printJob.findFirst({
      where: { printerId: printer.id, status: "SENT", ...(jobId ? { id: jobId } : {}) },
      orderBy: { sentAt: "desc" },
      select: { id: true, orderId: true, attempts: true },
    });
    if (!job) return { found: false };

    let status: "PRINTED" | "PENDING" | "FAILED";
    if (result.ok) {
      status = "PRINTED";
      await tx.printJob.update({ where: { id: job.id }, data: { status, printedAt: new Date(), lastError: null } });
      await tx.printer.update({ where: { id: printer.id }, data: { lastError: null } });
      // Todos os tickets do pedido impressos → pedido "PRINTED" (o cliente continua a ver "Enviado").
      const remaining = await tx.printJob.count({ where: { orderId: job.orderId, reprint: false, status: { not: "PRINTED" } } });
      if (remaining === 0) {
        const updated = await tx.order.updateMany({ where: { id: job.orderId, status: "SENT" }, data: { status: "PRINTED" } });
        if (updated.count) {
          const o = await tx.order.findUniqueOrThrow({ where: { id: job.orderId }, select: { sessionId: true } });
          await publish(tx, { type: "order.status", restaurantId: printer.restaurantId, sessionId: o.sessionId, orderId: job.orderId, status: "PRINTED" });
        }
      }
    } else {
      const error = result.error.slice(0, 300);
      status = job.attempts >= MAX_PRINT_ATTEMPTS ? "FAILED" : "PENDING";
      await tx.printJob.update({ where: { id: job.id }, data: { status, lastError: error } });
      await tx.printer.update({ where: { id: printer.id }, data: { lastError: error } });
    }
    await publish(tx, { type: "print.updated", restaurantId: printer.restaurantId, printerId: printer.id });
    return { found: true, status };
  });
}

// ───────────────────────── Painel: KDS e impressoras ─────────────────────────

export type KdsStatus = "PENDING_APPROVAL" | "SENT" | "PRINTED" | "PREPARING" | "READY";

export interface KdsOrder {
  id: string;
  number: number;
  status: KdsStatus;
  channel: "QR" | "STAFF";
  createdAt: string;
  tableNumber: number;
  byName: string;
  note: string | null;
  items: { id: string; quantity: number; name: string; station: "KITCHEN" | "BAR"; options: string[]; note: string | null }[];
  print: { printed: number; pending: number; failed: number; total: number };
}

export interface KdsPrinter {
  id: string;
  name: string;
  station: "KITCHEN" | "BAR";
  type: PrinterIdentity["type"];
  online: boolean;
  lastSeenAt: string | null;
  lastError: string | null;
  pendingJobs: number;
  failedJobs: number;
  /** Ticket mais antigo à espera há mais de 30 s. */
  stuck: boolean;
}

export interface KitchenBoard {
  now: string;
  orders: KdsOrder[];
  printers: KdsPrinter[];
}

/** Tudo o que a tela "Cozinha" precisa: pedidos abertos das últimas 12 h e estado das impressoras. */
export async function getKitchenBoard(restaurantId: string): Promise<KitchenBoard> {
  const since = new Date(Date.now() - 12 * 3600_000);
  return withTenant(restaurantId, async (tx) => {
    // Em série: dentro de uma transação há uma só ligação ao banco (consultas paralelas não ganham nada).
    const orders = await tx.order.findMany({
        where: { createdAt: { gte: since }, status: { in: ["PENDING_APPROVAL", "SENT", "PRINTED", "PREPARING", "READY"] } },
        orderBy: { createdAt: "asc" },
        take: 200,
        select: {
          id: true,
          number: true,
          status: true,
          channel: true,
          createdAt: true,
          note: true,
          guestId: true,
          staff: { select: { name: true } },
          table: { select: { number: true } },
          session: { select: { guests: { select: { id: true, name: true } } } },
          items: {
            where: { cancelled: false },
            orderBy: { id: "asc" },
            select: { id: true, quantity: true, nameSnapshot: true, station: true, optionsJson: true, note: true },
          },
          printJobs: { where: { reprint: false }, select: { status: true } },
        },
      });
    const printers = await tx.printer.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
    const jobCounts = await tx.printJob.groupBy({
      by: ["printerId", "status"],
      where: { status: { in: ["PENDING", "SENT", "FAILED"] }, createdAt: { gte: since } },
      _count: { _all: true },
      _min: { createdAt: true },
    });

    const now = Date.now();
    return {
      now: new Date(now).toISOString(),
      orders: orders.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status as KdsStatus,
        channel: o.channel,
        createdAt: o.createdAt.toISOString(),
        tableNumber: o.table.number,
        byName: o.channel === "QR" ? (o.session.guests.find((g) => g.id === o.guestId)?.name ?? "Cliente") : (o.staff?.name ?? "Equipe"),
        note: o.note,
        items: o.items.map((i) => ({
          id: i.id,
          quantity: i.quantity,
          name: i.nameSnapshot,
          station: i.station,
          options: ticketOptions(i.optionsJson).map((x) => x.name),
          note: i.note,
        })),
        print: {
          printed: o.printJobs.filter((j) => j.status === "PRINTED").length,
          pending: o.printJobs.filter((j) => j.status === "PENDING" || j.status === "SENT").length,
          failed: o.printJobs.filter((j) => j.status === "FAILED").length,
          total: o.printJobs.length,
        },
      })),
      printers: printers.map((p) => {
        const counts = jobCounts.filter((c) => c.printerId === p.id);
        const pending = counts.filter((c) => c.status !== "FAILED").reduce((s, c) => s + c._count._all, 0);
        const oldest = counts
          .filter((c) => c.status !== "FAILED")
          .map((c) => c._min.createdAt?.getTime() ?? now)
          .reduce((a, b) => Math.min(a, b), now);
        return {
          id: p.id,
          name: p.name,
          station: p.station,
          type: p.type,
          online: !!p.lastSeenAt && now - p.lastSeenAt.getTime() <= PRINTER_OFFLINE_AFTER_MS,
          lastSeenAt: p.lastSeenAt?.toISOString() ?? null,
          lastError: p.lastError,
          pendingJobs: pending,
          failedJobs: counts.filter((c) => c.status === "FAILED").reduce((s, c) => s + c._count._all, 0),
          stuck: pending > 0 && now - oldest > PRINTER_OFFLINE_AFTER_MS,
        };
      }),
    };
  });
}

const NEXT_STATUS: Record<string, string[]> = {
  PENDING_APPROVAL: ["SENT", "CANCELLED"],
  SENT: ["PREPARING", "READY", "DELIVERED"],
  PRINTED: ["PREPARING", "READY", "DELIVERED"],
  PREPARING: ["READY", "DELIVERED", "PRINTED"],
  READY: ["DELIVERED", "PREPARING"],
};

export type SettableOrderStatus = "SENT" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED" | "PRINTED";

/**
 * Muda o estado de um pedido a partir da cozinha (KDS). O cliente vê a mudança na conta da mesa.
 *  - PENDING_APPROVAL → SENT: aceite (imprime agora);  → CANCELLED: recusado (sai da conta)
 *  - SENT/PRINTED → PREPARING → READY → DELIVERED
 */
export async function setOrderStatus(restaurantId: string, orderId: string, next: SettableOrderStatus): Promise<void> {
  await withTenant(restaurantId, async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, status: true, sessionId: true } });
    if (!order) throw new ServiceError("INVALID_REQUEST", 404);
    if (!NEXT_STATUS[order.status]?.includes(next)) throw new ServiceError("INVALID_REQUEST", 409);

    await tx.order.update({ where: { id: orderId }, data: { status: next } });
    if (order.status === "PENDING_APPROVAL" && next === "SENT") {
      await createPrintJobs(tx, orderId);
    }
    if (next === "CANCELLED") {
      await tx.orderItem.updateMany({ where: { orderId }, data: { cancelled: true } });
      const session = await tx.tableSession.findUniqueOrThrow({
        where: { id: order.sessionId },
        select: { restaurant: { select: { serviceFeePct: true } } },
      });
      const items = await tx.orderItem.findMany({ where: { order: { sessionId: order.sessionId } }, select: { quantity: true, unitPriceCents: true, cancelled: true } });
      const t = computeTotals(items, session.restaurant.serviceFeePct);
      await tx.tableSession.update({ where: { id: order.sessionId }, data: { subtotal: t.subtotal, serviceFee: t.serviceFee, total: t.total } });
    }
    await publish(tx, { type: "order.status", restaurantId, sessionId: order.sessionId, orderId, status: next });
  });
}

/** Botão "Reimprimir": novos tickets marcados como reimpressão. */
export async function reprintOrder(restaurantId: string, orderId: string): Promise<number> {
  return withTenant(restaurantId, async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (!order || order.status === "CANCELLED" || order.status === "PENDING_APPROVAL") throw new ServiceError("INVALID_REQUEST", 409);
    return createPrintJobs(tx, orderId, { reprint: true });
  });
}

/** Tickets que falharam 5 vezes voltam para a fila (ex.: depois de pôr papel). */
export async function retryFailedJobs(restaurantId: string, printerId?: string): Promise<number> {
  return withTenant(restaurantId, async (tx) => {
    const r = await tx.printJob.updateMany({
      where: { status: "FAILED", ...(printerId ? { printerId } : {}) },
      data: { status: "PENDING", attempts: 0, lastError: null },
    });
    if (r.count) await publish(tx, { type: "print.updated", restaurantId, printerId });
    return r.count;
  });
}

// ───────────────────────── Impressoras (configuração) ─────────────────────────

export interface PrinterInput {
  name: string;
  station: "KITCHEN" | "BAR";
  type: PrinterIdentity["type"];
  address?: string | null;
  width?: number;
}

function validatePrinter(input: PrinterInput): PrinterInput {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (!name || name.length > 40) throw new ServiceError("INVALID_REQUEST", 400);
  const width = input.width ?? 48;
  if (![32, 42, 48].includes(width)) throw new ServiceError("INVALID_REQUEST", 400);
  const address = input.address?.trim() || null;
  if (input.type === "LOCAL_AGENT" && (!address || address.length > 200)) throw new ServiceError("INVALID_REQUEST", 400);
  return { ...input, name, width, address: input.type === "LOCAL_AGENT" ? address : null };
}

export async function createPrinter(restaurantId: string, input: PrinterInput) {
  const v = validatePrinter(input);
  return withTenant(restaurantId, async (tx) => {
    const p = await tx.printer.create({
      data: { restaurantId, name: v.name, station: v.station, type: v.type, address: v.address, width: v.width ?? 48, printerKey: generatePrinterKey() },
    });
    await publish(tx, { type: "print.updated", restaurantId, printerId: p.id });
    return p;
  });
}

export async function updatePrinter(restaurantId: string, printerId: string, input: PrinterInput) {
  const v = validatePrinter(input);
  return withTenant(restaurantId, async (tx) => {
    const r = await tx.printer.updateMany({
      where: { id: printerId, active: true },
      data: { name: v.name, station: v.station, type: v.type, address: v.address, width: v.width },
    });
    if (!r.count) throw new ServiceError("INVALID_REQUEST", 404);
    await publish(tx, { type: "print.updated", restaurantId, printerId });
  });
}

/** Remove a impressora (soft delete): tickets pendentes dela passam a FAILED para reimprimir noutra. */
export async function removePrinter(restaurantId: string, printerId: string) {
  return withTenant(restaurantId, async (tx) => {
    await tx.printer.updateMany({ where: { id: printerId }, data: { active: false } });
    await tx.printJob.updateMany({
      where: { printerId, status: { in: ["PENDING", "SENT"] } },
      data: { status: "FAILED", lastError: "Impressora removida." },
    });
    await publish(tx, { type: "print.updated", restaurantId, printerId });
  });
}

/** Novo segredo: a impressora/agente antigo deixa de conseguir buscar tickets. */
export async function regeneratePrinterKey(restaurantId: string, printerId: string) {
  return withTenant(restaurantId, (tx) =>
    tx.printer.update({ where: { id: printerId }, data: { printerKey: generatePrinterKey() }, select: { printerKey: true } }),
  );
}

export async function listPrinters(restaurantId: string) {
  return withTenant(restaurantId, (tx) => tx.printer.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } }));
}

/** Impressora do tipo "navegador" deste restaurante (o painel aberto imprime por ela). */
export async function getBrowserPrinter(restaurantId: string, printerId: string): Promise<PrinterIdentity | null> {
  const p = await withTenant(restaurantId, (tx) =>
    tx.printer.findFirst({ where: { id: printerId, active: true, type: "BROWSER" }, select: { id: true, restaurantId: true, name: true, type: true, width: true, address: true, lastSeenAt: true } }),
  );
  if (!p) return null;
  await touchPrinter(restaurantId, p.id, p.lastSeenAt);
  return { id: p.id, restaurantId: p.restaurantId, name: p.name, type: p.type, width: p.width, address: p.address };
}
