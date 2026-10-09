"use client";

import { useState } from "react";
import { formatBRL } from "@mesapay/core";
import type { MenuItemDTO, MenuOptionGroupDTO } from "@mesapay/db/types";
import { Button, cn } from "@mesapay/ui";
import { unitPrice } from "./cart";
import { fill, type TableMessages } from "./i18n";
import { Sheet, Stepper } from "./sheet";

function groupRule(m: TableMessages, g: MenuOptionGroupDTO): string {
  if (g.minSelect === 1 && g.maxSelect === 1) return m.chooseOne;
  if (g.minSelect === 0) return fill(m.chooseUpTo, { max: g.maxSelect });
  return fill(m.chooseBetween, { min: g.minSelect, max: g.maxSelect });
}

/** Detalhe do prato: opções (com mínimo/máximo), observação e quantidade. */
export function ItemSheet({
  m,
  item,
  onClose,
  onAdd,
}: {
  m: TableMessages;
  item: MenuItemDTO | null;
  onClose: () => void;
  onAdd: (line: { menuItemId: string; quantity: number; optionIds: string[]; note: string | null }) => void;
}) {
  return (
    <Sheet open={!!item} onClose={onClose} title={item?.name ?? ""} closeLabel={m.close} testId="item-sheet">
      {item ? <ItemForm key={item.id} m={m} item={item} onAdd={onAdd} /> : null}
    </Sheet>
  );
}

function ItemForm({
  m,
  item,
  onAdd,
}: {
  m: TableMessages;
  item: MenuItemDTO;
  onAdd: (line: { menuItemId: string; quantity: number; optionIds: string[]; note: string | null }) => void;
}) {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<Record<string, string[]>>(() =>
    // Grupo obrigatório de 1 escolha começa sem nada marcado: o cliente decide (ex.: ponto da carne).
    Object.fromEntries(item.optionGroups.map((g) => [g.id, [] as string[]])),
  );

  const toggle = (g: MenuOptionGroupDTO, optionId: string) => {
    setPicked((prev) => {
      const cur = prev[g.id] ?? [];
      if (g.maxSelect === 1) return { ...prev, [g.id]: cur[0] === optionId && g.minSelect === 0 ? [] : [optionId] };
      if (cur.includes(optionId)) return { ...prev, [g.id]: cur.filter((id) => id !== optionId) };
      if (cur.length >= g.maxSelect) return prev;
      return { ...prev, [g.id]: [...cur, optionId] };
    });
  };

  const optionIds = Object.values(picked).flat();
  const missing = item.optionGroups.filter((g) => (picked[g.id]?.length ?? 0) < g.minSelect);
  const price = unitPrice(item, optionIds) * qty;

  return (
    <div className="flex flex-col gap-6">
      {item.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.photoUrl} alt="" className="aspect-[4/3] w-full rounded-2xl bg-surface-2 object-cover" />
      ) : null}
      {item.description ? <p className="text-[15px] leading-relaxed text-muted">{item.description}</p> : null}

      {item.optionGroups.map((g) => {
        const cur = picked[g.id] ?? [];
        const single = g.maxSelect === 1;
        const full = !single && cur.length >= g.maxSelect;
        return (
          <fieldset key={g.id} data-testid="option-group">
            <legend className="flex w-full items-baseline justify-between gap-3">
              <span className="font-semibold">{g.name}</span>
              <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted">
                {groupRule(m, g)}
                {g.minSelect > 0 ? (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5",
                      cur.length < g.minSelect ? "bg-brand text-brand-fg" : "bg-surface-2 text-muted",
                    )}
                  >
                    {m.required}
                  </span>
                ) : null}
              </span>
            </legend>
            <div className="mt-2 divide-y divide-line rounded-2xl border border-line">
              {g.options.map((o) => {
                const checked = cur.includes(o.id);
                return (
                  <label
                    key={o.id}
                    className={cn("flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2.5", !checked && full && "opacity-45")}
                  >
                    <input
                      type={single ? "radio" : "checkbox"}
                      name={`g-${g.id}`}
                      checked={checked}
                      disabled={!checked && full}
                      onChange={() => toggle(g, o.id)}
                      onClick={() => {
                        // Rádio opcional: tocar de novo desmarca.
                        if (single && checked && g.minSelect === 0) toggle(g, o.id);
                      }}
                      className="size-5 accent-[var(--brand)]"
                    />
                    <span className="flex-1">{o.name}</span>
                    {o.priceCents > 0 ? <span className="text-sm text-muted tabular-nums">+ {formatBRL(o.priceCents)}</span> : null}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={140}
        rows={2}
        placeholder={m.notePlaceholder}
        className="w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-[15px] placeholder:text-muted/70 focus:border-brand focus:ring-4 focus:ring-ring/30 focus:outline-none"
        data-testid="item-note"
      />

      <div className="sticky bottom-0 -mx-5 flex items-center gap-3 border-t border-line bg-surface px-5 pt-3 pb-[max(env(safe-area-inset-bottom),0.25rem)]">
        <Stepper value={qty} onChange={setQty} min={1} max={30} labels={{ decrease: m.decrease, increase: m.increase }} />
        <Button
          size="lg"
          className="h-12 flex-1"
          disabled={missing.length > 0}
          onClick={() => onAdd({ menuItemId: item.id, quantity: qty, optionIds, note: note.trim() || null })}
          data-testid="add-to-cart"
        >
          {fill(m.addToOrder, { price: formatBRL(price) })}
        </Button>
      </div>
    </div>
  );
}
