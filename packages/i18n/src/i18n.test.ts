import { describe, expect, it } from "vitest";
import { createTranslator, negotiateLocale } from "./index";

describe("i18n", () => {
  it("traduz com variáveis", () => {
    expect(createTranslator("pt-BR")("dashboard.tables.table", { number: 12 })).toBe("Mesa 12");
    expect(createTranslator("en")("dashboard.tables.table", { number: 12 })).toBe("Table 12");
  });

  it("negocia o idioma pelo navegador", () => {
    expect(negotiateLocale("en-US,en;q=0.9")).toBe("en");
    expect(negotiateLocale("es-AR")).toBe("es");
    expect(negotiateLocale("pt-PT,pt;q=0.8")).toBe("pt-BR");
    expect(negotiateLocale("fr-FR")).toBe("pt-BR");
    expect(negotiateLocale(null)).toBe("pt-BR");
    expect(negotiateLocale("en-US", ["pt-BR"])).toBe("pt-BR");
  });
});
