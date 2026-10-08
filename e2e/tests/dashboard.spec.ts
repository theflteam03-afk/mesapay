import { expect, test } from "@playwright/test";
import { DEMO } from "@mesapay/db/demo";
import { DASHBOARD } from "./helpers";

test.describe("Painel do restaurante", () => {
  test("sem sessão redireciona para o login", async ({ page }) => {
    await page.goto(`${DASHBOARD}/menu`);
    await expect(page).toHaveURL(`${DASHBOARD}/login`);
    await expect(page.getByRole("heading", { name: "Painel do restaurante" })).toBeVisible();
  });

  test("senha errada mostra erro", async ({ page }) => {
    await page.goto(`${DASHBOARD}/login`);
    await page.getByLabel("E-mail").fill(DEMO.ownerEmail);
    await page.getByLabel("Senha").fill("senha-errada");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "E-mail ou senha incorretos." })).toBeVisible();
    await expect(page).toHaveURL(`${DASHBOARD}/login`);
  });

  test("dono entra e vê o seed: 10 mesas, 30 pratos, 3 funcionários", async ({ page, context }) => {
    await page.goto(`${DASHBOARD}/login`);
    await page.getByLabel("E-mail").fill(DEMO.ownerEmail);
    await page.getByLabel("Senha").fill(DEMO.ownerPassword);
    await expect(page.getByLabel("Manter este dispositivo conectado por 30 dias")).toBeChecked();
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(`${DASHBOARD}/mesas`);
    await expect(page.getByTestId("restaurant-name")).toHaveText("Boteco da Esquina");
    await expect(page.getByTestId("tables-grid").locator("li")).toHaveCount(10);

    // Dispositivo confiável: cookie persistente de ~30 dias, httpOnly.
    const cookie = (await context.cookies()).find((c) => c.name === "mp_owner");
    expect(cookie?.httpOnly).toBe(true);
    const days = ((cookie?.expires ?? 0) * 1000 - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThanOrEqual(30);

    await page.getByRole("link", { name: "Menu" }).click();
    await expect(page.getByTestId("menu-item")).toHaveCount(30);
    await expect(page.getByText("Esgotado").first()).toBeVisible();

    await page.getByRole("link", { name: "Funcionários" }).click();
    await expect(page.getByTestId("staff-row")).toHaveCount(3);
    await expect(page.getByRole("cell", { name: "Garçom" })).toBeVisible();

    // Tema do restaurante aplicado (claro + cor da marca).
    await expect(page.locator("[data-theme='light']").first()).toBeVisible();

    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(`${DASHBOARD}/login`);
  });

  test("sem 'dispositivo confiável' o cookie é de sessão", async ({ page, context }) => {
    await page.goto(`${DASHBOARD}/login`);
    await page.getByLabel("E-mail").fill(DEMO.ownerEmail);
    await page.getByLabel("Senha").fill(DEMO.ownerPassword);
    await page.getByLabel("Manter este dispositivo conectado por 30 dias").uncheck();
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(`${DASHBOARD}/mesas`);
    const cookie = (await context.cookies()).find((c) => c.name === "mp_owner");
    expect(cookie?.expires).toBe(-1);
  });

  test("cada dono só vê o próprio restaurante (tema escuro do Café Aurora)", async ({ page }) => {
    await page.goto(`${DASHBOARD}/login`);
    await page.getByLabel("E-mail").fill("dono@aurora.mesapay.com.br");
    await page.getByLabel("Senha").fill("mesapay123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByTestId("restaurant-name")).toHaveText("Café Aurora");
    await expect(page.getByTestId("tables-grid").locator("li")).toHaveCount(4);
    await expect(page.locator("[data-theme='dark']").first()).toBeVisible();
    await page.getByRole("link", { name: "Menu" }).click();
    await expect(page.getByTestId("menu-item")).toHaveCount(3);
  });
});
