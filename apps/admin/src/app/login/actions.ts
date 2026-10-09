"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createRateLimiter,
  generateTotpSecret,
  SESSION_COOKIES,
  SESSION_TTL_SECONDS,
  sessionCookieOptions,
  signSession,
  verifyPassword,
  verifySession,
  verifyTotp,
} from "@mesapay/auth";
import { prisma } from "@mesapay/db";
import { t } from "@/lib/i18n";
import { clientIp } from "@/lib/request";

export interface FormState {
  error?: string;
  email?: string;
}

const passwordLimiter = createRateLimiter({ max: 8, windowMs: 15 * 60_000, prefix: "admin-login" });
const codeLimiter = createRateLimiter({ max: 6, windowMs: 10 * 60_000, prefix: "admin-2fa" });

/** Passo 1: e-mail + senha → cookie temporário "falta o 2FA" (10 min). */
export async function loginAdmin(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: t("auth.invalidCredentials"), email };

  const ip = await clientIp();
  const rl = await passwordLimiter.hit(`${ip}:${email}`);
  if (!rl.ok) return { error: t("auth.tooManyAttempts", { seconds: Math.ceil(rl.retryAfterMs / 1000) }), email };

  const user = await prisma.saasUser.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash);
  if (!user || !ok || !user.active) {
    await prisma.auditLog.create({ data: { actorType: "SAAS_USER", actorId: user?.id ?? email, action: "admin.login.failed", ip } });
    return { error: t("auth.invalidCredentials"), email };
  }

  await passwordLimiter.reset(`${ip}:${email}`);
  // Sem 2FA configurado: gera um segredo novo, que só fica gravado depois de confirmado.
  const setup = user.totpSecret ? undefined : generateTotpSecret();
  const token = await signSession({ sub: user.id, kind: "admin-mfa", ...(setup ? { setup } : {}) }, SESSION_TTL_SECONDS.adminMfa);
  (await cookies()).set(SESSION_COOKIES["admin-mfa"], token, sessionCookieOptions(SESSION_TTL_SECONDS.adminMfa));
  redirect("/login/2fa");
}

/** Passo 2: código TOTP (e, no primeiro acesso, ativação do 2FA). */
export async function verifyAdminCode(_prev: FormState, form: FormData): Promise<FormState> {
  const jar = await cookies();
  const pending = await verifySession(jar.get(SESSION_COOKIES["admin-mfa"])?.value, "admin-mfa");
  if (!pending) redirect("/login");

  const ip = await clientIp();
  const rl = await codeLimiter.hit(pending.sub);
  if (!rl.ok) return { error: t("auth.tooManyAttempts", { seconds: Math.ceil(rl.retryAfterMs / 1000) }) };

  const user = await prisma.saasUser.findUnique({ where: { id: pending.sub } });
  if (!user?.active) redirect("/login");

  const secret = user.totpSecret ?? pending.setup;
  const code = String(form.get("code") ?? "");
  if (!secret || !verifyTotp(secret, code)) {
    await prisma.auditLog.create({ data: { actorType: "SAAS_USER", actorId: user.id, action: "admin.2fa.failed", ip } });
    return { error: t("auth.mfaInvalid") };
  }

  await codeLimiter.reset(pending.sub);
  const activated = !user.totpSecret;
  await prisma.$transaction([
    prisma.saasUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), ...(activated ? { totpSecret: secret } : {}) },
    }),
    prisma.auditLog.create({
      data: { actorType: "SAAS_USER", actorId: user.id, action: activated ? "admin.2fa.enabled" : "admin.login", ip },
    }),
  ]);

  const token = await signSession({ sub: user.id, kind: "admin" }, SESSION_TTL_SECONDS.admin);
  jar.set(SESSION_COOKIES.admin, token, sessionCookieOptions(SESSION_TTL_SECONDS.admin));
  jar.delete(SESSION_COOKIES["admin-mfa"]);
  redirect("/");
}

export async function logoutAdmin(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIES.admin);
  jar.delete(SESSION_COOKIES["admin-mfa"]);
  redirect("/login");
}
