import { en } from "./locales/en";
import { es } from "./locales/es";
import { ptBR, type Messages } from "./locales/pt-BR";

export const LOCALES = ["pt-BR", "en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pt-BR";

const dictionaries: Record<Locale, Messages> = { "pt-BR": ptBR, en, es };

/** Chaves em notação de ponto: "auth.login.title" */
type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Leaves<T> = T extends string ? never : { [K in keyof T]-?: T[K] extends string ? K : Join<K, Leaves<T[K]>> }[keyof T];
export type MessageKey = Leaves<Messages>;

export function getDictionary(locale: Locale): Messages {
  return dictionaries[locale];
}

/** Escolhe o idioma a partir do cabeçalho Accept-Language (ex.: "en-US,en;q=0.9"). */
export function negotiateLocale(acceptLanguage: string | null | undefined, allowed: readonly Locale[] = LOCALES): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const wanted = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag = "", q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of wanted) {
    const exact = allowed.find((l) => l.toLowerCase() === tag);
    if (exact) return exact;
    const base = tag.split("-")[0];
    const partial = allowed.find((l) => l.toLowerCase().split("-")[0] === base);
    if (partial) return partial;
  }
  return allowed.includes(DEFAULT_LOCALE) ? DEFAULT_LOCALE : (allowed[0] ?? DEFAULT_LOCALE);
}

/** Tradutor ligado a um idioma. Variáveis: t("x", { name: "Ana" }) substitui {name}. */
export function createTranslator(locale: Locale) {
  const dict = dictionaries[locale];
  return function t(key: MessageKey, vars?: Record<string, string | number>): string {
    let node: unknown = dict;
    for (const part of key.split(".")) {
      node = (node as Record<string, unknown> | undefined)?.[part];
    }
    let text = typeof node === "string" ? node : key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
    }
    return text;
  };
}

export type Translator = ReturnType<typeof createTranslator>;
export type { Messages };
