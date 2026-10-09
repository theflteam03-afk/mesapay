import "server-only";
import { createRateLimiter } from "@mesapay/auth";

/** Anti-spam das rotas públicas da mesa (secção 5/12 do plano). Upstash em produção. */
export const limits = {
  /** 1 pedido a cada 10 s por celular. */
  orderPerDevice: createRateLimiter({ max: 1, windowMs: 10_000, prefix: "order-dev" }),
  /** Teto por IP (vários celulares na mesma rede Wi-Fi do restaurante cabem folgados). */
  orderPerIp: createRateLimiter({ max: 60, windowMs: 60_000, prefix: "order-ip" }),
  joinPerIp: createRateLimiter({ max: 60, windowMs: 60_000, prefix: "join-ip" }),
  joinPerDevice: createRateLimiter({ max: 10, windowMs: 60_000, prefix: "join-dev" }),
};
