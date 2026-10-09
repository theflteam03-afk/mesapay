import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
// O .env único fica na raiz do monorepo.
loadEnv({ path: path.resolve(here, "../../.env"), quiet: true });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // O lint corre uma vez na raiz (pnpm lint), não em cada build.
  eslint: { ignoreDuringBuilds: true },
  outputFileTracingRoot: path.resolve(here, "../.."),
  transpilePackages: ["@mesapay/ui", "@mesapay/core", "@mesapay/i18n", "@mesapay/config", "@mesapay/auth", "@mesapay/db", "@mesapay/realtime", "@mesapay/print"],
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
