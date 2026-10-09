import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAgentServer } from "./server";

const server = createAgentServer("test", () => []);
let base = "";

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("print agent", () => {
  it("responde ao health check", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, service: "mesapay-print-agent", version: "test" });
  });

  it("404 para rotas desconhecidas", async () => {
    expect((await fetch(`${base}/x`)).status).toBe(404);
  });
});
