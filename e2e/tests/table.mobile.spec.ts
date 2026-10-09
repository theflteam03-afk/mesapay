import { devices, expect, test, type Browser, type Page } from "@playwright/test";
import { DEMO } from "@mesapay/db/demo";
import { DASHBOARD, enterTable, prisma, resetTable, tableUrl } from "./helpers";

const phone = devices["Pixel 7"];

async function newPhone(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ ...phone, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  return ctx.newPage();
}

/** Toca num prato, escolhe as opções obrigatórias (1ª de cada grupo) e junta ao pedido. */
async function addItem(page: Page, name: string, opts: { qty?: number; note?: string } = {}) {
  await page.getByTestId("tab-menu").click();
  await page.getByTestId("menu-item").filter({ hasText: name }).first().locator("button").click();
  const sheet = page.getByTestId("item-sheet");
  await expect(sheet).toBeVisible();
  const groups = sheet.getByTestId("option-group");
  for (let i = 0; i < (await groups.count()); i++) {
    const g = groups.nth(i);
    if (await g.getByText("Obrigatório").isVisible()) await g.locator("input").first().check();
  }
  for (let i = 1; i < (opts.qty ?? 1); i++) await sheet.getByRole("button", { name: "Aumentar" }).click();
  if (opts.note) await sheet.getByTestId("item-note").fill(opts.note);
  await sheet.getByTestId("add-to-cart").click();
  await expect(sheet).toBeHidden();
}

async function sendOrder(page: Page) {
  await page.getByTestId("open-cart").click();
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/orders") && r.request().method() === "POST"),
    page.getByTestId("send-order").click(),
  ]);
  expect(res.status()).toBe(201);
  await expect(page.getByTestId("toast")).toContainText("enviado para a cozinha");
  return Date.now();
}

test.describe("App da mesa no celular", () => {
  test("primeira vez pede só o nome; reabrir (e outro restaurante) não pede de novo", async ({ page }) => {
    await resetTable("demo", 1);
    const url = await tableUrl("demo", 1);
    await page.goto(url);
    await expect(page.getByTestId("restaurant-name")).toHaveText("Boteco da Esquina");
    await expect(page.getByText("Como você se chama?")).toBeVisible();
    await expect(page.getByTestId("name-submit")).toBeDisabled();

    await page.getByTestId("name-input").fill("Ana");
    await page.getByTestId("name-submit").click();
    await expect(page.getByTestId("table-number")).toContainText("Mesa 1");
    await expect(page.getByTestId("menu-item")).toHaveCount(30);

    // Esgotado aparece mas não dá para pedir.
    const pudim = page.getByTestId("menu-item").filter({ hasText: "Pudim de leite" });
    await expect(pudim).toContainText("Esgotado");
    await expect(pudim.locator("button")).toBeDisabled();

    // Cor da marca do restaurante e sem rolagem horizontal.
    const bg = await page.getByTestId("brand-header").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe("rgb(217, 72, 15)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

    // Reabrir: entra direto, sem perguntar o nome.
    await page.reload();
    await expect(page.getByTestId("menu-item").first()).toBeVisible();
    await expect(page.getByTestId("name-input")).toHaveCount(0);
    await page.getByTestId("tab-bill").click();
    await expect(page.getByTestId("bill-people")).toContainText("Ana");

    // Outro restaurante MesaPay no mesmo navegador: também não pergunta.
    await resetTable("aurora", 2);
    await page.goto(await tableUrl("aurora", 2));
    await expect(page.getByTestId("restaurant-name")).toHaveText("Café Aurora");
    await expect(page.getByTestId("menu-item").first()).toBeVisible();
    await expect(page.getByTestId("name-input")).toHaveCount(0);
    await expect(page.locator("[data-theme='dark']")).toBeVisible();
  });

  test("3 celulares na mesma mesa veem os pedidos uns dos outros em menos de 2 s", async ({ browser }) => {
    test.setTimeout(120_000);
    await resetTable("demo", 5);
    const url = await tableUrl("demo", 5);
    const [ana, bia, caio] = await Promise.all([newPhone(browser), newPhone(browser), newPhone(browser)]);
    await enterTable(ana, url, "Ana");
    await enterTable(bia, url, "Bia");
    await enterTable(caio, url, "Ana"); // nome repetido na mesa → "Ana (2)"

    for (const p of [ana, bia, caio]) await p.getByTestId("tab-bill").click();
    await expect(ana.getByTestId("bill-people")).toContainText("Ana, Bia, Ana (2)");
    for (const p of [ana, bia, caio]) await expect(p.getByTestId("bill-empty")).toBeVisible();

    // A Ana pede; a Bia e o Caio veem na conta em menos de 2 s, sem recarregar.
    await addItem(ana, "Picanha na chapa", { qty: 2, note: "sem cebola" });
    await addItem(ana, "Caipirinha");
    const sentAt = await sendOrder(ana);
    await Promise.all(
      [bia, caio].map((p) => expect(p.getByTestId("bill-item").filter({ hasText: "Picanha na chapa" })).toBeVisible({ timeout: 2000 })),
    );
    expect(Date.now() - sentAt).toBeLessThan(2000);

    const anaGroup = bia.getByTestId("bill-group").filter({ hasText: "Ana" }).first();
    await expect(anaGroup).toContainText("2×");
    await expect(anaGroup).toContainText("sem cebola");
    await expect(anaGroup).toContainText("Enviado");

    // O "Ana (2)" pede uma cerveja; os outros dois veem em menos de 2 s.
    await addItem(caio, "Chopp pilsen");
    const sentAt2 = await sendOrder(caio);
    await Promise.all(
      [ana, bia].map((p) => expect(p.getByTestId("bill-group").filter({ hasText: "Ana (2)" })).toContainText("Chopp pilsen", { timeout: 2000 })),
    );
    expect(Date.now() - sentAt2).toBeLessThan(2000);

    // Os três veem o mesmo total; o servidor gravou o mesmo valor na comanda.
    const readTotals = () => Promise.all([ana, bia, caio].map((p) => p.getByTestId("bill-total").textContent()));
    await expect.poll(async () => new Set(await readTotals()).size, { timeout: 2000 }).toBe(1);
    const totals = await readTotals();
    const table = await prisma.table.findFirstOrThrow({ where: { restaurant: { slug: "demo" }, number: 5 } });
    const session = await prisma.tableSession.findFirstOrThrow({ where: { tableId: table.id, status: "OPEN" } });
    expect(totals[0]?.replace(/\s/g, " ")).toBe(`R$ ${(session.total / 100).toFixed(2).replace(".", ",")}`);
    expect(await prisma.order.count({ where: { sessionId: session.id } })).toBe(2);

    // 1 pedido a cada 10 s por celular (anti-spam).
    await addItem(ana, "Chopp pilsen");
    await ana.getByTestId("open-cart").click();
    await ana.getByTestId("send-order").click();
    await expect(ana.getByTestId("order-error")).toContainText("Aguarde alguns segundos");

    await Promise.all([ana, bia, caio].map((p) => p.context().close()));
  });

  test("esgotado no painel aparece na hora no celular e o pedido é recusado", async ({ browser }) => {
    await resetTable("demo", 6);
    const item = await prisma.menuItem.findFirstOrThrow({ where: { restaurant: { slug: "demo" }, name: "Bolinho de bacalhau" } });
    await prisma.menuItem.update({ where: { id: item.id }, data: { soldOut: false } });

    const guest = await newPhone(browser);
    const url = await tableUrl("demo", 6);
    // Em `pnpm dev` cada rota compila no 1.º acesso; aquece a do menu para medir só o tempo real.
    await guest.request.get(url.replace(/\/r\/[^/]+\/m\//, "/api/t/"));
    await enterTable(guest, url, "Davi");
    await addItem(guest, "Bolinho de bacalhau");

    // O dono marca como esgotado no painel.
    const owner = await (await browser.newContext()).newPage();
    await owner.goto(`${DASHBOARD}/login`);
    await owner.getByLabel("E-mail").fill(DEMO.ownerEmail);
    await owner.getByLabel("Senha").fill(DEMO.ownerPassword);
    await owner.getByRole("button", { name: "Entrar" }).click();
    await expect(owner).toHaveURL(`${DASHBOARD}/mesas`);
    await owner.goto(`${DASHBOARD}/menu`);
    const row = owner.getByTestId("menu-item").filter({ hasText: "Bolinho de bacalhau" });
    try {
      await row.getByTestId("sold-out-switch").click();
      await expect(row.getByTestId("sold-out-switch")).toHaveAttribute("aria-checked", "true");
      // O interruptor muda na hora (otimista); o relógio dos 2 s começa quando o servidor gravou.
      await expect.poll(async () => (await prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } })).soldOut, { timeout: 15_000 }).toBe(true);

      // No celular: fica esgotado em menos de 2 s, sem recarregar.
      const card = guest.getByTestId("menu-item").filter({ hasText: "Bolinho de bacalhau" });
      await expect(card).toContainText("Esgotado", { timeout: 2000 });
      await expect(card.locator("button")).toBeDisabled();

      // O que já estava no carrinho é recusado pelo servidor.
      await guest.getByTestId("open-cart").click();
      await guest.getByTestId("send-order").click();
      await expect(guest.getByTestId("order-error")).toContainText("Bolinho de bacalhau acabou de esgotar");
    } finally {
      await prisma.menuItem.update({ where: { id: item.id }, data: { soldOut: false } });
      await owner.context().close();
      await guest.context().close();
    }
  });

  test("comanda encerrada: o celular avisa e pode abrir uma nova", async ({ page }) => {
    const table = await resetTable("demo", 7);
    await enterTable(page, await tableUrl("demo", 7), "Eva");
    await page.getByTestId("tab-bill").click();
    await expect(page.getByTestId("bill")).toBeVisible();

    const session = await prisma.tableSession.findFirstOrThrow({ where: { tableId: table.id, status: "OPEN" } });
    await prisma.$transaction(async (tx) => {
      await tx.tableSession.update({ where: { id: session.id }, data: { status: "CLOSED", closedAt: new Date() } });
      const payload = JSON.stringify({ type: "session.closed", restaurantId: session.restaurantId, sessionId: session.id, tableId: table.id });
      await tx.$executeRaw`SELECT pg_notify('mesapay_rt', ${payload})`;
    });

    await expect(page.getByTestId("session-closed")).toContainText("Esta conta foi encerrada", { timeout: 2000 });
    await page.getByTestId("new-session").click();
    await expect(page.getByTestId("menu-item").first()).toBeVisible();
    const open = await prisma.tableSession.findFirstOrThrow({ where: { tableId: table.id, status: "OPEN" } });
    expect(open.id).not.toBe(session.id);
  });
});
