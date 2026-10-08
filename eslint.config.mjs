import path from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";

const root = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: root });
const nextApps = ["apps/web", "apps/dashboard", "apps/admin"];

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/generated/**", "**/playwright-report/**", "**/test-results/**", "**/next-env.d.ts"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // TypeScript estrito, sem `any` (regra do projeto).
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      eqeqeq: ["error", "smart"],
      "no-console": "off",
    },
  },
  ...compat.extends("next/core-web-vitals").map((c) => ({
    ...c,
    files: nextApps.map((a) => `${a}/**/*.{ts,tsx}`),
    settings: { ...c.settings, next: { rootDir: nextApps } },
  })),
  {
    files: ["**/*.mjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
