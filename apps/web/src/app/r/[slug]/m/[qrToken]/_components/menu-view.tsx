"use client";

import { useEffect, useRef, useState } from "react";
import { formatBRL } from "@mesapay/core";
import type { MenuCategoryDTO, MenuItemDTO } from "@mesapay/db/types";
import { cn } from "@mesapay/ui";
import type { TableMessages } from "./i18n";

/** Menu: categorias em abas fixas no topo (acompanham a rolagem) e pratos em lista. */
export function MenuView({
  m,
  menu,
  inCart,
  onPick,
}: {
  m: TableMessages;
  menu: MenuCategoryDTO[];
  inCart: Map<string, number>;
  onPick: (item: MenuItemDTO) => void;
}) {
  const [active, setActive] = useState(menu[0]?.id ?? "");
  const tabsRef = useRef<HTMLDivElement>(null);
  const clickScrolling = useRef(false);

  // Destaca a aba da categoria que está visível.
  useEffect(() => {
    const sections = menu.map((c) => document.getElementById(`cat-${c.id}`)).filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver(
      (entries) => {
        if (clickScrolling.current) return;
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id.slice(4));
      },
      { rootMargin: "-120px 0px -65% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [menu]);

  // Mantém a aba ativa visível na faixa horizontal.
  useEffect(() => {
    const el = tabsRef.current?.querySelector<HTMLElement>(`[data-cat="${active}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [active]);

  const goTo = (id: string) => {
    setActive(id);
    clickScrolling.current = true;
    document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => (clickScrolling.current = false), 700);
  };

  return (
    <>
      <nav className="sticky top-0 z-20 border-b border-line bg-bg/92 backdrop-blur-md">
        <div ref={tabsRef} className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 py-2.5" role="tablist">
          {menu.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={active === c.id}
              data-cat={c.id}
              onClick={() => goTo(c.id)}
              className={cn(
                "h-9 shrink-0 rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors",
                active === c.id ? "bg-fg text-bg" : "text-muted hover:bg-surface-2",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </nav>

      <div className="px-4 pb-6">
        {menu.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-16 pt-6">
            <h2 className="mb-1 px-1 text-[1.35rem] font-semibold">{c.name}</h2>
            <ul className="divide-y divide-line">
              {c.items.map((item) => {
                const qty = inCart.get(item.id) ?? 0;
                return (
                  <li key={item.id} data-testid="menu-item" data-item-id={item.id}>
                    <button
                      type="button"
                      disabled={item.soldOut}
                      onClick={() => onPick(item)}
                      className="flex w-full items-start gap-3 px-1 py-4 text-left disabled:cursor-not-allowed"
                    >
                      <div className="min-w-0 flex-1">
                        <p className={cn("font-medium leading-snug", item.soldOut && "text-muted line-through decoration-1")}>{item.name}</p>
                        {item.description ? <p className="mt-1 line-clamp-2 text-sm leading-snug text-muted">{item.description}</p> : null}
                        <p className="mt-2 flex items-center gap-2 text-[15px] tabular-nums">
                          <span className={cn("font-semibold", item.soldOut && "text-muted")}>{formatBRL(item.priceCents)}</span>
                          {item.soldOut ? (
                            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">{m.soldOut}</span>
                          ) : null}
                        </p>
                      </div>
                      <div className="relative shrink-0">
                        {item.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.photoUrl}
                            alt=""
                            loading="lazy"
                            className={cn("size-24 rounded-2xl bg-surface-2 object-cover", item.soldOut && "opacity-45 grayscale")}
                          />
                        ) : null}
                        {qty > 0 ? (
                          <span
                            className={cn(
                              "grid min-w-7 place-items-center rounded-full bg-brand px-1.5 py-0.5 text-sm font-semibold text-brand-fg tabular-nums",
                              item.photoUrl ? "absolute -top-1.5 -right-1.5 shadow-sm" : "",
                            )}
                            aria-label={`${qty}`}
                          >
                            {qty}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
