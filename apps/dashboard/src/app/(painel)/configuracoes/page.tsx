import { t } from "@/lib/i18n";
import { requireOwnerSession } from "@/lib/session";
import { ComingSoon } from "../coming-soon";

export default async function Page() {
  await requireOwnerSession();
  return <ComingSoon title={t("dashboard.nav.settings")} phase={4} description="Dados do restaurante, tema, taxa de serviço, impressoras e conta Mercado Pago." />;
}
