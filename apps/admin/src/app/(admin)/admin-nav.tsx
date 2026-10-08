"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@mesapay/ui";

export function AdminNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 flex max-w-full gap-1 overflow-x-auto">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium",
              active ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
