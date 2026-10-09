"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { KdsOrder, KdsPrinter, KitchenBoard } from "@mesapay/db/print";
import type { Messages } from "@mesapay/i18n";
import { useLiveEvents } from "@mesapay/realtime/client";
import type { ClientEvent } from "@mesapay/realtime/events";
import { Button, cn } from "@mesapay/ui";
import { changeOrderStatus, reprint, retryFailed } from "./actions";
import { readPrintHere, useAlertSound, useBrowserPrinting, writePrintHere } from "./use-browser-printing";

type M = Messages["dashboard"]["kitchen"];
type Filter = "ALL" | "KITCHEN" | "BAR";

function fill(t: string, vars: Record<string, string | number>) {
  return t.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Minutos desde o pedido; a cor avisa quando passa de 10 e de 20 min. */
function Elapsed({ since, now, m }: { since: string; now: number; m: M }) {
  const min = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
        min >= 20 ? "bg-danger text-white" : min >= 10 ? "bg-warning/15 text-warning" : "bg-surface-2 text-muted",
      )}
    >
      {min < 1 ? m.justNow : fill(m.minutes, { min })}
    </span>
  );
}

function PrintState({ o, m }: { o: KdsOrder; m: M }) {
  if (o.status === "PENDING_APPROVAL") return null;
  if (o.print.total === 0) return <span className="text-xs text-muted">{m.noPrinter}</span>;
  if (o.print.failed > 0) return <span className="text-xs font-medium text-danger">{m.printFailed}</span>;
  if (o.print.pending > 0) return <span className="text-xs font-medium text-warning">{m.printQueued}</span>;
  return <span className="text-xs text-success">✓ {m.printed}</span>;
}

function OrderCard({ o, filter, now, m, onDone }: { o: KdsOrder; filter: Filter; now: number; m: M; onDone: () => void }) {
  const [pending, start] = useTransition();
  const items = filter === "ALL" ? o.items : o.items.filter((i) => i.station === filter);
  const act = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      onDone();
    });

  const next: { label: string; status: "PREPARING" | "READY" | "DELIVERED" } | null =
    o.status === "SENT" || o.status === "PRINTED"
      ? { label: m.start, status: "PREPARING" }
      : o.status === "PREPARING"
        ? { label: m.ready, status: "READY" }
        : o.status === "READY"
          ? { label: m.delivered, status: "DELIVERED" }
          : null;

  return (
    <article
      className={cn("rounded-2xl border bg-surface p-4 shadow-sm", o.status === "PENDING_APPROVAL" ? "border-info border-dashed" : "border-line")}
      data-testid="kds-order"
      data-order-id={o.id}
      data-status={o.status}
      aria-busy={pending}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-2xl leading-none font-semibold">{fill(m.table, { number: o.tableNumber })}</h3>
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-sm text-muted">
            <span className="font-mono text-xs">#{String(o.number).padStart(4, "0")}</span>
            <span>
              <span className="font-medium text-fg">{o.byName}</span> ({o.channel === "QR" ? m.viaQr : m.viaStaff})
            </span>
          </p>
        </div>
        <Elapsed since={o.createdAt} now={now} m={m} />
      </header>

      <ul className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
        {items.map((i) => (
          <li key={i.id}>
            <p className="font-medium">
              <span className="mr-2 inline-block min-w-7 rounded-md bg-surface-2 px-1.5 text-center tabular-nums">{i.quantity}</span>
              {i.name}
            </p>
            {i.options.length ? <p className="mt-0.5 pl-9 text-sm text-muted">{i.options.join(", ")}</p> : null}
            {i.note ? <p className="mt-0.5 pl-9 text-sm font-medium text-warning">{i.note}</p> : null}
          </li>
        ))}
      </ul>
      {o.note ? (
        <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-sm">
          <span className="font-semibold">{m.orderNote}:</span> {o.note}
        </p>
      ) : null}

      <footer className="mt-4 flex flex-wrap items-center gap-2">
        {o.status === "PENDING_APPROVAL" ? (
          <>
            <span className="w-full text-xs font-medium text-info">{m.awaitingApproval}</span>
            <Button size="sm" onClick={() => act(() => changeOrderStatus(o.id, "SENT"))} disabled={pending} data-testid="kds-accept">
              {m.accept}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => act(() => changeOrderStatus(o.id, "CANCELLED"))} disabled={pending}>
              {m.reject}
            </Button>
          </>
        ) : (
          <>
            {next ? (
              <Button size="sm" onClick={() => act(() => changeOrderStatus(o.id, next.status))} disabled={pending} data-testid="kds-next">
                {next.label}
              </Button>
            ) : null}
            {o.status === "READY" ? (
              <Button size="sm" variant="ghost" onClick={() => act(() => changeOrderStatus(o.id, "PREPARING"))} disabled={pending}>
                {m.backToPreparing}
              </Button>
            ) : null}
            <button
              type="button"
              className="ml-auto text-xs font-medium text-muted underline-offset-4 hover:text-fg hover:underline"
              onClick={() => act(() => reprint(o.id))}
              disabled={pending}
              data-testid="kds-reprint"
            >
              {m.reprint}
            </button>
            <span className="w-full">
              <PrintState o={o} m={m} />
            </span>
          </>
        )}
      </footer>
    </article>
  );
}

function PrinterChip({ p, now, m }: { p: KdsPrinter; now: number; m: M }) {
  const seen = p.lastSeenAt ? new Date(p.lastSeenAt).getTime() : null;
  const online = seen !== null && now - seen <= 30_000;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm",
        online ? "border-success/30 bg-success/10 text-success" : seen === null ? "border-line text-muted" : "border-danger/30 bg-danger/10 text-danger",
      )}
      data-testid="printer-chip"
      data-online={online ? "1" : "0"}
    >
      <span aria-hidden className={cn("size-2 rounded-full", online ? "bg-success" : seen === null ? "bg-muted" : "bg-danger")} />
      <span className="font-medium">{p.name}</span>
      <span className="opacity-80">{online ? m.online : seen === null ? m.neverSeen : m.offline}</span>
      {p.pendingJobs > 0 ? <span className="rounded-full bg-current/15 px-1.5 text-xs tabular-nums">{p.pendingJobs}</span> : null}
    </span>
  );
}

export function KitchenScreen({ initialBoard, m }: { initialBoard: KitchenBoard; m: M }) {
  const [board, setBoard] = useState(initialBoard);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [now, setNow] = useState(() => Date.parse(initialBoard.now));
  const [printHere, setPrintHere] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/kds", { cache: "no-store" });
    if (res.ok) setBoard((await res.json()) as KitchenBoard);
  }, []);

  const browserPrinters = board.printers.filter((p) => p.type === "BROWSER");
  useEffect(() => {
    const saved = readPrintHere();
    if (saved) setPrintHere(saved);
  }, []);
  const { kick, lastTicket } = useBrowserPrinting(printHere && browserPrinters.some((p) => p.id === printHere) ? printHere : null);

  const onLive = useCallback(
    (e: ClientEvent) => {
      if (e.type === "print.updated" || e.type === "order.created") void kick();
      if (e.type === "menu.updated" || e.type === "guest.joined") return;
      void refresh();
    },
    [kick, refresh],
  );
  useLiveEvents("/api/events", onLive, { fallbackMs: 15_000 });

  // Relógio (minutos dos pedidos) e estado online/offline das impressoras.
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  // Alertas: impressora offline com tickets à espera (ou que estava a funcionar e caiu) e tickets que falharam.
  const offline = board.printers.filter((p) => {
    const seen = p.lastSeenAt ? new Date(p.lastSeenAt).getTime() : null;
    const isOffline = seen === null || now - seen > 30_000;
    return isOffline && (p.pendingJobs > 0 || p.stuck || (seen !== null && now - seen < 12 * 3600_000));
  });
  const failed = board.printers.filter((p) => p.failedJobs > 0);
  const alerting = offline.length > 0 || failed.length > 0;
  const sound = useAlertSound(alerting);

  const visible = useMemo(
    () => board.orders.filter((o) => filter === "ALL" || o.items.some((i) => i.station === filter)),
    [board.orders, filter],
  );
  const columns: { key: string; title: string; orders: KdsOrder[] }[] = [
    { key: "new", title: m.colNew, orders: visible.filter((o) => ["PENDING_APPROVAL", "SENT", "PRINTED"].includes(o.status)) },
    { key: "preparing", title: m.colPreparing, orders: visible.filter((o) => o.status === "PREPARING") },
    { key: "ready", title: m.colReady, orders: visible.filter((o) => o.status === "READY") },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">{m.title}</h1>
          <p className="mt-1 text-sm text-muted">{m.subtitle}</p>
        </div>
        <div className="inline-flex rounded-xl border border-line bg-surface p-1" role="group">
          {(
            [
              ["ALL", m.filterAll],
              ["KITCHEN", m.filterKitchen],
              ["BAR", m.filterBar],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={cn("h-9 rounded-lg px-4 text-sm font-medium", filter === key ? "bg-fg text-bg" : "text-muted hover:text-fg")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {alerting ? (
        <div role="alert" className="flex flex-col gap-2 rounded-2xl bg-danger px-5 py-4 text-white shadow-lg" data-testid="printer-alert">
          {offline.map((p) => (
            <p key={`off-${p.id}`} className="font-semibold">
              {fill(m.alertOffline, { name: p.name, count: p.pendingJobs })}
            </p>
          ))}
          {failed.map((p) => (
            <p key={`fail-${p.id}`} className="flex flex-wrap items-center gap-3 font-semibold">
              {fill(m.alertFailed, { name: p.name, count: p.failedJobs, error: p.lastError ?? "" })}
              <button
                type="button"
                className="rounded-lg bg-white/20 px-3 py-1 text-sm hover:bg-white/30"
                onClick={() => void retryFailed(p.id).then(refresh)}
              >
                {m.retry}
              </button>
            </p>
          ))}
          {!sound.enabled ? (
            <button type="button" onClick={sound.enable} className="self-start rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-danger">
              {m.enableSound}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3">
        {board.printers.map((p) => (
          <PrinterChip key={p.id} p={p} now={now} m={m} />
        ))}
        <span className="flex-1" />
        {browserPrinters.length ? (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">{m.printHere}</span>
            <select
              className="h-9 rounded-lg border border-line bg-surface px-2 text-sm"
              value={printHere ?? ""}
              onChange={(e) => {
                const v = e.target.value || null;
                setPrintHere(v);
                writePrintHere(v);
                sound.enable(); // aproveita o clique para desbloquear o som
              }}
              data-testid="print-here"
            >
              <option value="">{m.printHereNone}</option>
              {browserPrinters.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Link href="/configuracoes" className="text-sm font-medium text-brand hover:underline">
          {m.configure}
        </Link>
      </div>
      {printHere ? <p className="-mt-3 text-xs text-muted">{m.printHereHint}</p> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {columns.map((col) => (
          <section key={col.key} className="flex min-w-0 flex-col gap-3 rounded-2xl bg-surface-2/60 p-3" data-testid={`kds-col-${col.key}`}>
            <h2 className="flex items-center justify-between px-1 text-lg font-semibold">
              {col.title}
              <span className="rounded-full bg-surface px-2.5 py-0.5 text-sm tabular-nums text-muted">{col.orders.length}</span>
            </h2>
            {col.orders.length === 0 ? <p className="px-1 py-6 text-center text-sm text-muted">{m.empty}</p> : null}
            {col.orders.map((o) => (
              <OrderCard key={o.id} o={o} filter={filter} now={now} m={m} onDone={refresh} />
            ))}
          </section>
        ))}
      </div>

      {lastTicket ? (
        <details className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">{m.printed}</summary>
          <pre className="mt-3 overflow-x-auto font-mono text-xs leading-snug" data-testid="last-ticket">
            {lastTicket}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
