import { expect, test, type Page } from "@playwright/test";
import { totp } from "@mesapay/auth";
import { DEMO } from "@mesapay/db/demo";
import { ADMIN, prisma } from "./helpers";

async function passwordStep(page: Page) {
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel("E-mail").fill(DEMO.adminEmail);
  await page.getByLabel("Senha").fill(DEMO.adminPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(`${ADMIN}/login/2fa`);
}

test.describe("Painel admin SaaS", () => {
  test.beforeAll(async () => {
    // Recomeça sempre do primeiro acesso (2FA ainda não configurado).
    await prisma.saasUser.update({ where: { email: DEMO.adminEmail }, data: { totpSecret: null } });
  });

  test("sem sessão redireciona para o login; 2FA não abre sem a senha", async ({ page }) => {
    await page.goto(`${ADMIN}/`);
    await expect(page).toHaveURL(`${ADMIN}/login`);
    await page.goto(`${ADMIN}/login/2fa`);
    await expect(page).toHaveURL(`${ADMIN}/login`);
  });

  test("primeiro acesso obriga a ativar o 2FA e depois pede o código", async ({ page, context }) => {
    await passwordStep(page);
    await expect(page.getByRole("heading", { name: "Ative a verificação em duas etapas" })).toBeVisible();
    await expect(page.getByRole("img", { name: "QR Code para o app autenticador" })).toBeVisible();
    const secret = (await page.getByTestId("totp-secret").textContent())?.trim() ?? "";
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);

    // Código errado é recusado.
    await page.getByLabel("Código de 6 dígitos").fill("000000");
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Código inválido" })).toBeVisible();

    await page.getByLabel("Código de 6 dígitos").fill(totp(secret));
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page).toHaveURL(`${ADMIN}/`);
    await expect(page.getByRole("heading", { name: "Nossos restaurantes" })).toBeVisible();
    await expect(page.getByTestId("restaurant-row")).toHaveCount(await prisma.restaurant.count());
    await expect(page.getByTestId("restaurant-row").filter({ hasText: "Boteco da Esquina" })).toContainText("10");

    const stored = await prisma.saasUser.findUniqueOrThrow({ where: { email: DEMO.adminEmail } });
    expect(stored.totpSecret).toBe(secret);

    // Auditoria regista a ativação.
    await page.getByRole("link", { name: "Auditoria" }).click();
    await expect(page.getByText("admin.2fa.enabled").first()).toBeVisible();

    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(`${ADMIN}/login`);
    expect((await context.cookies()).find((c) => c.name === "mp_admin")).toBeUndefined();

    // Segundo acesso: só pede o código, sem mostrar o segredo outra vez.
    await passwordStep(page);
    await expect(page.getByRole("heading", { name: "Verificação em duas etapas" })).toBeVisible();
    await expect(page.getByTestId("totp-secret")).toHaveCount(0);
    await page.getByLabel("Código de 6 dígitos").fill(totp(secret));
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page.getByTestId("admin-user")).toContainText("Super admin");
  });
});
