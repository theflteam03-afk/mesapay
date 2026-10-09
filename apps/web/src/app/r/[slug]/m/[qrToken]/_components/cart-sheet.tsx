"use client";

import { formatBRL } from "@mesapay/core";
import type { MenuItemDTO } from "@mesapay/db/types";
import { Alert, Button } from "@mesapay/ui";
import { cartTotal, optionNames, unitPrice, type CartLine } from "./cart";
import { fill, type TableMessages } from "./i18n";
import { Sheet, Stepper } from "./sheet";

/** Carrinho: rever, ajustar quantidades e enviar para a cozinha. */
export function CartSheet({
  m,
  open,
  onClose,
  cart,
  menu,
  orderNote,
  onOrderNote,
  onQuantity,
  onSend,
  sending,
  error,
}: {
  m: TableMessages;
  open: boolean;
  onClose: () => void;
  cart: CartLine[];
  menu: Map<string, MenuItemDTO>;
  orderNote: string;
  onOrderNote: (v: string) => void;
  onQuantity: (key: string, qty: number) => void;
  onSend: () => void;
  sending: boolean;
  error: string | null;
}) {
  const total = cartTotal(cart, menu);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={m.cartTitle}
      closeLabel={m.close}
      testId="cart-sheet"
      footer={
        cart.length ? (
          <div className="flex flex-col gap-3">
            {error ? <Alert data-testid="order-error">{error}</Alert> : null}
            <Button size="lg" className="h-14 w-full text-base" onClick={onSend} disabled={sending} data-testid="send-order">
              {sending ? m.sending : fill(m.send, { price: formatBRL(total) })}
            </Button>
          </div>
        ) : null
      }
    >
      {cart.length === 0 ? (
        <p className="py-10 text-center text-muted">{m.emptyCart}</p>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {cart.map((l) => {
              const item = menu.get(l.menuItemId);
              const unavailable = !item || item.soldOut;
              return (
                <li key={l.key} className="flex items-start gap-3 py-4" data-testid="cart-line">
                  <div className="min-w-0 flex-1">
                    <p className={unavailable ? "font-medium text-muted line-through" : "font-medium"}>{item?.name ?? "—"}</p>
                    {item && l.optionIds.length ? <p className="mt-0.5 text-sm text-muted">{optionNames(item, l.optionIds).join(", ")}</p> : null}
                    {l.note ? <p className="mt-0.5 text-sm text-muted italic">“{l.note}”</p> : null}
                    {item?.soldOut ? <p className="mt-1 text-sm font-medium text-danger">{m.soldOut}</p> : null}
                    <p className="mt-1.5 text-sm font-semibold tabular-nums">{item ? formatBRL(unitPrice(item, l.optionIds) * l.quantity) : ""}</p>
                  </div>
                  <Stepper
                    value={l.quantity}
                    onChange={(q) => onQuantity(l.key, q)}
                    min={0}
                    max={30}
                    labels={{ decrease: l.quantity === 1 ? m.remove : m.decrease, increase: m.increase }}
                  />
                </li>
              );
            })}
          </ul>
          <label className="mt-2 block">
            <span className="text-sm font-medium">{m.orderNote}</span>
            <textarea
              value={orderNote}
              onChange={(e) => onOrderNote(e.target.value)}
              maxLength={200}
              rows={2}
              className="mt-1.5 w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-[15px] focus:border-brand focus:ring-4 focus:ring-ring/30 focus:outline-none"
            />
          </label>
        </>
      )}
    </Sheet>
  );
}
