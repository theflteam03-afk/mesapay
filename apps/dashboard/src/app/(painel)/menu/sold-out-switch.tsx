"use client";

import { useOptimistic, useTransition } from "react";
import { cn } from "@mesapay/ui";
import { setSoldOut } from "./actions";

/** Interruptor "Esgotado": um toque, efeito imediato no celular dos clientes. */
export function SoldOutSwitch({ itemId, itemName, soldOut, label }: { itemId: string; itemName: string; soldOut: boolean; label: string }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useOptimistic(soldOut);
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm select-none">
      <span className={cn("font-medium", value ? "text-danger" : "text-muted")}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={`${label}: ${itemName}`}
        disabled={pending}
        data-testid="sold-out-switch"
        onClick={() =>
          start(async () => {
            setValue(!value);
            await setSoldOut(itemId, !value);
          })
        }
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60",
          value ? "bg-danger" : "bg-surface-2 ring-1 ring-line ring-inset",
        )}
      >
        <span
          aria-hidden
          className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform", value && "translate-x-5")}
        />
      </button>
    </label>
  );
}
