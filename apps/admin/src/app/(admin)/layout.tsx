import type { ReactNode } from "react";
import { brand } from "@mesapay/config/brand";
import { Wordmark } from "@mesapay/ui";
import { t } from "@/lib/i18n";
import { requireAdminSession } from "@/lib/session";
import { logoutAdmin } from "../login/actions";
import { AdminNav } from "./admin-nav";

const ROLE_LABEL = { SUPER_ADMIN: "Super admin", SUPPORT: "Suporte", SALES: "Comercial" } as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireAdminSession();
  const nav = [
    { href: "/", label: t("admin.nav.restaurants") },
    { href: "/dashboard", label: t("admin.nav.dashboard") },
    { href: "/planos", label: t("admin.nav.plans") },
    { href: "/depoimentos", label: t("admin.nav.testimonials") },
    { href: "/auditoria", label: t("admin.nav.audit") },
  ];
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Wordmark name={brand.name} className="text-lg" />
          <AdminNav items={nav} />
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline" data-testid="admin-user">
              {user.name} · {ROLE_LABEL[user.role]}
            </span>
            <form action={logoutAdmin}>
              <button type="submit" className="rounded-lg px-2.5 py-1.5 text-muted hover:bg-surface-2 hover:text-fg">
                {t("common.logout")}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
