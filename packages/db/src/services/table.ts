import {
  computeTotals,
  groupByGuest,
  normalizeGuestName,
  priceCart,
  remaining,
  uniqueDisplayName,
  type CartLineInput,
  type PricingMenuItem,
} from "@mesapay/core";
import { publish } from "@mesapay/realtime/events";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../index";
import { withTenant, type TenantTx } from "../tenant";
import { ServiceError } from "./errors";
import { createPrintJobs } from "./print";
import type {
  BillDTO,
  BillGroupDTO,
  BillItemDTO,
  CreateOrderResultDTO,
  JoinResultDTO,
  MenuCategoryDTO,
  OrderStatusDTO,
} from "./types";

/**
 * Serviços do app da mesa (cliente final, sem login).
 * A identidade do celular é o `deviceId` (UUID guardado no navegador + cookie httpOnly).
 * Tudo o que toca dados do restaurante corre dentro de `withTenant` (RLS).
 */

export { ServiceError } from "./errors";

export const DEVICE_ID_RE = /^[A-Za-z0-9-]{16,64}$/;
export const QR_TOKEN_RE = /^[A-Za-z0-9]{16,64}$/;

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function localized(json: unknown, locale: string, fallback: string): string {
  if (locale === "pt-BR" || !json || typeof json !== "object") return fallback;
  const v = (json as Record<string, unknown>)[locale];
  return typeof v === "string" && v ? v : fallback;
}

// ───────────────────────── Mesa e menu ─────────────────────────

/** Resolve o token do QR (cliente de sistema: ainda não sabemos o restaurante). */
export async function findTableByToken(qrToken: string) {
  if (!QR_TOKEN_RE.test(qrToken)) return null;
  const table = await prisma.table.findUnique({
    where: { qrToken },
    select: {
      id: true,
      number: true,
      label: true,
      active: true,
      restaurant: {
        select: {
          id: true,
          slug: true,
          name: true,
          logoUrl: true,
          theme: true,
          primaryColor: true,
          status: true,
          locales: true,
          serviceFeePct: true,
          requireQrApproval: true,
        },
      },
    },
  });
  if (!table || !table.active) return null;
  return table;
}

export type TableByToken = NonNullable<Awaited<ReturnType<typeof findTableByToken>>>;

/** Menu visível no celular: categorias ativas e não pausadas, itens ativos (esgotados incluídos). */
export async function loadMenu(restaurantId: string, locale: string): Promise<MenuCategoryDTO[]> {
  const categories = await withTenant(restaurantId, (tx) =>
    tx.category.findMany({
      where: { active: true, paused: false },
      orderBy: { position: "asc" },
      select: {
        id: true,
        name: true,
        nameI18n: true,
        items: {
          where: { active: true },
          orderBy: { position: "asc" },
          select: {
            id: true,
            name: true,
            nameI18n: true,
            description: true,
            descriptionI18n: true,
            priceCents: true,
            photoUrl: true,
            soldOut: true,
            optionGroups: {
              orderBy: { position: "asc" },
              select: {
                id: true,
                name: true,
                minSelect: true,
                maxSelect: true,
                options: { orderBy: { position: "asc" }, select: { id: true, name: true, priceCents: true } },
              },
            },
          },
        },
      },
    }),
  );
  return categories
    .filter((c) => c.items.length > 0)
    .map((c) => ({
      id: c.id,
      name: localized(c.nameI18n, locale, c.name),
      items: c.items.map((i) => ({
        id: i.id,
        name: localized(i.nameI18n, locale, i.name),
        description: i.description ? localized(i.descriptionI18n, locale, i.description) : null,
        priceCents: i.priceCents,
        photoUrl: i.photoUrl,
        soldOut: i.soldOut,
        optionGroups: i.optionGroups,
      })),
    }));
}

async function loadPricingMenu(tx: TenantTx, ids: string[]): Promise<Map<string, PricingMenuItem>> {
  const items = await tx.menuItem.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      priceCents: true,
      station: true,
      active: true,
      soldOut: true,
      category: { select: { active: true, paused: true } },
      optionGroups: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          name: true,
          minSelect: true,
          maxSelect: true,
          options: { orderBy: { position: "asc" }, select: { id: true, name: true, priceCents: true } },
        },
      },
    },
  });
  return new Map(
    items.map((i) => [
      i.id,
      {
        id: i.id,
        name: i.name,
        priceCents: i.priceCents,
        station: i.station,
        available: i.active && i.category.active && !i.category.paused,
        soldOut: i.soldOut,
        optionGroups: i.optionGroups,
      },
    ]),
  );
}

// ───────────────────────── Comanda e pessoas ─────────────────────────

/** Comanda aberta da mesa; cria uma se não houver. Seguro com vários celulares ao mesmo tempo. */
export async function getOrOpenSession(restaurantId: string, tableId: string): Promise<{ id: string; created: boolean }> {
  const find = () =>
    withTenant(restaurantId, (tx) =>
      tx.tableSession.findFirst({ where: { tableId, status: { not: "CLOSED" } }, select: { id: true } }),
    );
  const existing = await find();
  if (existing) return { id: existing.id, created: false };
  try {
    const created = await withTenant(restaurantId, async (tx) => {
      const s = await tx.tableSession.create({ data: { restaurantId, tableId }, select: { id: true } });
      await publish(tx, { type: "table.updated", restaurantId, tableId });
      return s;
    });
    return { id: created.id, created: true };
  } catch (err) {
    // Outro celular abriu a comanda no mesmo instante (índice único parcial): usa a dele.
    if (!isUniqueViolation(err)) throw err;
    const again = await find();
    if (!again) throw err;
    return { id: again.id, created: false };
  }
}

/** Entra na mesa com o nome guardado no navegador. Reentrar com o mesmo celular reaproveita a pessoa. */
export async function joinTable(table: TableByToken, input: { deviceId: string; name: string }): Promise<JoinResultDTO> {
  const r = table.restaurant;
  if (r.status !== "ACTIVE") throw new ServiceError("RESTAURANT_UNAVAILABLE", 423);
  if (!DEVICE_ID_RE.test(input.deviceId)) throw new ServiceError("INVALID_DEVICE", 400);
  const name = normalizeGuestName(input.name);
  if (!name) throw new ServiceError("INVALID_NAME", 400);

  const session = await getOrOpenSession(r.id, table.id);
  return withTenant(r.id, async (tx) => {
    const guests = await tx.guest.findMany({ where: { sessionId: session.id }, select: { id: true, name: true, deviceId: true } });
    const mine = guests.find((g) => g.deviceId === input.deviceId);
    const others = guests.filter((g) => g !== mine).map((g) => g.name);

    if (mine) {
      // Mesmo nome (ou o nome já com sufixo "Ana (2)") → nada muda.
      const base = mine.name.replace(/ \(\d+\)$/, "");
      if (base === name) return { sessionId: session.id, guestId: mine.id, displayName: mine.name };
      const displayName = uniqueDisplayName(name, others);
      await tx.guest.update({ where: { id: mine.id }, data: { name: displayName } });
      await publish(tx, { type: "guest.joined", restaurantId: r.id, sessionId: session.id, guestId: mine.id });
      return { sessionId: session.id, guestId: mine.id, displayName };
    }

    const displayName = uniqueDisplayName(name, others);
    const guest = await tx.guest.create({
      data: { restaurantId: r.id, sessionId: session.id, deviceId: input.deviceId, name: displayName },
      select: { id: true },
    });
    await publish(tx, { type: "guest.joined", restaurantId: r.id, sessionId: session.id, guestId: guest.id });
    return { sessionId: session.id, guestId: guest.id, displayName };
  });
}

// ───────────────────────── Conta da mesa ─────────────────────────

/** Restaurante de uma comanda (para as rotas /api/sessions/{id}, que só recebem o id). */
export async function findSessionRestaurant(sessionId: string) {
  if (!/^[a-z0-9]{20,40}$/.test(sessionId)) return null;
  const s = await prisma.tableSession.findUnique({
    where: { id: sessionId },
    select: { restaurantId: true, tableId: true, restaurant: { select: { status: true } } },
  });
  return s ? { restaurantId: s.restaurantId, tableId: s.tableId, restaurantStatus: s.restaurant.status } : null;
}

function itemStatus(orderStatus: string): OrderStatusDTO {
  return orderStatus as OrderStatusDTO;
}

interface OptionSnapshot {
  group: string;
  name: string;
}

function optionLabels(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((o): o is OptionSnapshot => !!o && typeof o === "object" && typeof (o as OptionSnapshot).name === "string")
    .map((o) => o.name);
}

/**
 * Conta completa da mesa. Só quem está na mesa (deviceId registado nesta comanda) pode vê-la.
 * Comanda fechada devolve status CLOSED (o celular mostra "Esta conta foi encerrada").
 */
export async function getBill(restaurantId: string, sessionId: string, deviceId: string): Promise<BillDTO> {
  if (!DEVICE_ID_RE.test(deviceId)) throw new ServiceError("INVALID_DEVICE", 400);
  return withTenant(restaurantId, async (tx) => {
    const session = await tx.tableSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        status: true,
        paidAmount: true,
        table: { select: { number: true } },
        restaurant: { select: { serviceFeePct: true } },
        guests: { orderBy: { joinedAt: "asc" }, select: { id: true, name: true, deviceId: true } },
        orders: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            number: true,
            status: true,
            channel: true,
            createdAt: true,
            guestId: true,
            staff: { select: { name: true } },
            items: {
              orderBy: { id: "asc" },
              select: {
                id: true,
                nameSnapshot: true,
                quantity: true,
                unitPriceCents: true,
                optionsJson: true,
                note: true,
                ownerGuestId: true,
                paidCents: true,
                cancelled: true,
              },
            },
          },
        },
      },
    });
    if (!session) throw new ServiceError("SESSION_NOT_FOUND", 404);
    const me = session.guests.find((g) => g.deviceId === deviceId);
    if (!me) throw new ServiceError("NOT_A_GUEST", 403);

    const guestName = new Map(session.guests.map((g) => [g.id, g.name]));
    const items: (BillItemDTO & { ownerGuestId: string | null })[] = session.orders.flatMap((o) =>
      o.items.map((i) => ({
        id: i.id,
        orderId: o.id,
        orderNumber: o.number,
        name: i.nameSnapshot,
        quantity: i.quantity,
        unitPriceCents: i.unitPriceCents,
        totalCents: i.cancelled ? 0 : i.unitPriceCents * i.quantity,
        options: optionLabels(i.optionsJson),
        note: i.note,
        status: itemStatus(o.status),
        cancelled: i.cancelled,
        paidCents: i.paidCents,
        ownerGuestId: i.ownerGuestId,
      })),
    );

    const totals = computeTotals(items, session.restaurant.serviceFeePct);
    const groups: BillGroupDTO[] = groupByGuest(
      items,
      session.guests.map((g) => g.id),
    ).map((g) => ({
      guestId: g.guestId,
      name: g.guestId ? (guestName.get(g.guestId) ?? null) : null,
      isMe: g.guestId === me.id,
      subtotalCents: g.items.reduce((s, i) => s + i.totalCents, 0),
      items: g.items.map(({ ownerGuestId: _o, ...rest }) => rest),
    }));

    return {
      sessionId: session.id,
      status: session.status,
      tableNumber: session.table.number,
      serviceFeePct: session.restaurant.serviceFeePct,
      subtotalCents: totals.subtotal,
      serviceFeeCents: totals.serviceFee,
      totalCents: totals.total,
      paidCents: session.paidAmount,
      remainingCents: remaining(totals.total, session.paidAmount),
      me: { guestId: me.id, name: me.name },
      guests: session.guests.map((g) => ({ id: g.id, name: g.name })),
      groups,
      orders: session.orders.map((o) => ({
        id: o.id,
        number: o.number,
        status: itemStatus(o.status),
        channel: o.channel,
        createdAt: o.createdAt.toISOString(),
        byName: o.guestId ? (guestName.get(o.guestId) ?? null) : (o.staff?.name ?? null),
        itemCount: o.items.reduce((s, i) => s + (i.cancelled ? 0 : i.quantity), 0),
      })),
    };
  });
}

/** Recalcula subtotal/taxa/total da comanda a partir dos itens (nunca de forma incremental). */
export async function recomputeSessionTotals(tx: TenantTx, sessionId: string): Promise<void> {
  const session = await tx.tableSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { restaurant: { select: { serviceFeePct: true } } },
  });
  const items = await tx.orderItem.findMany({
    where: { order: { sessionId } },
    select: { quantity: true, unitPriceCents: true, cancelled: true },
  });
  const t = computeTotals(items, session.restaurant.serviceFeePct);
  await tx.tableSession.update({ where: { id: sessionId }, data: { subtotal: t.subtotal, serviceFee: t.serviceFee, total: t.total } });
}

// ───────────────────────── Pedido do cliente ─────────────────────────

export interface CreateGuestOrderInput {
  deviceId: string;
  clientRef: string;
  lines: CartLineInput[];
  note?: string | null;
}

/** Pedido já recebido com este clientRef? (reenvio por rede fraca ou toque duplo) */
export async function findOrderByClientRef(restaurantId: string, clientRef: string): Promise<CreateOrderResultDTO | null> {
  const o = await withTenant(restaurantId, (tx) =>
    tx.order.findUnique({
      where: { restaurantId_clientRef: { restaurantId, clientRef } },
      select: { id: true, number: true, status: true },
    }),
  );
  return o ? { orderId: o.id, number: o.number, status: o.status, duplicate: true } : null;
}

export async function createGuestOrder(restaurantId: string, sessionId: string, input: CreateGuestOrderInput): Promise<CreateOrderResultDTO> {
  if (!DEVICE_ID_RE.test(input.deviceId)) throw new ServiceError("INVALID_DEVICE", 400);
  if (!/^[A-Za-z0-9-]{8,64}$/.test(input.clientRef)) throw new ServiceError("INVALID_REQUEST", 400);

  try {
    return await withTenant(restaurantId, async (tx) => {
      const session = await tx.tableSession.findUnique({
        where: { id: sessionId },
        select: { id: true, status: true, tableId: true, restaurant: { select: { status: true, requireQrApproval: true } } },
      });
      if (!session) throw new ServiceError("SESSION_NOT_FOUND", 404);
      if (session.restaurant.status !== "ACTIVE") throw new ServiceError("RESTAURANT_UNAVAILABLE", 423);
      const guest = await tx.guest.findUnique({
        where: { deviceId_sessionId: { deviceId: input.deviceId, sessionId } },
        select: { id: true },
      });
      if (!guest) throw new ServiceError("NOT_A_GUEST", 403);
      if (session.status === "CLOSED") throw new ServiceError("SESSION_CLOSED", 409);

      const existing = await tx.order.findUnique({
        where: { restaurantId_clientRef: { restaurantId, clientRef: input.clientRef } },
        select: { id: true, number: true, status: true },
      });
      if (existing) return { orderId: existing.id, number: existing.number, status: existing.status, duplicate: true };

      const menu = await loadPricingMenu(tx, [...new Set(input.lines.map((l) => l.menuItemId))]);
      const priced = priceCart(input.lines, menu);
      if (!priced.ok) {
        const { code, itemName, group } = priced.error;
        throw new ServiceError(code, code === "SOLD_OUT" || code === "ITEM_UNAVAILABLE" ? 409 : 400, { itemName, group });
      }

      const note = input.note?.replace(/\s+/g, " ").trim() || null;
      if (note && note.length > 200) throw new ServiceError("NOTE_TOO_LONG", 400);

      // Número sequencial do pedido (#0187). O UPDATE bloqueia a linha do restaurante:
      // dois pedidos simultâneos nunca recebem o mesmo número.
      const { nextOrderNumber } = await tx.restaurant.update({
        where: { id: restaurantId },
        data: { nextOrderNumber: { increment: 1 } },
        select: { nextOrderNumber: true },
      });
      const status = session.restaurant.requireQrApproval ? "PENDING_APPROVAL" : "SENT";

      const order = await tx.order.create({
        data: {
          restaurantId,
          sessionId,
          tableId: session.tableId,
          number: nextOrderNumber - 1,
          guestId: guest.id,
          channel: "QR",
          status,
          note,
          clientRef: input.clientRef,
          items: {
            create: priced.lines.map((l) => ({
              restaurantId,
              menuItemId: l.menuItemId,
              nameSnapshot: l.name,
              unitPriceCents: l.unitPriceCents,
              quantity: l.quantity,
              station: l.station,
              optionsJson: l.options.length ? l.options.map((o) => ({ group: o.group, name: o.name, priceCents: o.priceCents })) : undefined,
              note: l.note,
              ownerGuestId: guest.id,
            })),
          },
        },
        select: { id: true, number: true, status: true },
      });

      await recomputeSessionTotals(tx, sessionId);
      // Imprime já na cozinha/bar (se o restaurante exige aprovação, só depois de aceite no painel).
      if (order.status === "SENT") await createPrintJobs(tx, order.id);
      await publish(tx, {
        type: "order.created",
        restaurantId,
        sessionId,
        tableId: session.tableId,
        orderId: order.id,
        number: order.number,
      });
      return { orderId: order.id, number: order.number, status: order.status, duplicate: false };
    });
  } catch (err) {
    // Dois envios simultâneos do mesmo carrinho: o segundo esbarra no índice único → devolve o primeiro.
    if (isUniqueViolation(err)) {
      const dup = await findOrderByClientRef(restaurantId, input.clientRef);
      if (dup) return dup;
    }
    throw err;
  }
}
