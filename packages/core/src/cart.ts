import { assertCents, type Cents } from "./money";

/**
 * Validação e preço de um pedido. Corre SEMPRE no servidor: o celular só diz
 * "quero o item X com as opções Y"; o preço vem do menu no momento do pedido.
 */

export const MAX_ITEMS_PER_ORDER = 30;
export const MAX_NOTE_LENGTH = 140;

export interface PricingOption {
  id: string;
  name: string;
  priceCents: Cents;
}

export interface PricingOptionGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: PricingOption[];
}

export interface PricingMenuItem {
  id: string;
  name: string;
  priceCents: Cents;
  station: "KITCHEN" | "BAR";
  /** Item ativo e categoria ativa e não pausada. */
  available: boolean;
  soldOut: boolean;
  optionGroups: PricingOptionGroup[];
}

export interface CartLineInput {
  menuItemId: string;
  quantity: number;
  optionIds?: string[];
  note?: string | null;
}

export interface PricedOption {
  groupId: string;
  group: string;
  optionId: string;
  name: string;
  priceCents: Cents;
}

export interface PricedLine {
  menuItemId: string;
  name: string;
  quantity: number;
  /** Preço do item + opções, por unidade. */
  unitPriceCents: Cents;
  station: "KITCHEN" | "BAR";
  options: PricedOption[];
  note: string | null;
}

export type CartErrorCode =
  | "EMPTY"
  | "TOO_MANY_ITEMS"
  | "INVALID_QUANTITY"
  | "ITEM_UNAVAILABLE"
  | "SOLD_OUT"
  | "INVALID_OPTION"
  | "OPTION_MIN"
  | "OPTION_MAX"
  | "NOTE_TOO_LONG";

export interface CartError {
  code: CartErrorCode;
  menuItemId?: string;
  itemName?: string;
  group?: string;
}

export type PriceCartResult = { ok: true; lines: PricedLine[]; totalQuantity: number; subtotalCents: Cents } | { ok: false; error: CartError };

/** Normaliza uma observação ("sem cebola"): sem espaços a mais, vazio → null. */
export function normalizeNote(note: string | null | undefined): string | null {
  if (!note) return null;
  const clean = note.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
  return clean ? clean : null;
}

export function priceCart(
  lines: readonly CartLineInput[],
  menu: ReadonlyMap<string, PricingMenuItem>,
  opts: { maxItems?: number } = {},
): PriceCartResult {
  const maxItems = opts.maxItems ?? MAX_ITEMS_PER_ORDER;
  if (lines.length === 0) return { ok: false, error: { code: "EMPTY" } };

  let totalQuantity = 0;
  let subtotalCents = 0;
  const priced: PricedLine[] = [];

  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > maxItems) {
      return { ok: false, error: { code: "INVALID_QUANTITY", menuItemId: line.menuItemId } };
    }
    totalQuantity += line.quantity;
    if (totalQuantity > maxItems) return { ok: false, error: { code: "TOO_MANY_ITEMS" } };

    const item = menu.get(line.menuItemId);
    if (!item || !item.available) {
      return { ok: false, error: { code: "ITEM_UNAVAILABLE", menuItemId: line.menuItemId, itemName: item?.name } };
    }
    if (item.soldOut) return { ok: false, error: { code: "SOLD_OUT", menuItemId: item.id, itemName: item.name } };

    const note = normalizeNote(line.note);
    if (note && note.length > MAX_NOTE_LENGTH) {
      return { ok: false, error: { code: "NOTE_TOO_LONG", menuItemId: item.id, itemName: item.name } };
    }

    const optionIds = line.optionIds ?? [];
    if (new Set(optionIds).size !== optionIds.length) {
      return { ok: false, error: { code: "INVALID_OPTION", menuItemId: item.id, itemName: item.name } };
    }
    const chosen = new Set(optionIds);
    const pricedOptions: PricedOption[] = [];
    let matched = 0;
    for (const group of item.optionGroups) {
      const picked = group.options.filter((o) => chosen.has(o.id));
      matched += picked.length;
      if (picked.length < group.minSelect) {
        return { ok: false, error: { code: "OPTION_MIN", menuItemId: item.id, itemName: item.name, group: group.name } };
      }
      if (picked.length > group.maxSelect) {
        return { ok: false, error: { code: "OPTION_MAX", menuItemId: item.id, itemName: item.name, group: group.name } };
      }
      for (const o of picked) {
        assertCents(o.priceCents, "option.priceCents");
        pricedOptions.push({ groupId: group.id, group: group.name, optionId: o.id, name: o.name, priceCents: o.priceCents });
      }
    }
    // Alguma opção que não pertence a este item (ou de outro restaurante).
    if (matched !== chosen.size) {
      return { ok: false, error: { code: "INVALID_OPTION", menuItemId: item.id, itemName: item.name } };
    }

    assertCents(item.priceCents, "item.priceCents");
    const unitPriceCents = item.priceCents + pricedOptions.reduce((s, o) => s + o.priceCents, 0);
    subtotalCents += unitPriceCents * line.quantity;
    priced.push({
      menuItemId: item.id,
      name: item.name,
      quantity: line.quantity,
      unitPriceCents,
      station: item.station,
      options: pricedOptions,
      note,
    });
  }

  return { ok: true, lines: priced, totalQuantity, subtotalCents };
}
