/**
 * Eventos em tempo real (tipados). Os eventos são AVISOS curtos ("o pedido X foi criado");
 * quem os recebe volta a pedir o estado completo à API. Assim um evento perdido nunca deixa
 * um celular com dados errados: no máximo atrasa até à próxima sincronização.
 *
 * Só a API publica eventos (nunca os celulares). A publicação é feita com `pg_notify` dentro
 * da MESMA transação que grava os dados: o Postgres só entrega a notificação depois do COMMIT,
 * por isso ninguém recebe um aviso de algo que acabou por não ser gravado.
 */

export const PG_CHANNEL = "mesapay_rt";

export type RealtimeEvent =
  | { type: "guest.joined"; restaurantId: string; sessionId: string; guestId: string }
  | { type: "order.created"; restaurantId: string; sessionId: string; tableId: string; orderId: string; number: number }
  | { type: "order.status"; restaurantId: string; sessionId: string; orderId: string; status: string }
  | { type: "session.updated"; restaurantId: string; sessionId: string }
  | { type: "session.closed"; restaurantId: string; sessionId: string; tableId: string }
  | { type: "menu.updated"; restaurantId: string; menuItemId?: string; soldOut?: boolean }
  | { type: "table.updated"; restaurantId: string; tableId: string }
  /** Fila de impressão mudou (novo ticket, impresso, falhou, impressora ligou/desligou). */
  | { type: "print.updated"; restaurantId: string; printerId?: string };

/** Eventos do restaurante que não pertencem a uma comanda. */
const RESTAURANT_EVENTS = new Set(["menu.updated", "table.updated", "print.updated"]);

/** Enviado só do servidor SSE para o navegador quando a ligação foi refeita: "volte a sincronizar". */
export type ClientEvent = RealtimeEvent | { type: "resync" };

export type RealtimeEventType = RealtimeEvent["type"];

export function isSessionEvent(e: RealtimeEvent): e is Extract<RealtimeEvent, { sessionId: string }> {
  return "sessionId" in e;
}

/** Valida um JSON recebido (do Postgres ou do navegador) antes de o usar. */
export function parseEvent(raw: string): RealtimeEvent | null {
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    if (typeof o.type !== "string" || typeof o.restaurantId !== "string") return null;
    if (RESTAURANT_EVENTS.has(o.type)) return o as RealtimeEvent;
    if (typeof o.sessionId !== "string") return null;
    return o as RealtimeEvent;
  } catch {
    return null;
  }
}

/** Qualquer cliente Prisma (ou transação) que saiba executar SQL. */
export interface SqlExecutor {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

/**
 * Publica um evento. Chame-o DENTRO da transação que grava os dados (ex.: em `withTenant`).
 * Limite do Postgres: 8000 bytes por notificação — os eventos têm só ids, ficam muito abaixo.
 */
export async function publish(db: SqlExecutor, event: RealtimeEvent): Promise<void> {
  const payload = JSON.stringify(event);
  await db.$executeRaw`SELECT pg_notify(${PG_CHANNEL}, ${payload})`;
}
