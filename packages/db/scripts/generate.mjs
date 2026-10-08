#!/usr/bin/env node
/**
 * `prisma generate` sem depender do download do binário schema-engine.
 *
 * O cliente gerado (generator "prisma-client", Prisma 7) é 100% TypeScript/WASM e não usa
 * o schema-engine; mas o CLI tenta descarregá-lo ao arrancar, o que falha em redes que
 * bloqueiam binaries.prisma.sh. Apontamos o CLI para um stub só durante o generate.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.join(pkgRoot, "node_modules", ".cache");
fs.mkdirSync(cacheDir, { recursive: true });
const stub = path.join(cacheDir, process.platform === "win32" ? "schema-engine-stub.cmd" : "schema-engine-stub");
if (!fs.existsSync(stub)) {
  fs.writeFileSync(
    stub,
    process.platform === "win32" ? "@echo schema-engine indisponivel 1>&2\r\n@exit /b 1\r\n" : "#!/bin/sh\necho 'schema-engine indisponível' >&2\nexit 1\n",
    { mode: 0o755 },
  );
}

const env = { ...process.env };
env.PRISMA_SCHEMA_ENGINE_BINARY ??= stub;
const bin = path.join(pkgRoot, "node_modules", ".bin", process.platform === "win32" ? "prisma.cmd" : "prisma");
const result = spawnSync(bin, ["generate"], { cwd: pkgRoot, env, stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
