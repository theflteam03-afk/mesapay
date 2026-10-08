import { t } from "@/lib/i18n";
import { requireOwnerSession } from "@/lib/session";
import { ComingSoon } from "../coming-soon";

export default async function Page() {
  await requireOwnerSession();
  return <ComingSoon title={t("dashboard.nav.dashboard")} phase={6} description="Faturamento, ranking de garçons, mapa de mesas e exportação para Excel e PDF." />;
}
