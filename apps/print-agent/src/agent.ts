import { sendToPrinter } from "./transport";

/**
 * Ciclo do agente para UMA impressora:
 *   1. pergunta à API "há ticket para mim?" (a cada `intervalMs`, padrão 1 s)
 *   2. envia os bytes ESC/POS para a térmica (rede ou USB)
 *   3. devolve o resultado (impresso / erro) — com erro, a API volta a pôr o ticket na fila
 * Cada pergunta conta como sinal de vida: se o agente parar, o painel mostra "offline" em 30 s.
 */

export interface AgentPrinterStatus {
  key: string;
  name: string | null;
  address: string | null;
  online: boolean;
  lastPollAt: string | null;
  lastPrintAt: string | null;
  lastError: string | null;
  printed: number;
}

interface NextResponse {
  printer?: { name: string; address: string | null };
  job: { id: string; escpos: string; text: string; attempt: number } | null;
}

export interface AgentDeps {
  fetch: typeof fetch;
  send: (address: string, data: Uint8Array) => Promise<void>;
  log: (msg: string) => void;
}

const defaultDeps: AgentDeps = { fetch: globalThis.fetch, send: sendToPrinter, log: (m) => console.log(m) };

export function maskKey(key: string): string {
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export class PrinterLoop {
  readonly status: AgentPrinterStatus;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private failures = 0;

  constructor(
    private readonly apiUrl: string,
    private readonly key: string,
    private readonly opts: { intervalMs?: number; addressOverride?: string } = {},
    private readonly deps: AgentDeps = defaultDeps,
  ) {
    this.status = { key: maskKey(key), name: null, address: opts.addressOverride ?? null, online: false, lastPollAt: null, lastPrintAt: null, lastError: null, printed: 0 };
  }

  start() {
    this.stopped = false;
    void this.tick();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(ms: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), ms);
  }

  /** Uma volta do ciclo. Devolve true se imprimiu algo (então pergunta logo de novo). */
  async tick(): Promise<boolean> {
    const base = this.apiUrl.replace(/\/$/, "");
    let printed = false;
    try {
      const res = await this.deps.fetch(`${base}/api/print/agent/${this.key}/next`, { method: "POST" });
      if (res.status === 401) throw new Error("Chave da impressora inválida ou impressora removida no painel.");
      if (!res.ok) throw new Error(`API respondeu ${res.status}`);
      const body = (await res.json()) as NextResponse;
      this.status.online = true;
      this.status.lastPollAt = new Date().toISOString();
      if (body.printer) this.status.name = body.printer.name;
      const address = this.opts.addressOverride ?? body.printer?.address ?? null;
      this.status.address = address;
      this.failures = 0;

      if (body.job) {
        const job = body.job;
        let result: { ok: true } | { ok: false; error: string };
        try {
          if (!address) throw new Error("Impressora sem endereço configurado no painel.");
          await this.deps.send(address, Uint8Array.from(Buffer.from(job.escpos, "base64")));
          result = { ok: true };
          this.status.printed++;
          this.status.lastPrintAt = new Date().toISOString();
          this.status.lastError = null;
          this.deps.log(`✓ ${this.status.name ?? this.status.key}: ticket impresso (${job.text.split("\n")[1]?.trim() ?? job.id})`);
        } catch (err) {
          const msg = (err as Error).message;
          result = { ok: false, error: msg };
          this.status.lastError = msg;
          this.deps.log(`✖ ${this.status.name ?? this.status.key}: ${msg} (tentativa ${job.attempt})`);
        }
        await this.deps.fetch(`${base}/api/print/agent/${this.key}/jobs/${job.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(result),
        });
        printed = result.ok;
      }
      this.schedule(body.job ? 0 : (this.opts.intervalMs ?? 1000));
    } catch (err) {
      this.failures++;
      this.status.online = false;
      this.status.lastError = (err as Error).message;
      if (this.failures === 1 || this.failures % 30 === 0) this.deps.log(`⚠ ${this.status.name ?? this.status.key}: ${(err as Error).message}`);
      // Sem internet/API: tenta de novo com espera crescente (até 10 s).
      this.schedule(Math.min(10_000, 1000 * 2 ** Math.min(this.failures, 4)));
    }
    return printed;
  }
}
