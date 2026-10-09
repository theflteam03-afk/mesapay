/**
 * Limitador de tentativas.
 *
 * - Produção: Upstash Redis (REST), partilhado por todas as instâncias da Vercel.
 * - Desenvolvimento/testes: memória do processo (quando UPSTASH_REDIS_REST_URL está vazio).
 *
 * Janela fixa: no máximo `max` tentativas a cada `windowMs` por chave.
 */
export interface RateLimitResult {
  ok: boolean;
  retryAfterMs: number;
}

export interface RateLimiter {
  /** Regista uma tentativa. Devolve `ok: false` e quantos ms faltam se estiver bloqueado. */
  hit(key: string): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}

export interface RateLimitOptions {
  max: number;
  windowMs: number;
  /** Prefixo da chave, para separar limitadores ("login", "order", ...). */
  prefix?: string;
}

export function createMemoryRateLimiter(opts: RateLimitOptions): RateLimiter {
  const buckets = new Map<string, number[]>();
  const k = (key: string) => `${opts.prefix ?? "rl"}:${key}`;
  return {
    async hit(key) {
      const now = Date.now();
      const id = k(key);
      const recent = (buckets.get(id) ?? []).filter((t) => now - t < opts.windowMs);
      if (recent.length >= opts.max) {
        buckets.set(id, recent);
        const oldest = recent[0] ?? now;
        return { ok: false, retryAfterMs: opts.windowMs - (now - oldest) };
      }
      recent.push(now);
      buckets.set(id, recent);
      // Evita crescer sem limite num processo de longa duração.
      if (buckets.size > 50_000) buckets.clear();
      return { ok: true, retryAfterMs: 0 };
    },
    async reset(key) {
      buckets.delete(k(key));
    },
  };
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/**
 * Upstash Redis via REST (sem dependências). Um pipeline por tentativa:
 *   SET key 0 PX window NX   → cria a janela se não existir
 *   INCR key                 → conta a tentativa
 *   PTTL key                 → quanto falta para a janela acabar
 * Se o Redis falhar, deixa passar (fail-open) para não bloquear clientes legítimos.
 */
export function createUpstashRateLimiter(
  opts: RateLimitOptions & { url: string; token: string; fetch?: FetchLike },
): RateLimiter {
  const doFetch: FetchLike = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
  const base = opts.url.replace(/\/$/, "");
  const k = (key: string) => `${opts.prefix ?? "rl"}:${key}`;
  const call = async (commands: (string | number)[][]) => {
    const res = await doFetch(`${base}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
    });
    if (!res.ok) throw new Error(`Upstash respondeu ${res.status}`);
    return (await res.json()) as { result?: unknown; error?: string }[];
  };
  return {
    async hit(key) {
      const id = k(key);
      try {
        const out = await call([
          ["SET", id, 0, "PX", opts.windowMs, "NX"],
          ["INCR", id],
          ["PTTL", id],
        ]);
        const count = Number(out[1]?.result ?? 0);
        const ttl = Number(out[2]?.result ?? opts.windowMs);
        if (count > opts.max) return { ok: false, retryAfterMs: ttl > 0 ? ttl : opts.windowMs };
        return { ok: true, retryAfterMs: 0 };
      } catch (err) {
        console.error("[rate-limit] Upstash indisponível, a deixar passar:", err);
        return { ok: true, retryAfterMs: 0 };
      }
    },
    async reset(key) {
      try {
        await call([["DEL", k(key)]]);
      } catch (err) {
        console.error("[rate-limit] Upstash indisponível:", err);
      }
    },
  };
}

/** Usa Upstash se UPSTASH_REDIS_REST_URL/TOKEN estiverem definidos; senão, memória. */
export function createRateLimiter(opts: RateLimitOptions): RateLimiter {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return createUpstashRateLimiter({ ...opts, url, token });
  return createMemoryRateLimiter(opts);
}
