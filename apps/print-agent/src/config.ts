import { existsSync, readFileSync } from "node:fs";

/**
 * Configuração do agente (variáveis de ambiente ou ficheiro mesapay-print.json):
 *
 *   MESAPAY_API_URL=https://app.mesapay.com.br
 *   MESAPAY_PRINTERS=CHAVE_DA_COZINHA,CHAVE_DO_BAR
 *
 * O endereço de cada térmica (IP ou USB) é definido no painel → Configurações → Impressoras.
 * Para o sobrepor só neste computador: MESAPAY_PRINTERS=CHAVE=192.168.0.50:9100
 */
export interface AgentConfig {
  apiUrl: string;
  printers: { key: string; address?: string }[];
  intervalMs: number;
  port: number;
}

interface FileConfig {
  apiUrl?: string;
  printers?: (string | { key: string; address?: string })[];
  intervalMs?: number;
}

export function parsePrinters(raw: string): { key: string; address?: string }[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [key = "", ...rest] = entry.split("=");
      const address = rest.join("=");
      return address ? { key, address } : { key };
    });
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const file = env.MESAPAY_CONFIG ?? "mesapay-print.json";
  const fromFile: FileConfig = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as FileConfig) : {};
  const printers = env.MESAPAY_PRINTERS
    ? parsePrinters(env.MESAPAY_PRINTERS)
    : (fromFile.printers ?? []).map((p) => (typeof p === "string" ? { key: p } : p));
  return {
    apiUrl: env.MESAPAY_API_URL ?? fromFile.apiUrl ?? env.NEXT_PUBLIC_DASHBOARD_URL ?? "http://localhost:3001",
    printers,
    intervalMs: Number(env.MESAPAY_POLL_MS ?? fromFile.intervalMs ?? 1000),
    port: Number(env.PRINT_AGENT_PORT ?? 3010),
  };
}
