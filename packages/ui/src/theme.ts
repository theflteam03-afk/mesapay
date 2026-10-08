/**
 * Tema por restaurante: light/dark + cor principal, aplicados via CSS variables.
 */
export type ThemeMode = "light" | "dark";

export function themeMode(theme: "LIGHT" | "DARK" | string | null | undefined): ThemeMode {
  return theme === "DARK" ? "dark" : "light";
}

const HEX = /^#(?:[0-9a-f]{3}){1,2}$/i;

/** Cor de texto legível (preto ou branco) sobre a cor da marca, pelo contraste WCAG. */
export function readableOn(hex: string): "#ffffff" | "#111111" {
  if (!HEX.test(hex)) return "#ffffff";
  let h = hex.slice(1);
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const contrastWhite = 1.05 / (lum + 0.05);
  const contrastBlack = (lum + 0.05) / 0.05;
  return contrastWhite >= contrastBlack ? "#ffffff" : "#111111";
}

/** Estilo inline para o elemento raiz: `<html style={brandStyle(color)}>` */
export function brandStyle(primaryColor: string | null | undefined): Record<string, string> {
  const color = primaryColor && HEX.test(primaryColor) ? primaryColor : "#e11d48";
  return { "--brand": color, "--brand-fg": readableOn(color) };
}
