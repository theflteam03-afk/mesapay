import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  createMemoryRateLimiter,
  createUpstashRateLimiter,
  generateTotpSecret,
  hashPassword,
  hashPin,
  otpauthUri,
  pinLookup,
  signSession,
  totp,
  verifyPassword,
  verifyPin,
  verifySession,
  verifyTotp,
} from "./index";

describe("senha", () => {
  it("faz hash e verifica", async () => {
    const hash = await hashPassword("segredo-forte");
    expect(await verifyPassword("segredo-forte", hash)).toBe(true);
    expect(await verifyPassword("errada", hash)).toBe(false);
    expect(await verifyPassword("qualquer", null)).toBe(false);
  });
  it("recusa senha curta", async () => {
    await expect(hashPassword("curta")).rejects.toThrow();
  });
});

describe("PIN", () => {
  it("bcrypt + lookup determinístico por restaurante", async () => {
    const hash = await hashPin("1234");
    expect(await verifyPin("1234", hash)).toBe(true);
    expect(await verifyPin("4321", hash)).toBe(false);
    expect(pinLookup("1234", "r1")).toBe(pinLookup("1234", "r1"));
    expect(pinLookup("1234", "r1")).not.toBe(pinLookup("1234", "r2"));
    expect(pinLookup("1234", "r1")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("TOTP (RFC 6238)", () => {
  // Vetor de teste do RFC 6238 (SHA1, segredo ASCII "12345678901234567890").
  const rfcSecret = base32Encode(Buffer.from("12345678901234567890"));

  it("bate com os vetores oficiais", () => {
    expect(totp(rfcSecret, 59_000)).toBe("287082");
    expect(totp(rfcSecret, 1_111_111_109_000)).toBe("081804");
    expect(totp(rfcSecret, 2_000_000_000_000)).toBe("279037");
  });

  it("base32 ida e volta", () => {
    const secret = generateTotpSecret();
    expect(base32Encode(base32Decode(secret))).toBe(secret);
  });

  it("aceita o passo atual e ±1, recusa o resto", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, totp(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, totp(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totp(secret, now - 120_000), now)).toBe(false);
    expect(verifyTotp(secret, "abc", now)).toBe(false);
  });

  it("gera URI otpauth", () => {
    expect(otpauthUri("ABC", "a@b.com", "MesaPay")).toMatch(/^otpauth:\/\/totp\/MesaPay%3Aa%40b.com\?secret=ABC/);
  });
});

describe("sessão", () => {
  it("assina e verifica respeitando o tipo", async () => {
    const token = await signSession({ sub: "u1", kind: "owner", rid: "r1" }, 60);
    expect(await verifySession(token, "owner")).toEqual({ sub: "u1", kind: "owner", rid: "r1" });
    expect(await verifySession(token, "admin")).toBeNull();
    expect(await verifySession(`${token}x`, "owner")).toBeNull();
    expect(await verifySession(undefined, "owner")).toBeNull();
  });

  it("expira", async () => {
    const token = await signSession({ sub: "u1", kind: "admin" }, -10);
    expect(await verifySession(token, "admin")).toBeNull();
  });
});

describe("rate limit", () => {
  it("bloqueia depois do máximo (memória)", async () => {
    const rl = createMemoryRateLimiter({ max: 2, windowMs: 1000 });
    expect((await rl.hit("k")).ok).toBe(true);
    expect((await rl.hit("k")).ok).toBe(true);
    const blocked = await rl.hit("k");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    await rl.reset("k");
    expect((await rl.hit("k")).ok).toBe(true);
  });

  it("Upstash: envia o pipeline certo e bloqueia acima do máximo", async () => {
    const calls: { url: string; body: string; auth: string | undefined }[] = [];
    let count = 0;
    const fakeFetch = async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
      calls.push({ url, body: init.body, auth: init.headers.Authorization });
      count++;
      return { ok: true, status: 200, json: async () => [{ result: "OK" }, { result: count }, { result: 4200 }] };
    };
    const rl = createUpstashRateLimiter({ max: 2, windowMs: 10_000, prefix: "order", url: "https://x.upstash.io/", token: "tok", fetch: fakeFetch });
    expect((await rl.hit("dev1")).ok).toBe(true);
    expect((await rl.hit("dev1")).ok).toBe(true);
    expect(await rl.hit("dev1")).toEqual({ ok: false, retryAfterMs: 4200 });
    expect(calls[0]?.url).toBe("https://x.upstash.io/pipeline");
    expect(calls[0]?.auth).toBe("Bearer tok");
    expect(JSON.parse(calls[0]?.body ?? "[]")).toEqual([
      ["SET", "order:dev1", 0, "PX", 10_000, "NX"],
      ["INCR", "order:dev1"],
      ["PTTL", "order:dev1"],
    ]);
  });

  it("Upstash fora do ar não bloqueia clientes (fail-open)", async () => {
    const rl = createUpstashRateLimiter({
      max: 1,
      windowMs: 1000,
      url: "https://x",
      token: "t",
      fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    });
    const spy = console.error;
    console.error = () => {};
    try {
      expect((await rl.hit("a")).ok).toBe(true);
    } finally {
      console.error = spy;
    }
  });
});
