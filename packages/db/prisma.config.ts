import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// O .env fica na raiz do monorepo.
loadEnv({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx src/seed.ts",
  },
  datasource: {
    // `prisma generate` não precisa de conexão; o valor de fallback só evita erro sem .env.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "postgresql://localhost:5432/mesapay",
  },
});
