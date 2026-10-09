import path from "node:path";
import { config as loadEnv } from "dotenv";
import { PrinterLoop } from "./agent";
import { loadConfig } from "./config";
import { createAgentServer } from "./server";

// Em desenvolvimento lê o .env da raiz do monorepo; num PC do restaurante, as variáveis do sistema.
loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });

const config = loadConfig();
const loops = config.printers.map((p) => new PrinterLoop(config.apiUrl, p.key, { intervalMs: config.intervalMs, addressOverride: p.address }));
const server = createAgentServer(undefined, () => loops.map((l) => l.status), config.apiUrl);

server.listen(config.port, "127.0.0.1", () => {
  console.log(`🖨  MesaPay Print Agent — estado em http://127.0.0.1:${config.port}/health`);
  if (!loops.length) {
    console.log("   Nenhuma impressora configurada. Defina MESAPAY_PRINTERS com a(s) chave(s) do painel → Configurações → Impressoras.");
  } else {
    console.log(`   API: ${config.apiUrl} · ${loops.length} impressora(s)`);
    loops.forEach((l) => l.start());
  }
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    loops.forEach((l) => l.stop());
    server.close(() => process.exit(0));
  });
}
