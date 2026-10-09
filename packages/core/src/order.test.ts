import { describe, expect, it } from "vitest";
import {
  computeTotals,
  groupByGuest,
  normalizeGuestName,
  priceCart,
  remaining,
  uniqueDisplayName,
  type PricingMenuItem,
} from "./index";

const picanha: PricingMenuItem = {
  id: "picanha",
  name: "Picanha na chapa",
  priceCents: 8900,
  station: "KITCHEN",
  available: true,
  soldOut: false,
  optionGroups: [
    {
      id: "ponto",
      name: "Ponto da carne",
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: "mal", name: "Mal passada", priceCents: 0 },
        { id: "bem", name: "Bem passada", priceCents: 0 },
      ],
    },
    {
      id: "extras",
      name: "Extras",
      minSelect: 0,
      maxSelect: 2,
      options: [
        { id: "bacon", name: "Bacon", priceCents: 600 },
        { id: "ovo", name: "Ovo", priceCents: 400 },
        { id: "queijo", name: "Queijo", priceCents: 500 },
      ],
    },
  ],
};
const cerveja: PricingMenuItem = { id: "cerveja", name: "Cerveja", priceCents: 1200, station: "BAR", available: true, soldOut: false, optionGroups: [] };
const pudim: PricingMenuItem = { id: "pudim", name: "Pudim", priceCents: 1600, station: "KITCHEN", available: true, soldOut: true, optionGroups: [] };
const pausado: PricingMenuItem = { ...cerveja, id: "pausado", available: false };
const menu = new Map([picanha, cerveja, pudim, pausado].map((i) => [i.id, i]));

describe("priceCart", () => {
  it("calcula o preço no servidor com as opções escolhidas", () => {
    const r = priceCart(
      [
        { menuItemId: "picanha", quantity: 2, optionIds: ["mal", "bacon", "ovo"], note: "  sem   cebola " },
        { menuItemId: "cerveja", quantity: 3 },
      ],
      menu,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lines[0]).toMatchObject({ unitPriceCents: 8900 + 600 + 400, quantity: 2, station: "KITCHEN", note: "sem cebola" });
    expect(r.lines[0]?.options.map((o) => o.name)).toEqual(["Mal passada", "Bacon", "Ovo"]);
    expect(r.lines[1]).toMatchObject({ unitPriceCents: 1200, station: "BAR", note: null });
    expect(r.subtotalCents).toBe(2 * 9900 + 3 * 1200);
    expect(r.totalQuantity).toBe(5);
  });

  it("recusa carrinho vazio, quantidade inválida e mais de 30 itens", () => {
    expect(priceCart([], menu)).toEqual({ ok: false, error: { code: "EMPTY" } });
    expect(priceCart([{ menuItemId: "cerveja", quantity: 0 }], menu)).toMatchObject({ ok: false, error: { code: "INVALID_QUANTITY" } });
    expect(priceCart([{ menuItemId: "cerveja", quantity: 1.5 }], menu)).toMatchObject({ ok: false, error: { code: "INVALID_QUANTITY" } });
    expect(
      priceCart(
        [
          { menuItemId: "cerveja", quantity: 20 },
          { menuItemId: "cerveja", quantity: 11 },
        ],
        menu,
      ),
    ).toMatchObject({ ok: false, error: { code: "TOO_MANY_ITEMS" } });
  });

  it("recusa itens esgotados, pausados ou inexistentes", () => {
    expect(priceCart([{ menuItemId: "pudim", quantity: 1 }], menu)).toMatchObject({ ok: false, error: { code: "SOLD_OUT", itemName: "Pudim" } });
    expect(priceCart([{ menuItemId: "pausado", quantity: 1 }], menu)).toMatchObject({ ok: false, error: { code: "ITEM_UNAVAILABLE" } });
    expect(priceCart([{ menuItemId: "nao-existe", quantity: 1 }], menu)).toMatchObject({ ok: false, error: { code: "ITEM_UNAVAILABLE" } });
  });

  it("obriga a respeitar o mínimo e o máximo de cada grupo de opções", () => {
    expect(priceCart([{ menuItemId: "picanha", quantity: 1 }], menu)).toMatchObject({ ok: false, error: { code: "OPTION_MIN", group: "Ponto da carne" } });
    expect(priceCart([{ menuItemId: "picanha", quantity: 1, optionIds: ["mal", "bem"] }], menu)).toMatchObject({ ok: false, error: { code: "OPTION_MAX" } });
    expect(priceCart([{ menuItemId: "picanha", quantity: 1, optionIds: ["mal", "bacon", "ovo", "queijo"] }], menu)).toMatchObject({
      ok: false,
      error: { code: "OPTION_MAX", group: "Extras" },
    });
  });

  it("recusa opções de outro item e opções repetidas", () => {
    expect(priceCart([{ menuItemId: "cerveja", quantity: 1, optionIds: ["bacon"] }], menu)).toMatchObject({ ok: false, error: { code: "INVALID_OPTION" } });
    expect(priceCart([{ menuItemId: "picanha", quantity: 1, optionIds: ["mal", "bacon", "bacon"] }], menu)).toMatchObject({ ok: false, error: { code: "INVALID_OPTION" } });
  });

  it("limita o tamanho da observação", () => {
    expect(priceCart([{ menuItemId: "cerveja", quantity: 1, note: "x".repeat(141) }], menu)).toMatchObject({ ok: false, error: { code: "NOTE_TOO_LONG" } });
  });
});

describe("conta da mesa", () => {
  it("soma itens não cancelados e a taxa de serviço", () => {
    const t = computeTotals(
      [
        { quantity: 2, unitPriceCents: 8900, cancelled: false },
        { quantity: 1, unitPriceCents: 2200, cancelled: false },
        { quantity: 1, unitPriceCents: 5000, cancelled: true },
      ],
      10,
    );
    expect(t).toEqual({ subtotal: 20000, serviceFee: 2000, total: 22000 });
    expect(remaining(22000, 5000)).toBe(17000);
    expect(remaining(22000, 30000)).toBe(0);
  });

  it("dá nomes únicos às pessoas da mesa", () => {
    expect(uniqueDisplayName("Ana", [])).toBe("Ana");
    expect(uniqueDisplayName("Ana", ["ana"])).toBe("Ana (2)");
    expect(uniqueDisplayName("Ána", ["Ana", "Ana (2)"])).toBe("Ána (3)");
  });

  it("limpa o nome digitado", () => {
    expect(normalizeGuestName("  Ana   Maria ")).toBe("Ana Maria");
    expect(normalizeGuestName("   ")).toBeNull();
    expect(normalizeGuestName("x".repeat(31))).toBeNull();
  });

  it("agrupa por pessoa, na ordem de chegada, com os pedidos do garçom no fim", () => {
    const items = [
      { id: 1, ownerGuestId: "bia" },
      { id: 2, ownerGuestId: null },
      { id: 3, ownerGuestId: "ana" },
      { id: 4, ownerGuestId: "bia" },
    ];
    const groups = groupByGuest(items, ["ana", "bia", "caio"]);
    expect(groups.map((g) => [g.guestId, g.items.map((i) => i.id)])).toEqual([
      ["ana", [3]],
      ["bia", [1, 4]],
      [null, [2]],
    ]);
  });
});
