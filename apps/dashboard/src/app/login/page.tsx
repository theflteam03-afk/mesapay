import type { Metadata } from "next";
import { brand } from "@mesapay/config/brand";
import { Card, Wordmark } from "@mesapay/ui";
import { t } from "@/lib/i18n";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#1c1412] text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Wordmark name={brand.name} className="text-white" />
        <div className="relative z-10 max-w-md">
          <p className="font-display text-4xl leading-tight font-semibold">
            Mesas, cozinha e caixa
            <br />
            em uma só tela.
          </p>
          <p className="mt-4 text-white/70">
            Conecte este computador uma vez com a conta do dono. Depois, cada funcionário entra só com o próprio PIN.
          </p>
        </div>
        <TicketDecoration />
      </section>

      <section className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Wordmark name={brand.name} />
          </div>
          <h1 className="text-2xl font-semibold">{t("auth.ownerTitle")}</h1>
          <p className="mt-1.5 mb-6 text-sm text-muted">{t("auth.ownerSubtitle")}</p>
          <Card className="p-5 sm:p-6">
            <LoginForm
              labels={{
                email: t("auth.email"),
                password: t("auth.password"),
                trustDevice: t("auth.trustDevice"),
                signIn: t("auth.signIn"),
                signingIn: t("auth.signingIn"),
              }}
            />
          </Card>
        </div>
      </section>
    </main>
  );
}

/** Ticket térmico decorativo, a lembrar a impressão na cozinha. */
function TicketDecoration() {
  const lines = ["COZINHA · MESA 12", "Cliente: Ana (QR)", "", "2x Picanha na chapa", "   > ao ponto", "1x Batata frita grande", "", "Pedido #0187  20:41"];
  return (
    <div
      aria-hidden
      className="absolute -right-10 bottom-16 w-72 rotate-6 bg-[#f6f1e7] px-6 pt-6 pb-8 font-mono text-[13px] leading-6 text-[#2a2420] shadow-2xl"
      style={{ maskImage: "linear-gradient(to bottom, black 85%, transparent)" }}
    >
      {lines.map((l, i) => (
        <div key={i} className={i === 0 ? "border-b border-dashed border-[#2a2420]/40 pb-2 mb-2 font-bold" : ""}>
          {l || " "}
        </div>
      ))}
    </div>
  );
}
