/**
 * Cria (ou reativa) uma conta do painel admin SaaS.
 *   pnpm db:create-admin <email> "<nome>" [SUPER_ADMIN|SUPPORT|SALES]
 * A senha é pedida no terminal (não fica no histórico do shell). O 2FA é configurado no 1.º login.
 */
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });

const { hashPassword } = await import("@mesapay/auth");
const { prisma } = await import("./index");

const [email, name, roleArg = "SUPER_ADMIN"] = process.argv.slice(2);
const roles = ["SUPER_ADMIN", "SUPPORT", "SALES"] as const;
type Role = (typeof roles)[number];

if (!email || !name || !roles.includes(roleArg as Role)) {
  console.error('uso: pnpm db:create-admin <email> "<nome>" [SUPER_ADMIN|SUPPORT|SALES]');
  process.exit(1);
}

const password =
  process.env.ADMIN_PASSWORD ??
  (await (async () => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question("Senha (mín. 12 caracteres): ");
    rl.close();
    return answer;
  })());

if (password.length < 12) {
  console.error("✖ a senha precisa de pelo menos 12 caracteres");
  process.exit(1);
}

const normalized = email.trim().toLowerCase();
const passwordHash = await hashPassword(password);
await prisma.saasUser.upsert({
  where: { email: normalized },
  create: { email: normalized, name, role: roleArg as Role, passwordHash },
  update: { name, role: roleArg as Role, passwordHash, active: true },
});
console.log(`✓ conta admin ${normalized} (${roleArg}) pronta. O 2FA será configurado no primeiro login.`);
process.exit(0);
