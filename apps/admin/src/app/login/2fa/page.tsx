import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { otpauthUri, SESSION_COOKIES, verifySession } from "@mesapay/auth";
import { brand } from "@mesapay/config/brand";
import { prisma } from "@mesapay/db";
import { Card, Wordmark } from "@mesapay/ui";
import { t } from "@/lib/i18n";
import { CodeForm } from "../forms";

export const metadata: Metadata = { title: "Verificação em duas etapas" };

export default async function TwoFactorPage() {
  const pending = await verifySession((await cookies()).get(SESSION_COOKIES["admin-mfa"])?.value, "admin-mfa");
  if (!pending) redirect("/login");
  const user = await prisma.saasUser.findUnique({ where: { id: pending.sub }, select: { email: true, totpSecret: true } });
  if (!user) redirect("/login");

  const setupSecret = user.totpSecret ? null : (pending.setup ?? null);
  const qr = setupSecret
    ? await QRCode.toDataURL(otpauthUri(setupSecret, user.email, brand.name), { margin: 1, width: 200 })
    : null;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Wordmark name={brand.name} />
        </div>
        <h1 className="text-2xl font-semibold">{setupSecret ? t("auth.mfaSetupTitle") : t("auth.mfaTitle")}</h1>
        <p className="mt-1.5 mb-6 text-sm text-muted">{setupSecret ? t("auth.mfaSetupSubtitle") : t("auth.mfaSubtitle")}</p>
        <Card className="flex flex-col gap-5 p-5 sm:p-6">
          {setupSecret && qr ? (
            <div className="flex flex-col items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR Code para o app autenticador" width={200} height={200} className="rounded-lg bg-white p-1" />
              <p className="text-center text-xs text-muted">{t("auth.mfaManualKey")}</p>
              <code data-testid="totp-secret" className="rounded-lg bg-surface-2 px-3 py-1.5 font-mono text-sm break-all select-all">
                {setupSecret}
              </code>
            </div>
          ) : null}
          <CodeForm labels={{ code: t("auth.mfaCode"), verify: t("auth.verify") }} />
        </Card>
      </div>
    </main>
  );
}
