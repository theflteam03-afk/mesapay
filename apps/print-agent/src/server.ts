import { createServer, type Server } from "node:http";
import type { AgentPrinterStatus } from "./agent";

export interface AgentStatus {
  ok: true;
  service: "mesapay-print-agent";
  version: string;
  startedAt: string;
  apiUrl: string | null;
  printers: AgentPrinterStatus[];
}

/**
 * Página local de estado: http://127.0.0.1:3010/health — o restaurante (ou o suporte)
 * confirma que o agente está a correr, ligado à API e quantos tickets já imprimiu.
 */
export function createAgentServer(version = "0.3.0", getPrinters: () => AgentPrinterStatus[] = () => [], apiUrl: string | null = null): Server {
  const startedAt = new Date().toISOString();
  return createServer((req, res) => {
    if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
      const status: AgentStatus = { ok: true, service: "mesapay-print-agent", version, startedAt, apiUrl, printers: getPrinters() };
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(status, null, 2));
      return;
    }
    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "not_found" }));
  });
}
