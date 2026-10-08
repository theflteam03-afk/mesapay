"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createMemoryRateLimiter,
  SESSION_COOKIES,
  SESSION_TTL_SECONDS,
  sessionCookieOptions,
  signSession,
  verifyPassword,
} from "@mesapay/auth";
import { prisma } from "@mesapay/db";
import { t } from "@/lib/i18n";
import { clientIp } from "@/lib/request";

export interface LoginState {
  error?: string;
  email?: string;
}

// 10 tentativas por IP+e-mail a cada 15 minutos.
const limiter = createMemoryRateLimiter({ max: 10, windowMs: 15 * 60_000 });

export async function loginOwner(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const trusted = form.get("trusted") === "on";

  if (!email || !password) return { error: t("auth.invalidCredentials"), email };

  const ip = await clientIp();
  const rl = limiter.hit(`${ip}:${email}`);
  if (!rl.ok) return { error: t("auth.tooManyAttempts", { seconds: Math.ceil(rl.retryAfterMs / 1000) }), email };

  const owner = await prisma.ownerUser.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, restaurantId: true, restaurant: { select: { status: true } } },
  });
  const ok = await verifyPassword(password, owner?.passwordHash);
  if (!owner || !ok) {
    await prisma.auditLog.create({
      data: { actorType: "OWNER", actorId: owner?.id ?? email, restaurantId: owner?.restaurantId ?? null, action: "owner.login.failed", ip },
    });
    return { error: t("auth.invalidCredentials"), email };
  }
  if (owner.restaurant.status === "SUSPENDED" || owner.restaurant.status === "DISABLED") {
    return { error: t("auth.restaurantSuspended"), email };
  }

  limiter.reset(`${ip}:${email}`);
  const ttl = trusted ? SESSION_TTL_SECONDS.ownerTrusted : SESSION_TTL_SECONDS.ownerDefault;
  const token = await signSession({ sub: owner.id, kind: "owner", rid: owner.restaurantId }, ttl);
  // "Dispositivo confiável": cookie persistente de 30 dias. Senão, cookie de sessão do navegador.
  (await cookies()).set(SESSION_COOKIES.owner, token, sessionCookieOptions(trusted ? ttl : undefined));

  await prisma.$transaction([
    prisma.ownerUser.update({ where: { id: owner.id }, data: { lastLoginAt: new Date() } }),
    prisma.auditLog.create({
      data: { actorType: "OWNER", actorId: owner.id, restaurantId: owner.restaurantId, action: "owner.login", dataJson: { trusted }, ip },
    }),
  ]);

  redirect("/mesas");
}

export async function logoutOwner(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIES.owner);
  redirect("/login");
}
