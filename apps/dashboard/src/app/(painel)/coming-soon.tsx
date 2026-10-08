import { Card, PageHeader } from "@mesapay/ui";
import { t } from "@/lib/i18n";

export function ComingSoon({ title, phase, description }: { title: string; phase: number; description: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card className="max-w-xl p-6">
        <p className="font-medium">{t("dashboard.comingSoon", { phase })}</p>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </Card>
    </>
  );
}
