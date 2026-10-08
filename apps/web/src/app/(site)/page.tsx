import Link from "next/link";
import { Check } from "lucide-react";
import { brand } from "@mesapay/config/brand";
import { PLANS } from "@mesapay/config/plans";
import { formatBRL } from "@mesapay/core";
import { createTranslator } from "@mesapay/i18n";
import { cn, Wordmark } from "@mesapay/ui";

// Página estática (SSG). A landing completa (secções, depoimentos, FAQ) chega na Fase 7.
export const dynamic = "force-static";

const t = createTranslator("pt-BR");

export default function Home() {
  return (
    <div data-theme="light" className="bg-bg">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Wordmark name={brand.name} />
        <nav className="flex items-center gap-1 text-sm">
          <a href="#planos" className="rounded-lg px-3 py-2 text-muted hover:text-fg">
            Planos
          </a>
          <a
            href={process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "http://localhost:3001"}
            className="rounded-lg border border-line bg-surface px-3 py-2 font-medium hover:bg-surface-2"
          >
            Entrar
          </a>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-16">
        <div>
          <h1 className="text-4xl leading-[1.05] font-semibold text-balance sm:text-5xl lg:text-6xl">{t("site.heroTitle")}</h1>
          <p className="mt-5 max-w-xl text-lg text-muted text-pretty">{t("site.heroSubtitle")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#planos" className="inline-flex h-12 items-center rounded-xl bg-brand px-6 font-medium text-brand-fg shadow-sm hover:brightness-110">
              {t("site.seePlans")}
            </a>
            <a
              href={`mailto:${brand.supportEmail}?subject=Demonstra%C3%A7%C3%A3o%20${brand.name}`}
              className="inline-flex h-12 items-center rounded-xl border border-line bg-surface px-6 font-medium hover:bg-surface-2"
            >
              {t("site.bookDemo")}
            </a>
          </div>
        </div>
        <PhoneMockup />
      </section>

      <section id="planos" className="border-t border-line bg-surface py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-3xl font-semibold sm:text-4xl">{t("site.plansTitle")}</h2>
          <p className="mt-2 text-muted">14 dias grátis, sem cartão. Cancele quando quiser.</p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-2xl border bg-bg p-6",
                  plan.highlight ? "border-brand shadow-[0_0_0_1px_var(--brand)]" : "border-line",
                )}
              >
                {plan.highlight ? (
                  <span className="absolute -top-3 left-6 rounded-full bg-brand px-3 py-0.5 text-xs font-medium text-brand-fg">
                    {t("site.popular")}
                  </span>
                ) : null}
                <h3 className="text-xl font-semibold">{plan.name}</h3>
                <p className="mt-3">
                  <span className="font-display text-4xl font-semibold">{formatBRL(plan.monthlyCents).replace(",00", "")}</span>
                  <span className="text-muted">{t("site.perMonth")}</span>
                </p>
                <p className="text-sm text-muted">ou {formatBRL(plan.annualMonthlyCents).replace(",00", "")}/mês no plano anual</p>
                <ul className="mt-6 flex flex-col gap-2.5 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={2.5} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-10 text-sm text-muted sm:px-6">
        <Wordmark name={brand.name} className="text-base" />
        <p>
          © {new Date().getFullYear()} {brand.name} ·{" "}
          <Link href={`mailto:${brand.supportEmail}`} className="hover:text-fg">
            {brand.supportEmail}
          </Link>
        </p>
      </footer>
    </div>
  );
}

function PhoneMockup() {
  const items = [
    ["Picanha na chapa", "R$ 129"],
    ["Caipirinha", "R$ 22"],
    ["Bolinho de bacalhau", "R$ 39"],
  ];
  return (
    <div aria-hidden className="relative mx-auto w-[280px] sm:w-[300px]">
      <div className="rounded-[2.5rem] border-[10px] border-[#1c1917] bg-[#1c1917] shadow-2xl">
        <div className="overflow-hidden rounded-[1.8rem] bg-bg">
          <div className="bg-brand px-5 pt-8 pb-5 text-brand-fg">
            <p className="text-xs opacity-80">Mesa 12</p>
            <p className="font-display text-xl font-semibold">Boteco da Esquina</p>
          </div>
          <div className="flex gap-2 px-4 pt-4 text-xs">
            {["Entradas", "Pratos", "Drinks"].map((c, i) => (
              <span key={c} className={cn("rounded-full px-3 py-1", i === 1 ? "bg-fg text-bg" : "bg-surface-2 text-muted")}>
                {c}
              </span>
            ))}
          </div>
          <ul className="flex flex-col gap-2 p-4">
            {items.map(([name, price]) => (
              <li key={name} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5">
                <span className="size-11 rounded-lg bg-surface-2" />
                <span className="flex-1 text-sm font-medium">{name}</span>
                <span className="text-sm tabular-nums">{price}</span>
              </li>
            ))}
          </ul>
          <div className="m-4 mt-1 rounded-xl bg-fg px-4 py-3 text-center text-sm font-medium text-bg">Conta da mesa · R$ 190,00</div>
        </div>
      </div>
    </div>
  );
}
