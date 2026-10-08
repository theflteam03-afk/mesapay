/**
 * Dinheiro é SEMPRE representado em centavos inteiros. Nunca use float para valores.
 */
export type Cents = number;

export function assertCents(value: number, label = "valor"): asserts value is Cents {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} deve ser um inteiro em centavos (recebido: ${value})`);
  }
}

/** Converte reais (ex.: "89,90", "89.9", 89.9) para centavos, arredondando ao centavo. */
export function toCents(reais: number | string): Cents {
  const normalized =
    typeof reais === "number"
      ? reais
      : Number(reais.trim().replace(/\s|R\$/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  if (!Number.isFinite(normalized)) throw new RangeError(`valor inválido: ${String(reais)}`);
  return Math.round(normalized * 100);
}

const brlFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 8990 → "R$ 89,90" (com espaço normal, não o espaço rígido do Intl). */
export function formatBRL(cents: Cents): string {
  assertCents(cents);
  return brlFormatter.format(cents / 100).replace(/ /g, " ");
}

/**
 * Taxa de serviço sobre um valor, em percentagem inteira (ex.: 10 = 10%).
 * Arredonda "half up" ao centavo.
 */
export function serviceFee(amount: Cents, pct: number): Cents {
  assertCents(amount, "amount");
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
    throw new RangeError(`percentagem de serviço inválida: ${pct}`);
  }
  return Math.floor((amount * pct + 50) / 100);
}

/** Soma de linhas (preço unitário × quantidade), em centavos. */
export function lineTotal(unitPriceCents: Cents, quantity: number): Cents {
  assertCents(unitPriceCents, "unitPriceCents");
  if (!Number.isInteger(quantity) || quantity < 0) throw new RangeError(`quantidade inválida: ${quantity}`);
  return unitPriceCents * quantity;
}

/**
 * Divide um valor em N partes inteiras que somam exatamente o total.
 * Os centavos que sobram vão para as primeiras partes: 1000 / 3 → [334, 333, 333].
 */
export function splitEvenly(total: Cents, parts: number): Cents[] {
  assertCents(total, "total");
  if (!Number.isInteger(parts) || parts < 1) throw new RangeError(`número de partes inválido: ${parts}`);
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}
