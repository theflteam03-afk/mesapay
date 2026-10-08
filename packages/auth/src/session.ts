import { jwtVerify, SignJWT } from "jose";
import { getSecret } from "./secrets";

/**
 * Sessões em cookie httpOnly assinadas (JWT HS256). Edge-safe: pode ser usado no middleware.
 *
 *  - owner        dispositivo do restaurante logado com o e-mail do dono (30 dias se "confiável")
 *  - admin        equipa SaaS, já passou o 2FA (12 h)
 *  - admin-mfa    passou a senha mas ainda falta o código 2FA (10 min)
 */
export type SessionKind = "owner" | "admin" | "admin-mfa";

export interface SessionPayload {
  sub: string;
  kind: SessionKind;
  /** restaurante (só sessões owner) */
  rid?: string;
  /** segredo TOTP ainda por confirmar (só admin-mfa, durante a ativação do 2FA) */
  setup?: string;
}

export const SESSION_COOKIES: Record<SessionKind, string> = {
  owner: "mp_owner",
  admin: "mp_admin",
  "admin-mfa": "mp_admin_mfa",
};

export const SESSION_TTL_SECONDS = {
  ownerTrusted: 60 * 60 * 24 * 30,
  ownerDefault: 60 * 60 * 12,
  admin: 60 * 60 * 12,
  adminMfa: 60 * 10,
} as const;

function key(): Uint8Array {
  return new TextEncoder().encode(getSecret("AUTH_SECRET"));
}

export async function signSession(payload: SessionPayload, ttlSeconds: number): Promise<string> {
  const jwt = new SignJWT({
    kind: payload.kind,
    ...(payload.rid ? { rid: payload.rid } : {}),
    ...(payload.setup ? { setup: payload.setup } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setAudience(payload.kind)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds);
  return jwt.sign(key());
}

export async function verifySession(
  token: string | undefined | null,
  kind: SessionKind,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { audience: kind, algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || payload.kind !== kind) return null;
    const rid = typeof payload.rid === "string" ? payload.rid : undefined;
    const setup = typeof payload.setup === "string" ? payload.setup : undefined;
    return { sub: payload.sub, kind, ...(rid ? { rid } : {}), ...(setup ? { setup } : {}) };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAgeSeconds: number | undefined) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(maxAgeSeconds ? { maxAge: maxAgeSeconds } : {}),
  };
}
