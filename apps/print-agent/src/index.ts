import path from "node:path";
import { config as loadEnv } from "dotenv";
import { createAgentServer } from "./server";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });

const port = Number(process.env.PRINT_AGENT_PORT ?? 3010);
const server = createAgentServer();

server.listen(port, "127.0.0.1", () => {
  console.log(`🖨  MesaPay Print Agent em http://127.0.0.1:${port}/health`);
  console.log("   A ligação às impressoras térmicas (ESC/POS) é ativada na Fase 3.");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
