import { spawn, type ChildProcess } from "node:child_process";
import net, { type AddressInfo } from "node:net";
import path from "node:path";
import { devices, expect, test, type Browser, type Page } from "@playwright/test";
import { addItem, DASHBOARD, enterTable, loginOwner, prisma, resetTable, sendOrder, tableUrl } from "./helpers";

/**
 * Fase 3 — impressão. Uma "térmica" falsa (servidor TCP na porta que a impressora real usaria, 9100)
 * recebe os bytes ESC/POS enviados pelo agente local real (apps/print-agent), que corre como
 * processo separado, exatamente como no PC do restaurante.
 */

const root = path.resolve(import.meta.dirname, "../..");
const AGENT_PORT = 3019;

class FakeThermal {
  chunks: { at: number; data: Buffer }[] = [];
  private server = net.createServer((s) => {
    this.sockets.add(s);
    s.on("data", (d) => this.chunks.push({ at: Date.now(), data: d }));
  });
  private sockets = new Set<net.Socket>();
  port = 0;
  async start() {
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", r));
    this.port = (this.server.address() as AddressInfo).port;
  }
  /** Tudo o que já foi impresso, como texto (ESC/POS em PC860; o ASCII lê-se direto). */
  text() {
    return Buffer.concat(this.chunks.map((c) => c.data)).toString("latin1");
  }
  /** Instante em que chegou o primeiro byte que contém `needle`. */
  printedAt(needle: string): number | null {
    let acc = "";
    for (const c of this.chunks) {
      acc += c.data.toString("latin1");
      if (acc.includes(needle)) return c.at;
    }
    return null;
  }
  async stop() {
    this.sockets.forEach((s) => s.destroy());
    await new Promise<void>((r) => this.server.close(() => r()));
  }
}

let agent: ChildProcess | null = null;
async function startAgent(printerKey: string) {
  agent = spawn(path.join(root, "apps/print-agent/node_modules/.bin/tsx"), ["src/index.ts"], {
    cwd: path.join(root, "apps/print-agent"),
    env: { ...process.env, MESAPAY_API_URL: DASHBOARD, MESAPAY_PRINTERS: printerKey, PRINT_AGENT_PORT: String(AGENT_PORT), MESAPAY_CONFIG: "/nao/existe.json" },
    stdio: "ignore",
  });
  await expect
    .poll(
      async () => {
        const r = await fetch(`http://127.0.0.1:${AGENT_PORT}/health`).catch(() => null);
        const body = r ? ((await r.json()) as { printers: { online: boolean }[] }) : null;
        return body?.printers[0]?.online ?? false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
}
function stopAgent() {
  agent?.kill("SIGTERM");
  agent = null;
}

async function phone(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ ...devices["Pixel 7"], locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  return ctx.newPage();
}

const thermal = new FakeThermal();
let rid = "";
let thermalPrinter = { id: "", key: "" };
const created: string[] = [];

test.describe.serial("Impressão na cozinha e no bar", () => {
  test.beforeAll(async () => {
    test.setTimeout(90_000);
    const r = await prisma.restaurant.findUniqueOrThrow({ where: { slug: "demo" } });
    rid = r.id;
    await thermal.start();
    // A "Cozinha" do seed é de navegador; para o teste a cozinha imprime na térmica de rede.
    await prisma.printer.updateMany({ where: { restaurantId: rid, name: "Cozinha" }, data: { active: false } });
    const p = await prisma.printer.create({
      data: {
        restaurantId: rid,
        name: "Térmica E2E",
        station: "KITCHEN",
        type: "LOCAL_AGENT",
        address: `127.0.0.1:${thermal.port}`,
        printerKey: `E2E${Date.now()}${"x".repeat(20)}`.replace(/[^A-Za-z0-9]/g, "x"),
      },
    });
    thermalPrinter = { id: p.id, key: p.printerKey };
    created.push(p.id);
    await startAgent(p.printerKey);
  });

  test.afterAll(async () => {
    stopAgent();
    await thermal.stop();
    await resetTable("demo", 8);
    await prisma.printJob.deleteMany({ where: { printerId: { in: created } } });
    await prisma.printer.deleteMany({ where: { id: { in: created } } });
    await prisma.printJob.deleteMany({ where: { restaurantId: rid, status: { in: ["PENDING", "SENT", "FAILED"] } } });
    await prisma.printer.updateMany({ where: { restaurantId: rid, name: { in: ["Cozinha", "Bar"] } }, data: { active: true } });
    await prisma.restaurant.update({ where: { id: rid }, data: { requireQrApproval: false } });
  });

  test("pedido pelo QR imprime o ticket com nome, mesa e itens em menos de 3 s", async ({ browser }) => {
    await resetTable("demo", 8);
    const guest = await phone(browser);
    await enterTable(guest, await tableUrl("demo", 8), "Eva");
    await addItem(guest, "Picanha na chapa", { note: "sem cebola" });
    await addItem(guest, "Chopp pilsen");
    const sentAt = await sendOrder(guest);

    await expect.poll(() => thermal.printedAt("Picanha na chapa"), { timeout: 3000 }).not.toBeNull();
    expect(thermal.printedAt("Picanha na chapa")! - sentAt).toBeLessThan(3000);

    const ticket = thermal.text();
    expect(ticket).toContain("COZINHA  ");
    expect(ticket).toContain("MESA 8");
    expect(ticket).toMatch(/Cliente: Eva\s+\(QR\)/);
    expect(ticket).toContain("1x  Picanha na chapa");
    expect(ticket).toContain("> obs: sem cebola");
    expect(ticket).not.toContain("Chopp"); // bebida vai para o bar
    expect(ticket).toContain("\x1d\x56\x42\x00"); // corte do papel

    // O agente confirma logo a seguir ao envio.
    await expect
      .poll(async () => (await prisma.printJob.findFirstOrThrow({ where: { printerId: thermalPrinter.id }, orderBy: { createdAt: "desc" } })).status)
      .toBe("PRINTED");
    await guest.context().close();
  });

  test("impressora offline gera alerta no painel; ao voltar, imprime o que ficou na fila", async ({ browser, page }) => {
    test.setTimeout(120_000);
    await loginOwner(page);
    await page.goto(`${DASHBOARD}/cozinha`);
    await expect(page.getByTestId("printer-chip").filter({ hasText: "Térmica E2E" })).toHaveAttribute("data-online", "1");

    stopAgent();
    const guest = await phone(browser);
    await enterTable(guest, await tableUrl("demo", 8), "Eva");
    await addItem(guest, "Mandioca frita");
    await sendOrder(guest);

    // O pedido aparece na tela da cozinha na hora, mesmo sem impressora.
    await expect(page.getByTestId("kds-order").filter({ hasText: "Mandioca frita" })).toBeVisible({ timeout: 5000 });
    // Passados 30 s sem sinal da impressora: alerta vermelho.
    const alert = page.getByTestId("printer-alert");
    await expect(alert).toContainText("Térmica E2E está offline", { timeout: 45_000 });
    await expect(alert).toContainText("1 ticket(s) à espera");

    // O agente volta: o ticket pendente sai e o alerta some.
    await startAgent(thermalPrinter.key);
    await expect.poll(() => thermal.text().includes("Mandioca frita"), { timeout: 10_000 }).toBe(true);
    // (O alerta do "Bar", impressora de navegador sem ninguém a imprimir, pode continuar.)
    await expect(page.getByTestId("printer-alert").filter({ hasText: "Térmica E2E" })).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId("printer-chip").filter({ hasText: "Térmica E2E" })).toHaveAttribute("data-online", "1");
    await guest.context().close();
  });

  test("cozinha aceita, prepara e entrega; o cliente vê cada estado na conta", async ({ browser, page }) => {
    await resetTable("demo", 8);
    await prisma.restaurant.update({ where: { id: rid }, data: { requireQrApproval: true } });
    const guest = await phone(browser);
    await enterTable(guest, await tableUrl("demo", 8), "Gil");
    await addItem(guest, "Provoleta");
    await guest.getByTestId("open-cart").click();
    await guest.getByTestId("send-order").click();
    await expect(guest.getByTestId("toast")).toContainText("Aguardando confirmação");
    const status = guest.getByTestId("bill-item").filter({ hasText: "Provoleta" }).getByTestId("bill-item-status");
    await expect(status).toHaveText("Aguardando confirmação");

    await loginOwner(page);
    await page.goto(`${DASHBOARD}/cozinha`);
    const card = page.getByTestId("kds-order").filter({ hasText: "Provoleta" });
    await expect(card).toHaveAttribute("data-status", "PENDING_APPROVAL");
    const before = thermal.text().split("Provoleta").length;
    await card.getByTestId("kds-accept").click();
    await expect.poll(() => thermal.text().split("Provoleta").length, { timeout: 5000 }).toBe(before + 1);
    await expect(status).toHaveText("Enviado", { timeout: 2000 });

    // Cada toque na cozinha: espera o servidor gravar e, a partir daí, o cliente vê em menos de 2 s.
    const orderStatus = async () =>
      (await prisma.order.findFirstOrThrow({ where: { items: { some: { nameSnapshot: "Provoleta" } }, table: { number: 8, restaurantId: rid } }, orderBy: { createdAt: "desc" } })).status;
    for (const [dbStatus, label] of [
      ["PREPARING", "Em preparo"],
      ["READY", "Pronto"],
      ["DELIVERED", "Entregue"],
    ] as const) {
      await card.getByTestId("kds-next").click();
      await expect.poll(orderStatus, { timeout: 10_000 }).toBe(dbStatus);
      await expect(status).toHaveText(label, { timeout: 2000 });
      if (dbStatus !== "DELIVERED") await expect(card).toHaveAttribute("data-status", dbStatus);
      if (dbStatus === "PREPARING") await expect(page.getByTestId("kds-col-preparing")).toContainText("Provoleta");
    }
    await expect(card).toHaveCount(0);
    await guest.context().close();
  });

  test("reimprimir sai marcado como reimpressão", async ({ browser, page }) => {
    await prisma.restaurant.update({ where: { id: rid }, data: { requireQrApproval: false } });
    const guest = await phone(browser);
    await enterTable(guest, await tableUrl("demo", 8), "Gil");
    await addItem(guest, "Pão de alho");
    await sendOrder(guest);
    await expect.poll(() => thermal.text().includes("Pão de alho".replace("ã", "\x84")), { timeout: 5000 }).toBe(true);

    await loginOwner(page);
    await page.goto(`${DASHBOARD}/cozinha`);
    const card = page.getByTestId("kds-order").filter({ hasText: "Pão de alho" }).first();
    await card.getByTestId("kds-reprint").click();
    await expect.poll(() => thermal.text().includes("REIMPRESS"), { timeout: 5000 }).toBe(true);
    await guest.context().close();
  });

  test("impressão pelo navegador: este computador imprime os tickets do bar", async ({ browser, page }) => {
    await loginOwner(page);
    await page.goto(`${DASHBOARD}/cozinha`);
    await page.getByTestId("print-here").selectOption({ label: "Bar" });
    await expect(page.getByTestId("printer-chip").filter({ hasText: "Bar" })).toHaveAttribute("data-online", "1", { timeout: 10_000 });

    const guest = await phone(browser);
    await enterTable(guest, await tableUrl("demo", 8), "Gil");
    await addItem(guest, "Cerveja long neck");
    await sendOrder(guest);
    await expect(page.getByTestId("last-ticket")).toContainText("BAR  ·  MESA 8", { timeout: 5000 });
    await expect(page.getByTestId("last-ticket")).toContainText("Cerveja long neck");
    await page.getByTestId("print-here").selectOption({ value: "" });
    await guest.context().close();
  });

  test("Star CloudPRNT e Epson Server Direct Print buscam e confirmam tickets", async ({ browser, request }) => {
    const cloud = await prisma.printer.create({
      data: { restaurantId: rid, name: "Star E2E", station: "BAR", type: "CLOUDPRNT", printerKey: `STAR${Date.now()}`.padEnd(32, "s") },
    });
    const epson = await prisma.printer.create({
      data: { restaurantId: rid, name: "Epson E2E", station: "BAR", type: "EPSON_SDP", printerKey: `EPSON${Date.now()}`.padEnd(32, "e") },
    });
    created.push(cloud.id, epson.id);

    const guest = await phone(browser);
    await enterTable(guest, await tableUrl("demo", 8), "Gil");
    await addItem(guest, "Água mineral");
    await sendOrder(guest);

    // Star: pergunta → descarrega → confirma.
    const starUrl = `${DASHBOARD}/api/print/cloudprnt/${cloud.printerKey}`;
    const poll = await (await request.post(starUrl, { data: { status: "23 6 0 0 0 0 0 0 0", printerMAC: "00:11:62:00:00:01" } })).json();
    expect(poll).toMatchObject({ jobReady: true, mediaTypes: ["text/plain"] });
    const job = await request.get(`${starUrl}?type=text/plain&mac=00:11:62:00:00:01&token=${poll.jobToken}`);
    expect(job.status()).toBe(200);
    expect(await job.text()).toContain("BAR  ·  MESA 8");
    expect((await request.delete(`${starUrl}?code=200%20OK&token=${poll.jobToken}`)).status()).toBe(200);
    expect((await prisma.printJob.findUniqueOrThrow({ where: { id: poll.jobToken } })).status).toBe("PRINTED");
    expect(await (await request.post(starUrl, { data: {} })).json()).toEqual({ jobReady: false });

    // Epson: GetRequest devolve o XML ePOS-Print; SetResponse confirma.
    const epsonUrl = `${DASHBOARD}/api/print/epson/${epson.printerKey}`;
    const xml = await (await request.post(epsonUrl, { form: { ConnectionType: "GetRequest", ID: "local_printer" } })).text();
    expect(xml).toContain("<epos-print");
    expect(xml).toContain("Água mineral");
    const jobId = /<printjobid>([^<]+)<\/printjobid>/.exec(xml)?.[1] ?? "";
    const responseFile = `<PrintResponseInfo Version="2.00"><ePOSPrint><Parameter><devid>local_printer</devid><printjobid>${jobId}</printjobid></Parameter><PrintResponse><response success="true" code="" status="0"/></PrintResponse></ePOSPrint></PrintResponseInfo>`;
    expect((await request.post(epsonUrl, { form: { ConnectionType: "SetResponse", ResponseFile: responseFile } })).status()).toBe(200);
    expect((await prisma.printJob.findUniqueOrThrow({ where: { id: jobId } })).status).toBe("PRINTED");

    // Chave errada: recusado.
    expect((await request.post(`${DASHBOARD}/api/print/cloudprnt/chaveerrada000000000000000000000`)).status()).toBe(401);
    await guest.context().close();
  });
});
