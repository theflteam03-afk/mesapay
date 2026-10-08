import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { brand } from "@mesapay/config/brand";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000"),
  title: { default: `${brand.name} — cardápio digital, pedidos e pagamento por QR Code`, template: `%s · ${brand.name}` },
  description: brand.tagline,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
