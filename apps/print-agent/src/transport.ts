import { open } from "node:fs/promises";
import net from "node:net";

/**
 * Como os bytes chegam à térmica:
 *   "192.168.0.50" ou "192.168.0.50:9100"  → rede (RAW/JetDirect, porta 9100 por padrão)
 *   "/dev/usb/lp0"                          → USB no Linux / Raspberry Pi
 *   "\\\\localhost\\Termica"                 → impressora partilhada no Windows (driver "Genérico / Somente texto")
 */
export type PrinterTarget = { kind: "tcp"; host: string; port: number } | { kind: "file"; path: string };

export function parseAddress(address: string): PrinterTarget {
  const a = address.trim();
  if (a.startsWith("/") || a.startsWith("\\\\") || /^[A-Za-z]:\\/.test(a) || /^(COM|LPT)\d+$/i.test(a)) return { kind: "file", path: a };
  const m = /^(?:tcp:\/\/)?(\[[^\]]+\]|[^:]+)(?::(\d{1,5}))?$/.exec(a);
  if (!m) throw new Error(`Endereço de impressora inválido: ${address}`);
  return { kind: "tcp", host: (m[1] ?? "").replace(/^\[|\]$/g, ""), port: m[2] ? Number(m[2]) : 9100 };
}

export function sendTcp(host: string, port: number, data: Uint8Array, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let done = false;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };
    socket.setTimeout(timeoutMs, () => finish(new Error(`Impressora ${host}:${port} não respondeu em ${timeoutMs / 1000} s`)));
    socket.once("error", (e) => finish(new Error(`Sem ligação à impressora ${host}:${port}: ${e.message}`)));
    socket.once("connect", () => {
      socket.end(Buffer.from(data), () => finish());
    });
  });
}

export async function sendFile(path: string, data: Uint8Array): Promise<void> {
  const fh = await open(path, "w");
  try {
    await fh.write(data);
  } finally {
    await fh.close();
  }
}

export async function sendToPrinter(address: string, data: Uint8Array): Promise<void> {
  const t = parseAddress(address);
  if (t.kind === "tcp") await sendTcp(t.host, t.port, data);
  else await sendFile(t.path, data);
}
