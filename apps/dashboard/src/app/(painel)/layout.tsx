import type { ReactNode } from "react";
import { brandStyle, themeMode } from "@mesapay/ui";
import { requireOwnerSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import { logoutOwner } from "../login/actions";
import { SideNav } from "./side-nav";

export default async function PainelLayout({ children }: { children: ReactNode }) {
  const session = await requireOwnerSession();
  const r = session.restaurant;

  const nav = [
    { href: "/mesas", label: t("dashboard.nav.tables"), icon: "tables" as const },
    { href: "/menu", label: t("dashboard.nav.menu"), icon: "menu" as const },
    { href: "/funcionarios", label: t("dashboard.nav.staff"), icon: "staff" as const },
    { href: "/dashboard", label: t("dashboard.nav.dashboard"), icon: "dashboard" as const },
    { href: "/cozinha", label: t("dashboard.nav.kitchen"), icon: "kitchen" as const },
    { href: "/configuracoes", label: t("dashboard.nav.settings"), icon: "settings" as const },
  ];

  return (
    <div data-theme={themeMode(r.theme)} style={brandStyle(r.primaryColor)} className="min-h-dvh bg-bg text-fg">
      <div className="flex min-h-dvh flex-col md:flex-row">
        <aside className="flex shrink-0 flex-col border-line bg-surface md:w-60 md:border-r">
          <div className="flex items-center gap-3 px-4 py-4 md:px-5 md:py-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand font-display text-lg font-semibold text-brand-fg">
              {r.name.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-display font-semibold" data-testid="restaurant-name">
                {r.name}
              </p>
              <p className="truncate text-xs text-muted">Plano {r.plan.charAt(0) + r.plan.slice(1).toLowerCase()}</p>
            </div>
          </div>
          <SideNav items={nav} />
          <form action={logoutOwner} className="hidden px-3 pb-4 md:mt-auto md:block">
            <button type="submit" className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-fg">
              {t("common.logout")}
            </button>
          </form>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
