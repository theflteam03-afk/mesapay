import type { Metadata } from "next";
import { brand } from "@mesapay/config/brand";
import { Card, Wordmark } from "@mesapay/ui";
import { t } from "@/lib/i18n";
import { PasswordForm } from "./forms";

export const metadata: Metadata = { title: "Entrar" };

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-between">
          <Wordmark name={brand.name} />
          <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-muted">Admin</span>
        </div>
        <h1 className="text-2xl font-semibold">{t("auth.adminTitle")}</h1>
        <p className="mt-1.5 mb-6 text-sm text-muted">{t("auth.adminSubtitle")}</p>
        <Card className="p-5 sm:p-6">
          <PasswordForm
            labels={{ email: t("auth.email"), password: t("auth.password"), signIn: t("auth.signIn"), signingIn: t("auth.signingIn") }}
          />
        </Card>
      </div>
    </main>
  );
}
