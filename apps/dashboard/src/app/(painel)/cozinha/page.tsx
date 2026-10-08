import { t } from "@/lib/i18n";
import { requireOwnerSession } from "@/lib/session";
import { ComingSoon } from "../coming-soon";

export default async function Page() {
  await requireOwnerSession();
  return <ComingSoon title={t("dashboard.nav.kitchen")} phase={3} description="Tela da cozinha (KDS) e impressão automática dos pedidos." />;
}
