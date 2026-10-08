import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

loadEnv({ path: path.resolve(import.meta.dirname, "../.env"), quiet: true });

const WEB = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";
const DASHBOARD = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "http://localhost:3001";
const ADMIN = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:3002";
const root = path.resolve(import.meta.dirname, "..");

/**
 * Os testes sobem os apps sozinhos (ou reutilizam os que já estiverem a correr com `pnpm dev`).
 * Em CI, E2E_PROD=1 usa os builds de produção (`next start`), mais rápidos e fiéis.
 */
const mode = process.env.E2E_PROD === "1" ? "start" : "dev";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/ },
  ],
  webServer: [
    { command: `pnpm --filter @mesapay/web ${mode}`, url: `${WEB}/api/health`, cwd: root, reuseExistingServer: !process.env.CI, timeout: 180_000 },
    { command: `pnpm --filter @mesapay/dashboard ${mode}`, url: `${DASHBOARD}/api/health`, cwd: root, reuseExistingServer: !process.env.CI, timeout: 180_000 },
    { command: `pnpm --filter @mesapay/admin ${mode}`, url: `${ADMIN}/api/health`, cwd: root, reuseExistingServer: !process.env.CI, timeout: 180_000 },
    { command: "pnpm --filter @mesapay/print-agent start", url: "http://127.0.0.1:3010/health", cwd: root, reuseExistingServer: !process.env.CI, timeout: 60_000 },
  ],
});

export const urls = { WEB, DASHBOARD, ADMIN };
