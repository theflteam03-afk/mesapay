import type { Messages } from "@mesapay/i18n";

export type TableMessages = Messages["table"] & { soldOut: string };

/** "Mesa {number}" + { number: 4 } → "Mesa 4" */
export function fill(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
