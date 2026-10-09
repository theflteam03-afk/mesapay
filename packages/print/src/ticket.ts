/**
 * Ticket de cozinha/bar em texto monoespaçado (papel térmico de 80 mm = 48 colunas,
 * 58 mm = 32 colunas). O mesmo texto serve para todas as impressoras: o ESC/POS só
 * acrescenta negrito/altura dupla no cabeçalho e o corte do papel.
 *
 *   ================================================
 *                 COZINHA  ·  MESA 12
 *   ================================================
 *   Cliente: Ana                               (QR)
 *   08/10/2026  20:41                 Pedido #0187
 *   ------------------------------------------------
 *   2x  Picanha na chapa
 *       > Ponto da carne: Mal passada
 *       > obs: sem cebola
 *   ------------------------------------------------
 *   Obs do pedido: trazer junto
 *   ================================================
 */

export type TicketStation = "KITCHEN" | "BAR" | "ALL";

export interface TicketItem {
  quantity: number;
  name: string;
  options: { group: string; name: string }[];
  note: string | null;
}

export interface TicketData {
  station: TicketStation;
  tableNumber: number;
  by: { kind: "guest" | "staff"; name: string };
  createdAt: Date;
  timezone: string;
  orderNumber: number;
  items: TicketItem[];
  orderNote: string | null;
  reprint?: boolean;
}

const STATION_LABEL: Record<TicketStation, string> = { KITCHEN: "COZINHA", BAR: "BAR", ALL: "COZINHA E BAR" };

/** Índice (0-based) da linha de cabeçalho, que o ESC/POS imprime com altura dupla. */
export const TICKET_HEADER_LINE = 1;

export function clampWidth(width: number): number {
  return Math.max(24, Math.min(64, Math.round(width)));
}

function center(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  const left = Math.floor((width - text.length) / 2);
  return " ".repeat(left) + text;
}

/** "Cliente: Ana" à esquerda e "(QR)" à direita, na mesma linha. */
function spread(left: string, right: string, width: number): string {
  const room = width - right.length - 1;
  const l = left.length > room ? left.slice(0, Math.max(0, room - 1)) + "…" : left;
  return l + " ".repeat(Math.max(1, width - l.length - right.length)) + right;
}

/** Quebra o texto em linhas de no máximo `width`, com recuo nas linhas seguintes. */
export function wrap(text: string, width: number, firstPrefix: string, nextPrefix = " ".repeat(firstPrefix.length)): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = firstPrefix;
  let prefix = firstPrefix;
  for (const w of words) {
    const candidate = line.length > prefix.length ? `${line} ${w}` : line + w;
    if (candidate.length <= width) {
      line = candidate;
      continue;
    }
    if (line.length > prefix.length) lines.push(line);
    prefix = nextPrefix;
    let word = w;
    // Palavra maior que a linha: corta.
    while (prefix.length + word.length > width) {
      lines.push(prefix + word.slice(0, width - prefix.length));
      word = word.slice(width - prefix.length);
    }
    line = prefix + word;
  }
  if (line.length > prefix.length || lines.length === 0) lines.push(line);
  return lines;
}

export function formatTicketDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")}  ${get("hour")}:${get("minute")}`;
}

export function renderTicket(t: TicketData, widthInput = 48): string {
  const width = clampWidth(widthInput);
  const heavy = "=".repeat(width);
  const light = "-".repeat(width);
  const out: string[] = [];

  out.push(heavy);
  out.push(center(`${STATION_LABEL[t.station]}  ·  MESA ${t.tableNumber}`, width));
  out.push(heavy);
  if (t.reprint) out.push(center("*** REIMPRESSÃO ***", width));
  out.push(spread(t.by.kind === "guest" ? `Cliente: ${t.by.name}` : `Garçom: ${t.by.name}`, t.by.kind === "guest" ? "(QR)" : "(PIN)", width));
  out.push(spread(formatTicketDate(t.createdAt, t.timezone), `Pedido #${String(t.orderNumber).padStart(4, "0")}`, width));
  out.push(light);

  for (const item of t.items) {
    const qty = `${item.quantity}x`.padEnd(4);
    out.push(...wrap(item.name, width, qty, "    "));
    for (const o of item.options) out.push(...wrap(`${o.group}: ${o.name}`, width, "    > ", "      "));
    if (item.note) out.push(...wrap(`obs: ${item.note}`, width, "    > ", "      "));
  }

  if (t.orderNote) {
    out.push(light);
    out.push(...wrap(t.orderNote, width, "Obs do pedido: ", "  "));
  }
  out.push(heavy);
  return out.join("\n") + "\n";
}
