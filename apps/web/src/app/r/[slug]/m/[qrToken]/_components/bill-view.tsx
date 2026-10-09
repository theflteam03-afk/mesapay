"use client";

import { formatBRL } from "@mesapay/core";
import type { BillDTO, OrderStatusDTO } from "@mesapay/db/types";
import { cn } from "@mesapay/ui";
import { fill, type TableMessages } from "./i18n";

const statusTone: Record<OrderStatusDTO, string> = {
  PENDING_APPROVAL: "text-info",
  SENT: "text-muted",
  PRINTED: "text-muted",
  PREPARING: "text-warning",
  READY: "text-success",
  DELIVERED: "text-muted",
  CANCELLED: "text-danger",
};

/**
 * Conta da mesa como um recibo: quem pediu o quê, estado de cada pedido,
 * total, pago e quanto falta. Atualiza sozinha (tempo real).
 */
export function BillView({
  m,
  bill,
  restaurantName,
  onChangeName,
}: {
  m: TableMessages;
  bill: BillDTO;
  restaurantName: string;
  onChangeName: () => void;
}) {
  const paidPct = bill.totalCents > 0 ? Math.min(100, Math.round((bill.paidCents / bill.totalCents) * 100)) : 0;
  const empty = bill.groups.length === 0;

  return (
    <div className="px-4 pt-5 pb-8">
      <article className="receipt mx-auto max-w-md bg-surface px-5 pt-6 pb-9 shadow-[0_1px_0_var(--border),0_10px_30px_-12px_rgb(0_0_0/0.18)]" data-testid="bill">
        <header className="text-center">
          <h2 className="text-lg font-semibold">{restaurantName}</h2>
          <p className="mt-0.5 text-sm font-medium">{fill(m.tableLabel, { number: bill.tableNumber })}</p>
          <p className="mt-0.5 text-xs text-muted" data-testid="bill-people">
            {fill(m.people, { count: bill.guests.length })}: {bill.guests.map((g) => g.name).join(", ")}
          </p>
        </header>

        <section className="mt-6" aria-label={m.total}>
          <div className="flex items-end justify-between gap-3">
            <span className="text-sm text-muted">{m.total}</span>
            <span className="font-display text-3xl font-semibold tabular-nums" data-testid="bill-total">
              {formatBRL(bill.totalCents)}
            </span>
          </div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={paidPct}
          >
            <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${paidPct}%` }} />
          </div>
          <dl className="mt-2 flex justify-between text-sm tabular-nums">
            <div className="flex gap-1.5">
              <dt className="text-muted">{m.paid}</dt>
              <dd className="font-medium">{formatBRL(bill.paidCents)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-muted">{m.remaining}</dt>
              <dd className="font-semibold" data-testid="bill-remaining">
                {formatBRL(bill.remainingCents)}
              </dd>
            </div>
          </dl>
        </section>

        <div className="receipt-rule my-5" />

        {empty ? (
          <p className="py-6 text-center text-sm text-muted" data-testid="bill-empty">
            {m.emptyBill}
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {bill.groups.map((g) => (
              <section key={g.guestId ?? "staff"} data-testid="bill-group" data-me={g.isMe ? "1" : undefined}>
                <h3 className="flex items-baseline justify-between gap-3 font-sans text-[15px] font-semibold tracking-normal">
                  <span className="flex items-baseline gap-2">
                    {g.name ?? m.staffOrders}
                    {g.isMe ? <span className="rounded-full bg-brand px-2 py-px text-[11px] font-semibold text-brand-fg">{m.you}</span> : null}
                  </span>
                  <span className="tabular-nums">{formatBRL(g.subtotalCents)}</span>
                </h3>
                <ul className="mt-2 flex flex-col gap-2.5">
                  {g.items.map((i) => (
                    <li key={i.id} className={cn("text-sm", i.cancelled && "opacity-50")} data-testid="bill-item">
                      <div className="flex items-baseline gap-3">
                        <span className="w-6 shrink-0 text-muted tabular-nums">{i.quantity}×</span>
                        <span className={cn("min-w-0 flex-1", i.cancelled && "line-through")}>{i.name}</span>
                        <span className="tabular-nums">{formatBRL(i.totalCents)}</span>
                      </div>
                      {i.options.length || i.note ? (
                        <p className="mt-0.5 pl-9 text-xs text-muted">
                          {[...i.options, ...(i.note ? [`“${i.note}”`] : [])].join(", ")}
                        </p>
                      ) : null}
                      <p className={cn("mt-0.5 pl-9 text-xs font-medium", statusTone[i.status])} data-testid="bill-item-status">
                        {m.orderStatus[i.status]}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <div className="receipt-rule my-5" />

        <dl className="flex flex-col gap-1.5 text-sm tabular-nums">
          <div className="flex justify-between">
            <dt className="text-muted">{m.subtotal}</dt>
            <dd>{formatBRL(bill.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{fill(m.serviceFee, { pct: bill.serviceFeePct })}</dt>
            <dd>{formatBRL(bill.serviceFeeCents)}</dd>
          </div>
          <div className="mt-1 flex justify-between text-base font-semibold">
            <dt>{m.total}</dt>
            <dd>{formatBRL(bill.totalCents)}</dd>
          </div>
        </dl>
      </article>

      <p className="mt-6 text-center text-sm text-muted">{m.howToPay}</p>
      {bill.me ? (
        <p className="mt-4 text-center">
          <button type="button" onClick={onChangeName} className="text-sm text-muted underline underline-offset-4" data-testid="change-name">
            {fill(m.notYou, { name: bill.me.name })}
          </button>
        </p>
      ) : null}
    </div>
  );
}
