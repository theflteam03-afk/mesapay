"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChefHat, LayoutGrid, LineChart, Settings, UtensilsCrossed, Users } from "lucide-react";
import { cn } from "@mesapay/ui";

const ICONS = {
  tables: LayoutGrid,
  menu: UtensilsCrossed,
  staff: Users,
  dashboard: LineChart,
  kitchen: ChefHat,
  settings: Settings,
};

export function SideNav({ items }: { items: { href: string; label: string; icon: keyof typeof ICONS }[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:pb-0">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-brand/10 text-brand" : "text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Icon className="size-[18px]" strokeWidth={2} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
