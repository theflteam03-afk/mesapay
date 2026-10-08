import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

loadEnv({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

export default defineConfig({
  test: {
    testTimeout: 20_000,
    // Os testes de banco partilham o mesmo Postgres: corre-os em série.
    fileParallelism: false,
  },
});
