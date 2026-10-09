import "server-only";
import { cookies } from "next/headers";
import { DEVICE_ID_RE } from "@mesapay/db/services";

/**
 * Identidade do celular na mesa: UUID gerado no navegador (localStorage "mp_device")
 * e repetido num cookie httpOnly de 1 ano — se um dos dois for apagado, o outro recupera-o.
 */
export const DEVICE_COOKIE = "mp_device";
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function readDeviceId(): Promise<string | null> {
  const v = (await cookies()).get(DEVICE_COOKIE)?.value;
  return v && DEVICE_ID_RE.test(v) ? v : null;
}

export async function writeDeviceId(deviceId: string): Promise<void> {
  (await cookies()).set(DEVICE_COOKIE, deviceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
}
