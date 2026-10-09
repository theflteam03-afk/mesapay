import type { Metadata } from "next";
import { appUrls } from "@mesapay/config/env";
import { listPrinters } from "@mesapay/db/print";
import { getDictionary } from "@mesapay/i18n";
import { Card, PageHeader } from "@mesapay/ui";
import { t } from "@/lib/i18n";
import { requireOwnerSession } from "@/lib/session";
import { PrinterForm, PrinterKeyActions } from "./printer-form";

export const metadata: Metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

/** Texto de instalação de cada tipo de impressora (o que colar onde). */
function setupText(type: string, key: string, dashboardUrl: string): string | null {
  switch (type) {
    case "LOCAL_AGENT":
      return `MESAPAY_API_URL=${dashboardUrl}\nMESAPAY_PRINTERS=${key}\npnpm --filter @mesapay/print-agent start`;
    case "CLOUDPRNT":
      return `${dashboardUrl}/api/print/cloudprnt/${key}`;
    case "EPSON_SDP":
      return `${dashboardUrl}/api/print/epson/${key}`;
    default:
      return null;
  }
}

export default async function ConfiguracoesPage() {
  const { restaurant } = await requireOwnerSession();
  const printers = await listPrinters(restaurant.id);
  const m = getDictionary("pt-BR").dashboard.printers;
  const stations = { KITCHEN: t("dashboard.menu.kitchen"), BAR: t("dashboard.menu.bar") };
  const dashboardUrl = appUrls.dashboard();

  return (
    <>
      <PageHeader title={t("dashboard.nav.settings")} subtitle={t("dashboard.settingsSoon")} />
      <section aria-labelledby="printers-title" className="flex max-w-4xl flex-col gap-4">
        <div>
          <h2 id="printers-title" className="text-xl font-semibold">
            {m.title}
          </h2>
          <p className="mt-1 text-sm text-muted">{m.subtitle}</p>
        </div>

        {printers.length === 0 ? <p className="text-sm text-muted">{m.empty}</p> : null}
        {printers.map((p) => {
          const setup = setupText(p.type, p.printerKey, dashboardUrl);
          return (
            <Card key={p.id} className="flex flex-col gap-4 p-5" data-testid="printer-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <p className="text-sm text-muted">
                  {m.lastSeen}: {p.lastSeenAt ? p.lastSeenAt.toLocaleString("pt-BR", { timeZone: restaurant.timezone }) : m.never}
                </p>
              </div>
              <p className="text-sm">{m.howto[p.type]}</p>
              <PrinterKeyActions m={m} printerId={p.id} setup={setup} />
              <details>
                <summary className="cursor-pointer text-sm font-medium text-brand">{m.edit}</summary>
                <div className="mt-3">
                  <PrinterForm m={m} printer={{ id: p.id, name: p.name, station: p.station, type: p.type, address: p.address, width: p.width }} stationLabels={stations} />
                </div>
              </details>
            </Card>
          );
        })}

        <Card className="p-5">
          <h3 className="mb-3 font-semibold">{m.add}</h3>
          <PrinterForm m={m} stationLabels={stations} />
        </Card>
      </section>
    </>
  );
}
