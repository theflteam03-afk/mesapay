"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconClose } from "./icons";

/**
 * Folha que sobe de baixo (prato, carrinho). Usa o <dialog> nativo: foco preso dentro,
 * Esc fecha, fundo inerte — acessível sem bibliotecas.
 */
export function Sheet({
  open,
  onClose,
  title,
  closeLabel,
  children,
  footer,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      data-testid={testId}
      aria-label={title}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="sheet m-0 mt-auto w-full max-w-none bg-transparent p-0 text-fg backdrop:bg-black/45 sm:mx-auto sm:max-w-md"
    >
      {open ? (
        <div className="flex max-h-[92dvh] flex-col rounded-t-[28px] bg-surface shadow-[0_-8px_40px_rgb(0_0_0/0.18)]">
          <div className="flex items-start justify-between gap-3 px-5 pt-4">
            <span aria-hidden className="mx-auto mb-1 h-1 w-10 rounded-full bg-line" />
          </div>
          <div className="flex items-start justify-between gap-3 px-5 pb-2">
            <h2 className="pt-1 text-xl font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-muted"
            >
              <IconClose className="size-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
          {footer ? <div className="border-t border-line px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

/** Seletor de quantidade − 2 + (alvos de toque de 40 px). */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 30,
  labels,
  testId,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  labels: { decrease: string; increase: string };
  testId?: string;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-line bg-surface" data-testid={testId}>
      <button
        type="button"
        aria-label={labels.decrease}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className="grid size-10 place-items-center rounded-full text-fg disabled:opacity-35"
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
          <path d="M5 12h14" />
        </svg>
      </button>
      <span className="w-7 text-center font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label={labels.increase}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className="grid size-10 place-items-center rounded-full text-fg disabled:opacity-35"
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}
