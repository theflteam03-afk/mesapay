#!/usr/bin/env node
/**
 * Ferramenta de migrações do MesaPay.
 *
 *   node scripts/migrate.mjs new <nome>   gera uma migração SQL a partir das mudanças no schema.prisma
 *   node scripts/migrate.mjs deploy       aplica as migrações pendentes
 *   node scripts/migrate.mjs status       lista aplicadas / pendentes
 *   node scripts/migrate.mjs reset        APAGA o schema public e reaplica tudo (só dev)
 *
 * Porquê não usar só `prisma migrate`? O CLI do Prisma descarrega um binário (schema-engine)
 * de binaries.prisma.sh, que é bloqueado em alguns ambientes (CI fechado, redes corporativas).
 * Esta ferramenta usa o mesmo motor compilado para WebAssembly (pacote npm) e grava o histórico
 * na tabela padrão `_prisma_migrations`, com o mesmo checksum. Por isso é 100% compatível:
 * `prisma migrate deploy` / `prisma migrate status` continuam a funcionar sobre o mesmo banco.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..");
loadEnv({ path: path.resolve(pkgRoot, "../../.env"), quiet: true });

const schemaPath = path.join(pkgRoot, "prisma", "schema.prisma");
const migrationsDir = path.join(pkgRoot, "prisma", "migrations");
const snapshotPath = path.join(migrationsDir, "schema.snapshot.prisma");
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function listMigrations() {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(migrationsDir, d.name, "migration.sql")))
    .map((d) => d.name)
    .sort();
}

function checksum(sql) {
  return crypto.createHash("sha256").update(sql).digest("hex");
}

async function withClient(fn) {
  if (!connectionString) fail("DATABASE_URL não definida. Copie .env.example para .env.");
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
  } catch (e) {
    fail(`Não foi possível ligar ao banco (${connectionString.replace(/:[^:@/]+@/, ":***@")}).\n  ${e.message}\n  Está a correr? (docker compose up -d)`);
  }
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function ensureDatabaseExists() {
  // Cria o banco do DATABASE_URL se ainda não existir (conveniência para dev).
  const url = new URL(connectionString);
  const dbName = decodeURIComponent(url.pathname.slice(1));
  if (!dbName || dbName === "postgres") return;
  const adminUrl = new URL(connectionString);
  adminUrl.pathname = "/postgres";
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
    const r = await client.query("select 1 from pg_database where datname = $1", [dbName]);
    if (r.rowCount === 0) {
      await client.query(`create database "${dbName.replace(/"/g, '""')}"`);
      console.log(`• banco "${dbName}" criado`);
    }
  } catch {
    // Sem permissão para criar (ex.: Supabase): segue e deixa o connect normal reportar.
  } finally {
    await client.end().catch(() => {});
  }
}

const MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id"                  VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum"            VARCHAR(64) NOT NULL,
  "finished_at"         TIMESTAMPTZ,
  "migration_name"      VARCHAR(255) NOT NULL,
  "logs"                TEXT,
  "rolled_back_at"      TIMESTAMPTZ,
  "started_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);`;

async function appliedMigrations(client) {
  await client.query(MIGRATIONS_TABLE);
  const r = await client.query(
    `select migration_name, checksum from "_prisma_migrations"
     where finished_at is not null and rolled_back_at is null`,
  );
  return new Map(r.rows.map((row) => [row.migration_name, row.checksum]));
}

async function deploy({ quiet = false } = {}) {
  await ensureDatabaseExists();
  await withClient(async (client) => {
    const applied = await appliedMigrations(client);
    const pending = listMigrations().filter((m) => !applied.has(m));
    for (const name of listMigrations()) {
      if (!applied.has(name)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8");
      if (applied.get(name) !== checksum(sql)) {
        console.warn(`⚠ a migração ${name} foi alterada depois de aplicada (checksum diferente)`);
      }
    }
    if (pending.length === 0) {
      if (!quiet) console.log("✓ banco atualizado, nenhuma migração pendente");
      return;
    }
    for (const name of pending) {
      const sql = fs.readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8");
      const id = crypto.randomUUID();
      await client.query("BEGIN");
      try {
        await client.query(
          `insert into "_prisma_migrations" (id, checksum, migration_name, started_at) values ($1, $2, $3, now())`,
          [id, checksum(sql), name],
        );
        await client.query(sql);
        await client.query(
          `update "_prisma_migrations" set finished_at = now(), applied_steps_count = 1 where id = $1`,
          [id],
        );
        await client.query("COMMIT");
        console.log(`✓ aplicada ${name}`);
      } catch (e) {
        await client.query("ROLLBACK");
        fail(`a migração ${name} falhou: ${e.message}`);
      }
    }
  });
}

async function status() {
  await withClient(async (client) => {
    const applied = await appliedMigrations(client);
    for (const name of listMigrations()) {
      console.log(`${applied.has(name) ? "✓ aplicada " : "• pendente "} ${name}`);
    }
  });
}

async function reset() {
  if (process.env.NODE_ENV === "production") fail("reset não é permitido em produção");
  await ensureDatabaseExists();
  await withClient(async (client) => {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
    await client.query("GRANT ALL ON SCHEMA public TO public;");
    console.log("• schema public recriado");
  });
  await deploy();
}

async function newMigration(rawName) {
  await ensureDatabaseExists();
  if (!rawName) fail('indique um nome: pnpm db:migrate:new "adiciona campo x"');
  const name = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const [{ SchemaEngine }, { PrismaPg }, { bindMigrationAwareSqlAdapterFactory }] = await Promise.all([
    import("@prisma/schema-engine-wasm"),
    import("@prisma/adapter-pg"),
    import("@prisma/driver-adapter-utils"),
  ]);
  const schema = fs.readFileSync(schemaPath, "utf8");
  const previous = fs.existsSync(snapshotPath) ? fs.readFileSync(snapshotPath, "utf8") : null;
  const factory = new PrismaPg({ connectionString: connectionString ?? "postgresql://localhost/postgres" });
  const engine = await SchemaEngine.new(
    { datamodels: [["schema.prisma", schema]] },
    () => {},
    bindMigrationAwareSqlAdapterFactory(factory),
  );
  const result = await engine.diff({
    from: previous
      ? { tag: "schemaDatamodel", files: [{ path: "schema.prisma", content: previous }] }
      : { tag: "empty" },
    to: { tag: "schemaDatamodel", files: [{ path: "schema.prisma", content: schema }] },
    script: true,
    exitCode: null,
    filters: { externalTables: [], externalEnums: [] },
  });
  const sql = (result.stdout ?? "").trim();
  if (!sql || sql === "-- This is an empty migration.") {
    console.log("✓ schema.prisma não tem mudanças; nenhuma migração criada");
    return;
  }
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const dir = path.join(migrationsDir, `${stamp}_${name}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "migration.sql"), `${sql}\n`);
  fs.writeFileSync(snapshotPath, schema);
  const lock = path.join(migrationsDir, "migration_lock.toml");
  if (!fs.existsSync(lock)) {
    fs.writeFileSync(lock, '# Gerido pelo Prisma. Não editar.\nprovider = "postgresql"\n');
  }
  console.log(`✓ criada prisma/migrations/${stamp}_${name}/migration.sql`);
  console.log("  Reveja o SQL e depois rode: pnpm db:migrate");
}

const [cmd, ...args] = process.argv.slice(2);
const commands = {
  deploy: () => deploy(),
  status: () => status(),
  reset: () => reset(),
  new: () => newMigration(args.join(" ")),
};
if (!commands[cmd]) fail("uso: migrate.mjs <new|deploy|status|reset>");
await commands[cmd]();
process.exit(0);
