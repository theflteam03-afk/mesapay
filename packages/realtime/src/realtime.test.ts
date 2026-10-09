import path from "node:path";
import { config as loadEnv } from "dotenv";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { parseEvent, publish, type ClientEvent, type SqlExecutor } from "./events";
import { createHub, sseResponse } from "./server";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
const cs = process.env.DIRECT_URL || process.env.DATABASE_URL || "";

/** Executor mínimo sobre `pg` com a mesma assinatura do Prisma ($executeRaw com template). */
function executor(client: pg.Client): SqlExecutor {
  return {
    async $executeRaw(strings, ...values) {
      const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""), "");
      const r = await client.query(text, values);
      return r.rowCount ?? 0;
    },
  };
}

const hub = createHub(cs);
afterAll(() => hub.close());

describe("eventos", () => {
  it("valida o JSON recebido", () => {
    expect(parseEvent('{"type":"order.created","restaurantId":"r","sessionId":"s","tableId":"t","orderId":"o","number":1}')).toMatchObject({
      type: "order.created",
    });
    expect(parseEvent('{"type":"menu.updated","restaurantId":"r"}')).toMatchObject({ type: "menu.updated" });
    expect(parseEvent('{"type":"order.created","restaurantId":"r"}')).toBeNull();
    expect(parseEvent("não é json")).toBeNull();
  });
});

describe("pg NOTIFY → hub → SSE", () => {
  it("só entrega depois do COMMIT e nunca de um ROLLBACK", async () => {
    const got: ClientEvent[] = [];
    const unsubscribe = hub.subscribe((e) => got.push(e));
    await hub.ensureConnected();

    const c = new pg.Client({ connectionString: cs });
    await c.connect();
    try {
      await c.query("BEGIN");
      await publish(executor(c), { type: "session.updated", restaurantId: "r1", sessionId: "rolled-back" });
      await c.query("ROLLBACK");

      await c.query("BEGIN");
      await publish(executor(c), { type: "session.updated", restaurantId: "r1", sessionId: "s1" });
      await new Promise((r) => setTimeout(r, 150));
      expect(got).toHaveLength(0); // ainda não fez commit
      await c.query("COMMIT");

      await expect.poll(() => got.length, { timeout: 2000 }).toBe(1);
      expect(got[0]).toMatchObject({ sessionId: "s1" });
    } finally {
      unsubscribe();
      await c.end();
    }
  });

  it("o stream SSE só passa os eventos do filtro", async () => {
    const ctrl = new AbortController();
    const res = sseResponse((e) => "sessionId" in e && e.sessionId === "mine", { signal: ctrl.signal, hub });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    const reading = (async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
      }
    })();

    await hub.ensureConnected();
    const c = new pg.Client({ connectionString: cs });
    await c.connect();
    try {
      await publish(executor(c), { type: "session.updated", restaurantId: "r", sessionId: "other" });
      await publish(executor(c), { type: "order.status", restaurantId: "r", sessionId: "mine", orderId: "o1", status: "READY" });
      await expect.poll(() => text.includes('"orderId":"o1"'), { timeout: 2000 }).toBe(true);
      expect(text).not.toContain('"other"');
      expect(text).toContain("retry: 2000");
    } finally {
      ctrl.abort();
      await reading;
      await c.end();
    }
  });
});
