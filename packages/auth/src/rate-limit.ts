/**
 * Limitador de tentativas em memória (janela deslizante simples).
 * Suficiente para um único processo em dev. Em produção (várias instâncias na Vercel)
 * a Fase 2 troca a implementação por Upstash Redis mantendo esta mesma interface.
 */
export interface RateLimiter {
  /** Regista uma tentativa. Devolve `ok: false` e quantos ms faltam se estiver bloqueado. */
  hit(key: string): { ok: boolean; retryAfterMs: number };
  reset(key: string): void;
}

export function createMemoryRateLimiter(opts: { max: number; windowMs: number }): RateLimiter {
  const buckets = new Map<string, number[]>();
  return {
    hit(key) {
      const now = Date.now();
      const recent = (buckets.get(key) ?? []).filter((t) => now - t < opts.windowMs);
      if (recent.length >= opts.max) {
        buckets.set(key, recent);
        const oldest = recent[0] ?? now;
        return { ok: false, retryAfterMs: opts.windowMs - (now - oldest) };
      }
      recent.push(now);
      buckets.set(key, recent);
      return { ok: true, retryAfterMs: 0 };
    },
    reset(key) {
      buckets.delete(key);
    },
  };
}
