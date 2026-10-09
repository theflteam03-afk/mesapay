import type { Page } from "@playwright/test";
import { prisma } from "@mesapay/db";

export const WEB = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";
export const DASHBOARD = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "http://localhost:3001";
export const ADMIN = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:3002";

export async function tableUrl(slug: string, number: number): Promise<string> {
  const table = await prisma.table.findFirstOrThrow({ where: { restaurant: { slug }, number } });
  return `${WEB}/r/${slug}/m/${table.qrToken}`;
}

export { prisma };


/** Abre o QR da mesa e, se for a primeira vez neste navegador, digita o nome. */
export async function enterTable(page: Page, url: string, name: string) {
  await page.goto(url);
  const input = page.getByTestId("name-input");
  const menu = page.getByTestId("menu-item").first();
  await input.or(menu).first().waitFor();
  if (await input.isVisible()) {
    await input.fill(name);
    await page.getByTestId("name-submit").click();
  }
  await menu.waitFor();
}

/** Apaga as comandas (e pedidos) de uma mesa, para cada teste começar com a mesa livre. */
export async function resetTable(slug: string, number: number) {
  const table = await prisma.table.findFirstOrThrow({ where: { restaurant: { slug }, number } });
  const sessions = await prisma.tableSession.findMany({ where: { tableId: table.id }, select: { id: true } });
  const ids = sessions.map((s) => s.id);
  await prisma.printJob.deleteMany({ where: { order: { sessionId: { in: ids } } } });
  await prisma.orderItem.deleteMany({ where: { order: { sessionId: { in: ids } } } });
  await prisma.order.deleteMany({ where: { sessionId: { in: ids } } });
  await prisma.guest.deleteMany({ where: { sessionId: { in: ids } } });
  await prisma.tableSession.deleteMany({ where: { id: { in: ids } } });
  return table;
}

export async function loginOwner(page: Page, email = "dono@demo.mesapay.com.br", password = "mesapay123") {
  await page.goto(`${DASHBOARD}/login`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(`${DASHBOARD}/mesas`);
}

/** Toca num prato, escolhe as opções obrigatórias (1.ª de cada grupo) e junta ao pedido. */
export async function addItem(page: Page, name: string, opts: { qty?: number; note?: string } = {}) {
  await page.getByTestId("tab-menu").click();
  await page.getByTestId("menu-item").filter({ hasText: name }).first().locator("button").click();
  const sheet = page.getByTestId("item-sheet");
  await sheet.waitFor();
  const groups = sheet.getByTestId("option-group");
  for (let i = 0; i < (await groups.count()); i++) {
    const g = groups.nth(i);
    if (await g.getByText("Obrigatório").isVisible()) await g.locator("input").first().check();
  }
  for (let i = 1; i < (opts.qty ?? 1); i++) await sheet.getByRole("button", { name: "Aumentar" }).click();
  if (opts.note) await sheet.getByTestId("item-note").fill(opts.note);
  await sheet.getByTestId("add-to-cart").click();
  await sheet.waitFor({ state: "hidden" });
}

/** Envia o carrinho e devolve o instante em que a API confirmou o pedido. */
export async function sendOrder(page: Page): Promise<number> {
  await page.getByTestId("open-cart").click();
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/orders") && r.request().method() === "POST"),
    page.getByTestId("send-order").click(),
  ]);
  if (res.status() !== 201) throw new Error(`pedido recusado: ${res.status()} ${await res.text()}`);
  await page.getByTestId("toast").waitFor();
  return Date.now();
}
