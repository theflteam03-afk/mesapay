"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatBRL } from "@mesapay/core";
import type { BillDTO, CreateOrderResultDTO, JoinResultDTO, MenuCategoryDTO, MenuItemDTO, ServiceErrorDTO } from "@mesapay/db/types";
import { useLiveEvents } from "@mesapay/realtime/client";
import type { ClientEvent } from "@mesapay/realtime/events";
import { Button, cn } from "@mesapay/ui";
import { BillView } from "./_components/bill-view";
import { addLine, cartCount, cartTotal, indexMenu, parseCart, type CartLine } from "./_components/cart";
import { CartSheet } from "./_components/cart-sheet";
import { fill, type TableMessages } from "./_components/i18n";
import { IconMenu, IconReceipt } from "./_components/icons";
import { ItemSheet } from "./_components/item-sheet";
import { MenuView } from "./_components/menu-view";
import { NameScreen } from "./_components/name-screen";
import { getDeviceId, randomId, readStore, writeStore } from "./_components/storage";

type Phase = "checking" | "name" | "ready" | "closed" | "unavailable";
type Tab = "menu" | "bill";

type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: ServiceErrorDTO | null };

async function api<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: body as T };
    return { ok: false, status: res.status, error: (body as ServiceErrorDTO | null) ?? null };
  } catch {
    return { ok: false, status: 0, error: null };
  }
}

export function TableApp({
  qrToken,
  locale,
  restaurant,
  table,
  initialMenu,
  messages: m,
}: {
  qrToken: string;
  locale: string;
  restaurant: { name: string; logoUrl: string | null };
  table: { number: number; label: string | null };
  initialMenu: MenuCategoryDTO[];
  messages: TableMessages;
}) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [joinInfo, setJoinInfo] = useState<JoinResultDTO | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [bill, setBill] = useState<BillDTO | null>(null);
  const [menu, setMenu] = useState(initialMenu);
  const [tab, setTab] = useState<Tab>("menu");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [orderNote, setOrderNote] = useState("");
  const [picked, setPicked] = useState<MenuItemDTO | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const deviceRef = useRef("");
  const sessionRef = useRef<string | null>(null);
  const clientRefRef = useRef<string | null>(null);
  const cartKey = `mp_cart:${qrToken}`;
  const menuIndex = useMemo(() => indexMenu(menu), [menu]);

  const errorText = useCallback(
    (e: ServiceErrorDTO | null, status: number): string => {
      if (status === 0) return m.errors.NETWORK;
      const vars = { item: e?.itemName ?? "", group: e?.group ?? "" };
      switch (e?.error) {
        case "SOLD_OUT":
        case "ITEM_UNAVAILABLE":
        case "OPTION_MIN":
        case "OPTION_MAX":
        case "TOO_MANY_ITEMS":
        case "RATE_LIMITED":
        case "INVALID_NAME":
          return fill(m.errors[e.error], vars);
        case "RESTAURANT_UNAVAILABLE":
          return m.unavailable;
        default:
          return m.errors.GENERIC;
      }
    },
    [m],
  );

  // ───────── carregar dados ─────────

  const loadMenu = useCallback(async () => {
    const r = await api<{ menu: MenuCategoryDTO[] }>(`/api/t/${qrToken}`);
    if (r.ok) setMenu(r.data.menu);
  }, [qrToken]);

  const join = useCallback(
    async (name: string): Promise<boolean> => {
      setJoining(true);
      const r = await api<JoinResultDTO & { deviceId: string }>(`/api/t/${qrToken}/join`, {
        method: "POST",
        body: JSON.stringify({ deviceId: deviceRef.current, name }),
      });
      setJoining(false);
      if (!r.ok) {
        if (r.error?.error === "RESTAURANT_UNAVAILABLE") setPhase("unavailable");
        else {
          setNameError(errorText(r.error, r.status));
          setPhase("name");
        }
        return false;
      }
      writeStore("mp_name", name.trim());
      sessionRef.current = r.data.sessionId;
      setJoinInfo(r.data);
      setNameError(null);
      setPhase("ready");
      return true;
    },
    [qrToken, errorText],
  );

  // Pedidos de conta "em voo": nunca dois ao mesmo tempo; se chegar aviso no meio, repete no fim.
  const billInFlight = useRef(false);
  const billDirty = useRef(false);
  const loadBill = useCallback(async () => {
    const sid = sessionRef.current;
    if (!sid) return;
    if (billInFlight.current) {
      billDirty.current = true;
      return;
    }
    billInFlight.current = true;
    try {
      do {
        billDirty.current = false;
        const r = await api<BillDTO>(`/api/sessions/${sid}`);
        if (sid !== sessionRef.current) return;
        if (r.ok) {
          setBill(r.data);
          if (r.data.status === "CLOSED") setPhase("closed");
        } else if (r.error?.error === "NOT_A_GUEST") {
          // O navegador perdeu o cookie: volta a entrar com o nome guardado.
          const saved = readStore("mp_name");
          if (saved) await join(saved);
          else setPhase("name");
        }
      } while (billDirty.current);
    } finally {
      billInFlight.current = false;
    }
  }, [join]);

  // Arranque: lê a memória do navegador. Com nome guardado, entra direto (sem perguntar nada).
  useEffect(() => {
    deviceRef.current = getDeviceId();
    setCart(parseCart(readStore(cartKey)));
    setCartLoaded(true);
    const saved = readStore("mp_name");
    if (saved) void join(saved);
    else setPhase("name");
  }, [cartKey, join]);

  useEffect(() => {
    if (phase === "ready" && joinInfo) void loadBill();
  }, [phase, joinInfo, loadBill]);

  useEffect(() => {
    if (cartLoaded) writeStore(cartKey, cart.length ? JSON.stringify(cart) : null);
  }, [cart, cartKey, cartLoaded]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  // ───────── tempo real ─────────

  const onLive = useCallback(
    (e: ClientEvent) => {
      if (e.type === "menu.updated") return void loadMenu();
      if (e.type === "resync") void loadMenu();
      void loadBill();
    },
    [loadBill, loadMenu],
  );
  useLiveEvents(phase === "ready" && joinInfo ? `/api/t/${qrToken}/events?session=${joinInfo.sessionId}` : null, onLive);

  // ───────── carrinho e envio ─────────

  const updateCart = (fn: (c: CartLine[]) => CartLine[]) => {
    clientRefRef.current = null; // carrinho mudou → é outro pedido
    setOrderError(null);
    setCart(fn);
  };

  const send = async () => {
    const sid = sessionRef.current;
    if (!sid || !cart.length || sending) return;
    clientRefRef.current ??= randomId();
    setSending(true);
    setOrderError(null);
    const r = await api<CreateOrderResultDTO>(`/api/sessions/${sid}/orders`, {
      method: "POST",
      body: JSON.stringify({
        clientRef: clientRefRef.current,
        note: orderNote.trim() || null,
        lines: cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, optionIds: l.optionIds, note: l.note })),
      }),
    });
    setSending(false);
    if (r.ok) {
      clientRefRef.current = null;
      setCart([]);
      setOrderNote("");
      setCartOpen(false);
      setTab("bill");
      window.scrollTo({ top: 0 });
      setToast(fill(r.data.status === "PENDING_APPROVAL" ? m.sentPending : m.sent, { number: String(r.data.number).padStart(4, "0") }));
      void loadBill();
      return;
    }
    const code = r.error?.error;
    if (code === "SESSION_CLOSED") {
      setCartOpen(false);
      void loadBill();
      return;
    }
    if (code === "SOLD_OUT" || code === "ITEM_UNAVAILABLE") void loadMenu();
    if (r.status !== 0) clientRefRef.current = null; // erro de rede: o reenvio usa o mesmo id (sem duplicar)
    setOrderError(errorText(r.error, r.status));
  };

  // ───────── ecrãs ─────────

  const count = cartCount(cart);
  const inCart = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of cart) map.set(l.menuItemId, (map.get(l.menuItemId) ?? 0) + l.quantity);
    return map;
  }, [cart]);

  if (phase === "checking") {
    return (
      <div className="flex min-h-dvh flex-col" aria-busy="true">
        <header className="bg-brand px-6 pt-[max(env(safe-area-inset-top),3.5rem)] pb-14 text-brand-fg">
          <p className="text-sm font-medium opacity-80">{fill(m.tableLabel, { number: table.number })}</p>
          <h1 className="mt-1 text-[2.6rem] leading-[1.02] font-semibold" data-testid="restaurant-name">
            {restaurant.name}
          </h1>
        </header>
      </div>
    );
  }

  if (phase === "name") {
    return (
      <NameScreen
        m={m}
        restaurant={restaurant}
        tableNumber={table.number}
        initialName={readStore("mp_name") ?? ""}
        busy={joining}
        error={nameError}
        onSubmit={(name) => void join(name)}
      />
    );
  }

  if (phase === "unavailable") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-semibold">{restaurant.name}</h1>
        <p className="text-muted">{m.unavailable}</p>
      </main>
    );
  }

  if (phase === "closed") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center" data-testid="session-closed">
        <p className="text-sm text-muted">{restaurant.name}</p>
        <h1 className="mt-2 text-3xl font-semibold">{m.closedTitle}</h1>
        <p className="mt-3 text-muted">{m.closedHint}</p>
        <Button
          size="lg"
          className="mt-8 w-full"
          disabled={joining}
          onClick={() => {
            setBill(null);
            setTab("menu");
            void join(readStore("mp_name") ?? joinInfo?.displayName ?? "");
          }}
          data-testid="new-session"
        >
          {m.newSession}
        </Button>
      </main>
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md pb-[calc(env(safe-area-inset-bottom)+9rem)]" lang={locale}>
      <header className="bg-brand px-5 pt-[max(env(safe-area-inset-top),1.75rem)] pb-5 text-brand-fg" data-testid="brand-header">
        <p className="text-sm font-medium opacity-80" data-testid="table-number">
          {fill(m.tableLabel, { number: table.number })}
          {table.label ? `, ${table.label}` : ""}
        </p>
        <h1 className="mt-0.5 text-[1.9rem] leading-tight font-semibold" data-testid="restaurant-name">
          {restaurant.name}
        </h1>
      </header>

      <div hidden={tab !== "menu"}>
        <MenuView m={m} menu={menu} inCart={inCart} onPick={setPicked} />
      </div>
      <div hidden={tab !== "bill"}>
        {bill ? (
          <BillView m={m} bill={bill} restaurantName={restaurant.name} onChangeName={() => setPhase("name")} />
        ) : (
          <div className="px-4 pt-5">
            <div className="receipt mx-auto h-72 max-w-md animate-pulse bg-surface" />
          </div>
        )}
      </div>

      {toast ? (
        <div
          role="status"
          className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+9.5rem)] z-30 mx-auto max-w-sm rounded-2xl bg-fg px-4 py-3 text-center text-sm font-medium text-bg shadow-lg"
          data-testid="toast"
        >
          {toast}
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        {count > 0 ? (
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="mb-2 flex h-14 w-full items-center gap-3 rounded-2xl bg-brand px-4 text-brand-fg shadow-[0_10px_30px_-8px_rgb(0_0_0/0.35)]"
            data-testid="open-cart"
          >
            <span className="grid min-w-7 place-items-center rounded-full bg-brand-fg/20 px-1.5 py-0.5 text-sm font-semibold tabular-nums">{count}</span>
            <span className="flex-1 text-left font-semibold">{m.viewCart}</span>
            <span className="font-semibold tabular-nums">{formatBRL(cartTotal(cart, menuIndex))}</span>
          </button>
        ) : null}
        <nav className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-surface/95 p-1 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.25)] backdrop-blur-md">
          {(
            [
              ["menu", m.tabMenu, IconMenu],
              ["bill", m.tabBill, IconReceipt],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key);
                window.scrollTo({ top: 0 });
                if (key === "bill") void loadBill();
              }}
              aria-current={tab === key ? "page" : undefined}
              className={cn(
                "flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors",
                tab === key ? "bg-fg text-bg" : "text-muted",
              )}
              data-testid={`tab-${key}`}
            >
              <Icon className="size-[18px]" />
              <span className="whitespace-nowrap">{label}</span>
            </button>
          ))}
        </nav>
      </div>

      <ItemSheet
        m={m}
        item={picked}
        onClose={() => setPicked(null)}
        onAdd={(line) => {
          updateCart((c) => addLine(c, line));
          setPicked(null);
        }}
      />
      <CartSheet
        m={m}
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        menu={menuIndex}
        orderNote={orderNote}
        onOrderNote={setOrderNote}
        onQuantity={(key, q) => updateCart((c) => (q <= 0 ? c.filter((l) => l.key !== key) : c.map((l) => (l.key === key ? { ...l, quantity: q } : l))))}
        onSend={() => void send()}
        sending={sending}
        error={orderError}
      />
    </div>
  );
}
