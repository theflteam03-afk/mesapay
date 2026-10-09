import { TICKET_HEADER_LINE } from "./ticket";

/**
 * ESC/POS para térmicas (Epson, Elgin, Bematech, Daruma, genéricas 58/80 mm).
 * O texto vai na página de código PC860 (português): acentos e "ç" saem certos sem
 * depender de fontes. Caracteres que não existem na PC860 perdem o acento ("ñ" fica).
 */

// PC860 (português), posições 0x80–0xAF + alguns símbolos usados nos tickets.
const CP860: Record<string, number> = {
  Ç: 0x80, ü: 0x81, é: 0x82, â: 0x83, ã: 0x84, à: 0x85, Á: 0x86, ç: 0x87,
  ê: 0x88, Ê: 0x89, è: 0x8a, Í: 0x8b, Ô: 0x8c, ì: 0x8d, Ã: 0x8e, Â: 0x8f,
  É: 0x90, À: 0x91, È: 0x92, ô: 0x93, õ: 0x94, ò: 0x95, Ú: 0x96, ù: 0x97,
  Ì: 0x98, Õ: 0x99, Ü: 0x9a, "¢": 0x9b, "£": 0x9c, Ù: 0x9d, Ó: 0x9f,
  á: 0xa0, í: 0xa1, ó: 0xa2, ú: 0xa3, ñ: 0xa4, Ñ: 0xa5, ª: 0xa6, º: 0xa7,
  "¿": 0xa8, Ò: 0xa9, "¡": 0xad, "«": 0xae, "»": 0xaf, "°": 0xf8, "·": 0xfa,
};

const REPLACEMENTS: Record<string, string> = { "…": "...", "“": '"', "”": '"', "‘": "'", "’": "'", "–": "-", "—": "-", "×": "x" };

/** Converte texto Unicode para bytes PC860. */
export function encodeCp860(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const raw of text) {
    const ch = REPLACEMENTS[raw] ?? raw;
    for (const c of ch) {
      const code = c.codePointAt(0) ?? 0x3f;
      if (code === 0x0a || (code >= 0x20 && code < 0x7f)) {
        bytes.push(code);
        continue;
      }
      const mapped = CP860[c];
      if (mapped !== undefined) {
        bytes.push(mapped);
        continue;
      }
      // Sem equivalente: tenta a letra sem acento (ex.: "ő" → "o"); senão "?".
      const base = c.normalize("NFD").replace(/\p{M}/gu, "");
      const b = base.codePointAt(0);
      bytes.push(base.length === 1 && b !== undefined && b >= 0x20 && b < 0x7f ? b : 0x3f);
    }
  }
  return Uint8Array.from(bytes);
}

const ESC = 0x1b;
const GS = 0x1d;

export interface EscPosOptions {
  /** Página de código PC860 = 3 na maioria das Epson/compatíveis. */
  codePage?: number;
  /** Corte parcial no fim (impressoras sem guilhotina ignoram). */
  cut?: boolean;
  /** Bip ao imprimir (só alguns modelos). */
  beep?: boolean;
}

/** Ticket em texto → comandos ESC/POS prontos a enviar para a porta 9100 ou USB. */
export function toEscPos(ticketText: string, opts: EscPosOptions = {}): Uint8Array {
  const parts: number[] = [ESC, 0x40, ESC, 0x74, opts.codePage ?? 3];
  const lines = ticketText.replace(/\n$/, "").split("\n");
  lines.forEach((line, i) => {
    if (i === TICKET_HEADER_LINE) {
      // Cabeçalho (estação e mesa): negrito + altura dupla (mantém a largura em colunas).
      parts.push(ESC, 0x21, 0x18);
      parts.push(...encodeCp860(line), 0x0a);
      parts.push(ESC, 0x21, 0x00);
    } else {
      parts.push(...encodeCp860(line), 0x0a);
    }
  });
  parts.push(ESC, 0x64, 4); // avança 4 linhas para o corte não comer o fim
  if (opts.cut !== false) parts.push(GS, 0x56, 0x42, 0x00);
  if (opts.beep) parts.push(ESC, 0x42, 2, 2);
  return Uint8Array.from(parts);
}
