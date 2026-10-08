import { describe, expect, it } from "vitest";
import { brandStyle, readableOn, themeMode } from "./theme";

describe("tema", () => {
  it("mapeia o enum do banco", () => {
    expect(themeMode("DARK")).toBe("dark");
    expect(themeMode("LIGHT")).toBe("light");
    expect(themeMode(undefined)).toBe("light");
  });

  it("escolhe texto legível sobre a cor da marca", () => {
    expect(readableOn("#E11D48")).toBe("#ffffff");
    expect(readableOn("#FACC15")).toBe("#111111");
    expect(readableOn("#fff")).toBe("#111111");
  });

  it("ignora cores inválidas", () => {
    expect(brandStyle("javascript:alert(1)")["--brand"]).toBe("#e11d48");
  });
});
