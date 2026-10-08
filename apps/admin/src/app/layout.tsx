import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "@mesapay/config/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `Admin · ${brand.name}`, template: `%s · Admin ${brand.name}` },
  robots: { index: false, follow: false },
};

// O admin segue o tema do sistema operativo (claro/escuro).
const themeScript = `try{var m=window.matchMedia('(prefers-color-scheme: dark)');var a=function(){document.documentElement.dataset.theme=m.matches?'dark':'light'};a();m.addEventListener('change',a)}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
