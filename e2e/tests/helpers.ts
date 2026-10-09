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
  await prisma.orderItem.deleteMany({ where: { order: { sessionId: { in: ids } } } });
  await prisma.order.deleteMany({ where: { sessionId: { in: ids } } });
  await prisma.guest.deleteMany({ where: { sessionId: { in: ids } } });
  await prisma.tableSession.deleteMany({ where: { id: { in: ids } } });
  return table;
}
