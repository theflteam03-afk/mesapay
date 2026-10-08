import { expect, test } from "@playwright/test";
import { tableUrl } from "./helpers";

test.describe("App da mesa no celular", () => {
  test("QR da mesa 1 abre o restaurante com tema e menu do seed", async ({ page }) => {
    await page.goto(await tableUrl("demo", 1));
    await expect(page.getByTestId("restaurant-name")).toHaveText("Boteco da Esquina");
    await expect(page.getByTestId("table-number")).toContainText("Mesa 1");
    await expect(page.getByTestId("menu-item")).toHaveCount(30);
    await expect(page.getByTestId("menu-item").filter({ hasText: "Pudim de leite" })).toContainText("Esgotado");

    // Cor da marca do restaurante aplicada ao cabeçalho.
    const bg = await page.locator("header").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe("rgb(217, 72, 15)");

    // Sem rolagem horizontal no celular.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("restaurante em modo escuro", async ({ page }) => {
    await page.goto(await tableUrl("aurora", 2));
    await expect(page.locator("[data-theme='dark']")).toBeVisible();
    await expect(page.getByTestId("restaurant-name")).toHaveText("Café Aurora");
  });
});
