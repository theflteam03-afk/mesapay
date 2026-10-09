import type { MenuCategoryDTO, MenuItemDTO } from "@mesapay/db/types";

export interface CartLine {
  key: string;
  menuItemId: string;
  quantity: number;
  optionIds: string[];
  note: string | null;
}

export function indexMenu(menu: MenuCategoryDTO[]): Map<string, MenuItemDTO> {
  return new Map(menu.flatMap((c) => c.items.map((i) => [i.id, i] as const)));
}

/** Preço unitário mostrado no celular (o servidor recalcula sempre ao receber o pedido). */
export function unitPrice(item: MenuItemDTO, optionIds: readonly string[]): number {
  const chosen = new Set(optionIds);
  return item.priceCents + item.optionGroups.flatMap((g) => g.options).reduce((s, o) => s + (chosen.has(o.id) ? o.priceCents : 0), 0);
}

export function optionNames(item: MenuItemDTO, optionIds: readonly string[]): string[] {
  const chosen = new Set(optionIds);
  return item.optionGroups.flatMap((g) => g.options.filter((o) => chosen.has(o.id)).map((o) => o.name));
}

function lineKey(menuItemId: string, optionIds: readonly string[], note: string | null) {
  return `${menuItemId}|${[...optionIds].sort().join(",")}|${note ?? ""}`;
}

/** Junta ao carrinho; o mesmo prato com as mesmas opções e observação soma na linha existente. */
export function addLine(cart: CartLine[], line: Omit<CartLine, "key">): CartLine[] {
  const key = lineKey(line.menuItemId, line.optionIds, line.note);
  const existing = cart.find((l) => l.key === key);
  if (existing) return cart.map((l) => (l.key === key ? { ...l, quantity: Math.min(30, l.quantity + line.quantity) } : l));
  return [...cart, { ...line, key }];
}

export function cartCount(cart: CartLine[]): number {
  return cart.reduce((s, l) => s + l.quantity, 0);
}

export function cartTotal(cart: CartLine[], menu: Map<string, MenuItemDTO>): number {
  return cart.reduce((s, l) => {
    const item = menu.get(l.menuItemId);
    return item ? s + unitPrice(item, l.optionIds) * l.quantity : s;
  }, 0);
}

export function parseCart(raw: string | null): CartLine[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(
      (l): l is CartLine =>
        !!l &&
        typeof l === "object" &&
        typeof (l as CartLine).key === "string" &&
        typeof (l as CartLine).menuItemId === "string" &&
        Number.isInteger((l as CartLine).quantity) &&
        Array.isArray((l as CartLine).optionIds),
    );
  } catch {
    return [];
  }
}
