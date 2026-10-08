import bcrypt from "bcryptjs";

const COST = 12;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres");
  return bcrypt.hash(password, COST);
}

// Hash de uma senha qualquer, calculado uma vez: quando o e-mail não existe comparamos
// contra ele, para o tempo de resposta não revelar quais e-mails têm conta.
let dummyHash: Promise<string> | undefined;

export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    dummyHash ??= bcrypt.hash("mesapay-timing-equalizer", COST);
    await bcrypt.compare(password, await dummyHash);
    return false;
  }
  return bcrypt.compare(password, hash);
}
