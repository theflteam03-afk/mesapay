/* Ícones mínimos em SVG (sem biblioteca: o app da mesa tem de ser leve). */
type P = { className?: string };
const base = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const IconPlus = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...base}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconMinus = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...base}>
    <path d="M5 12h14" />
  </svg>
);
export const IconClose = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...base}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const IconMenu = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...base}>
    <path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v6M7 3h4M17 3c-1.7 0-3 2.2-3 5s1.3 4 3 4v9" />
  </svg>
);
export const IconReceipt = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...base}>
    <path d="M5 3h14v18l-2.3-1.5L14.3 21 12 19.5 9.7 21l-2.4-1.5L5 21z" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </svg>
);
