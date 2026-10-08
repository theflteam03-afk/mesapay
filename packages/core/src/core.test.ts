import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERMISSIONS,
  formatBRL,
  generatePin,
  generateQrToken,
  hasPermission,
  isValidPin,
  lineTotal,
  serviceFee,
  slugify,
  splitEvenly,
  toCents,
} from "./index";

describe("money", () => {
  it("converte reais para centavos sem erro de float", () => {
    expect(toCents("89,90")).toBe(8990);
    expect(toCents("1.234,56")).toBe(123456);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents("R$ 22,00")).toBe(2200);
  });

  it("formata em BRL", () => {
    expect(formatBRL(8990)).toBe("R$ 89,90");
    expect(formatBRL(0)).toBe("R$ 0,00");
  });

  it("rejeita valores não inteiros", () => {
    expect(() => formatBRL(1.5)).toThrow(RangeError);
    expect(() => lineTotal(10.5, 1)).toThrow(RangeError);
  });

  it("calcula a taxa de serviço arredondando ao centavo", () => {
    expect(serviceFee(8990, 10)).toBe(899);
    expect(serviceFee(1005, 10)).toBe(101); // 100,5 → 101
    expect(serviceFee(1000, 0)).toBe(0);
    expect(() => serviceFee(1000, 101)).toThrow();
  });

  it("divide igualmente sem perder centavos", () => {
    expect(splitEvenly(1000, 3)).toEqual([334, 333, 333]);
    const parts = splitEvenly(12345, 7);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(12345);
  });
});

describe("tokens e PIN", () => {
  it("gera tokens de QR longos e únicos", () => {
    const tokens = new Set(Array.from({ length: 500 }, generateQrToken));
    expect(tokens.size).toBe(500);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z2-9]{20}$/);
  });

  it("gera e valida PINs", () => {
    expect(isValidPin(generatePin(4))).toBe(true);
    expect(generatePin(6)).toHaveLength(6);
    expect(isValidPin("12a4")).toBe(false);
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("1234567")).toBe(false);
  });
});

describe("permissões", () => {
  it("garçom não abre dashboard; dono pode tudo", () => {
    expect(hasPermission(DEFAULT_PERMISSIONS.WAITER, "dashboard")).toBe(false);
    expect(hasPermission(DEFAULT_PERMISSIONS.CASHIER, "tables.payment")).toBe(true);
    expect(hasPermission(DEFAULT_PERMISSIONS.ADMIN, "settings")).toBe(false);
    expect(hasPermission(DEFAULT_PERMISSIONS.OWNER, "settings")).toBe(true);
  });
});

describe("slug", () => {
  it("remove acentos e símbolos", () => {
    expect(slugify("Bar do Zé — Unidade Centro")).toBe("bar-do-ze-unidade-centro");
  });
});
