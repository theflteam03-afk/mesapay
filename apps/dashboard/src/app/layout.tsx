import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "@mesapay/config/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `Painel · ${brand.name}`, template: `%s · ${brand.name}` },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
