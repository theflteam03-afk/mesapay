import { createServer, type Server } from "node:http";

export interface AgentStatus {
  ok: true;
  service: "mesapay-print-agent";
  version: string;
  startedAt: string;
  /** Impressoras locais configuradas (preenchido na Fase 3). */
  printers: { name: string; station: "KITCHEN" | "BAR"; online: boolean }[];
}

/**
 * Agente de impressão local (opção B do plano): na Fase 3 liga-se por WebSocket à API,
 * recebe os PrintJobs e envia ESC/POS para térmicas em rede/USB.
 * Na Fase 1 expõe apenas /health para o restaurante confirmar que o agente está a correr.
 */
export function createAgentServer(version = "0.1.0"): Server {
  const status: AgentStatus = {
    ok: true,
    service: "mesapay-print-agent",
    version,
    startedAt: new Date().toISOString(),
    printers: [],
  };
  return createServer((req, res) => {
    if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(status));
      return;
    }
    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "not_found" }));
  });
}
