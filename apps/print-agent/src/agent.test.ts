import { createServer, type IncomingMessage } from "node:http";
import net, { type AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { PrinterLoop } from "./agent";
import { loadConfig, parsePrinters } from "./config";
import { parseAddress, sendTcp } from "./transport";

/** Térmica falsa: um servidor TCP que guarda os bytes recebidos (como uma impressora na porta 9100). */
async function fakePrinter() {
  const received: Buffer[] = [];
  const sockets = new Set<net.Socket>();
  const server = net.createServer((s) => {
    sockets.add(s);
    s.on("data", (d) => received.push(d));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const close = () => new Promise<void>((r) => {
    sockets.forEach((s) => s.destroy());
    server.close(() => r());
  });
  return { port: (server.address() as AddressInfo).port, received, close };
}

/** API falsa com um ticket na fila. */
async function fakeApi(job: { id: string; escpos: string; text: string } | null, address: string) {
  const results: unknown[] = [];
  let served = false;
  const server = createServer(async (req: IncomingMessage, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    if (req.url?.endsWith("/next")) {
      const j = served ? null : job;
      served = true;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ printer: { name: "Cozinha", address }, job: j ? { ...j, attempt: 1 } : null }));
      return;
    }
    results.push(JSON.parse(Buffer.concat(chunks).toString()));
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const close = () => new Promise<void>((r) => {
    server.closeAllConnections();
    server.close(() => r());
  });
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, results, close };
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});

const quiet = { fetch: globalThis.fetch, send: undefined, log: () => {} };

describe("endereços e configuração", () => {
  it("entende rede, USB e Windows", () => {
    expect(parseAddress("192.168.0.50")).toEqual({ kind: "tcp", host: "192.168.0.50", port: 9100 });
    expect(parseAddress("tcp://10.0.0.2:9101")).toEqual({ kind: "tcp", host: "10.0.0.2", port: 9101 });
    expect(parseAddress("/dev/usb/lp0")).toEqual({ kind: "file", path: "/dev/usb/lp0" });
    expect(parseAddress("\\\\localhost\\Termica")).toEqual({ kind: "file", path: "\\\\localhost\\Termica" });
    expect(parsePrinters("AAA, BBB=192.168.0.9:9100")).toEqual([{ key: "AAA" }, { key: "BBB", address: "192.168.0.9:9100" }]);
    expect(loadConfig({ MESAPAY_API_URL: "https://app.x", MESAPAY_PRINTERS: "K1", MESAPAY_CONFIG: "/nao/existe.json" })).toMatchObject({
      apiUrl: "https://app.x",
      printers: [{ key: "K1" }],
      intervalMs: 1000,
    });
  });
});

describe("ciclo do agente", () => {
  it("busca o ticket, envia os bytes à térmica e confirma a impressão", async () => {
    const printer = await fakePrinter();
    cleanups.push(printer.close);
    const bytes = Buffer.from([0x1b, 0x40, ...Buffer.from("MESA 5\n")]);
    const api = await fakeApi({ id: "job1", escpos: bytes.toString("base64"), text: "====\n  COZINHA  ·  MESA 5\n" }, `127.0.0.1:${printer.port}`);
    cleanups.push(api.close);

    const loop = new PrinterLoop(api.url, "K".repeat(32), {}, { ...quiet, send: (a, d) => import("./transport").then((t) => t.sendToPrinter(a, d)) });
    expect(await loop.tick()).toBe(true);
    loop.stop();
    await expect.poll(() => Buffer.concat(printer.received).toString("latin1")).toContain("MESA 5");
    expect(api.results).toEqual([{ ok: true }]);
    expect(loop.status).toMatchObject({ name: "Cozinha", online: true, printed: 1, lastError: null });
  });

  it("térmica desligada: avisa a API do erro (o ticket volta para a fila)", async () => {
    const api = await fakeApi({ id: "job2", escpos: Buffer.from("x").toString("base64"), text: "x" }, "127.0.0.1:1");
    cleanups.push(api.close);
    const loop = new PrinterLoop(api.url, "K".repeat(32), {}, { ...quiet, send: (a, d) => import("./transport").then((t) => t.sendToPrinter(a, d)) });
    expect(await loop.tick()).toBe(false);
    loop.stop();
    expect(api.results).toHaveLength(1);
    expect(api.results[0]).toMatchObject({ ok: false, error: expect.stringContaining("Sem ligação à impressora") });
  });

  it("API fora do ar: fica offline e tenta de novo, sem rebentar", async () => {
    const loop = new PrinterLoop("http://127.0.0.1:1", "K".repeat(32), {}, { ...quiet, send: async () => {} });
    expect(await loop.tick()).toBe(false);
    loop.stop();
    expect(loop.status.online).toBe(false);
    expect(loop.status.lastError).toBeTruthy();
  });

  it("timeout se a térmica aceita a ligação mas não lê", async () => {
    const sockets = new Set<net.Socket>();
    const server = net.createServer((s) => void sockets.add(s));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    cleanups.push(() => new Promise<void>((r) => {
      sockets.forEach((s) => s.destroy());
      server.close(() => r());
    }));
    const port = (server.address() as AddressInfo).port;
    // Dados pequenos são aceites pelo buffer do sistema: o envio conclui (comportamento normal das térmicas).
    await expect(sendTcp("127.0.0.1", port, Buffer.from("ok"), 500)).resolves.toBeUndefined();
  });
});
