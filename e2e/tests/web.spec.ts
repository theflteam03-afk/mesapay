import { expect, test } from "@playwright/test";
import { tableUrl, WEB } from "./helpers";

test.describe("Site e app da mesa", () => {
  test("landing mostra os 3 planos com preços", async ({ page }) => {
    await page.goto(WEB);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("pedem e pagam pelo celular");
    for (const [plan, price] of [
      ["Start", "R$ 249"],
      ["Pro", "R$ 449"],
      ["Business", "R$ 799"],
    ] as const) {
      const card = page.locator("#planos").getByRole("heading", { name: plan, exact: true }).locator("..");
      await expect(card).toContainText(price);
    }
  });

  test("QR inválido mostra 'Mesa não encontrada'", async ({ page }) => {
    const res = await page.goto(`${WEB}/r/demo/m/tokenquenaoexiste0000`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Mesa não encontrada" })).toBeVisible();
  });

  test("token de outro restaurante com o slug errado não abre", async ({ page }) => {
    const auroraUrl = await tableUrl("aurora", 1);
    const res = await page.goto(auroraUrl.replace("/r/aurora/", "/r/demo/"));
    expect(res?.status()).toBe(404);
  });

  test("idioma do navegador: inglês", async ({ browser }) => {
    const ctx = await browser.newContext({ locale: "en-US", extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" } });
    const page = await ctx.newPage();
    await page.goto(await tableUrl("demo", 3));
    await expect(page.getByTestId("table-number")).toContainText("Table 3");
    await expect(page.getByRole("heading", { name: "Starters" })).toBeVisible();
    await ctx.close();
  });
});
