import { serviceFee, type Cents } from "./money";

/**
 * Conta da mesa: totais e agrupamento por pessoa.
 * Os totais são sempre recalculados a partir dos itens (nunca somados de forma incremental).
 */

export interface BillLine {
  quantity: number;
  unitPriceCents: Cents;
  cancelled: boolean;
}

export interface BillTotals {
  subtotal: Cents;
  serviceFee: Cents;
  total: Cents;
}

export function computeTotals(lines: readonly BillLine[], serviceFeePct: number): BillTotals {
  const subtotal = lines.reduce((sum, l) => (l.cancelled ? sum : sum + l.unitPriceCents * l.quantity), 0);
  const fee = serviceFee(subtotal, serviceFeePct);
  return { subtotal, serviceFee: fee, total: subtotal + fee };
}

/** Quanto falta pagar (nunca negativo). */
export function remaining(total: Cents, paid: Cents): Cents {
  return Math.max(0, total - paid);
}

export const MAX_GUEST_NAME_LENGTH = 30;

/** Limpa o nome digitado: sem espaços a mais nem caracteres de controle. Vazio ou longo demais → null. */
export function normalizeGuestName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const name = raw.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
  if (!name || name.length > MAX_GUEST_NAME_LENGTH) return null;
  return name;
}

/**
 * Nome mostrado na conta. Se já houver uma "Ana" na mesa, a segunda pessoa vira "Ana (2)".
 * Comparação sem distinguir maiúsculas/acentos.
 */
export function uniqueDisplayName(name: string, taken: readonly string[]): string {
  const key = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .trim();
  const used = new Set(taken.map(key));
  if (!used.has(key(name))) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} (${n})`;
    if (!used.has(key(candidate))) return candidate;
  }
}

export interface GroupableItem {
  ownerGuestId: string | null;
}

export interface Group<T> {
  guestId: string | null;
  items: T[];
}

/**
 * Agrupa os itens por pessoa, pela ordem em que as pessoas entraram na mesa.
 * Itens sem dono (lançados pelo garçom) ficam num grupo final com guestId = null.
 */
export function groupByGuest<T extends GroupableItem>(items: readonly T[], guestOrder: readonly string[]): Group<T>[] {
  const byGuest = new Map<string | null, T[]>();
  for (const item of items) {
    const key = item.ownerGuestId && guestOrder.includes(item.ownerGuestId) ? item.ownerGuestId : null;
    const list = byGuest.get(key) ?? [];
    list.push(item);
    byGuest.set(key, list);
  }
  const groups: Group<T>[] = [];
  for (const id of guestOrder) {
    const list = byGuest.get(id);
    if (list?.length) groups.push({ guestId: id, items: list });
  }
  const staff = byGuest.get(null);
  if (staff?.length) groups.push({ guestId: null, items: staff });
  return groups;
}
