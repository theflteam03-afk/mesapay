import pg from "pg";
import { PG_CHANNEL, parseEvent, type ClientEvent, type RealtimeEvent } from "./events";

/**
 * Distribuição de eventos no servidor: UMA ligação ao Postgres por processo faz `LISTEN`
 * e reparte as notificações por todos os navegadores ligados por SSE a esse processo.
 *
 * Precisa de uma ligação direta (DIRECT_URL): o "transaction pooler" do Supabase (porta 6543)
 * não suporta LISTEN.
 */

type Listener = (event: ClientEvent) => void;

class RealtimeHub {
  private client: pg.Client | null = null;
  private connecting: Promise<void> | null = null;
  private listeners = new Set<Listener>();
  private retryMs = 500;
  private connectedOnce = false;

  constructor(private readonly connectionString: string) {}

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    void this.ensureConnected();
    return () => {
      this.listeners.delete(fn);
    };
  }

  get size(): number {
    return this.listeners.size;
  }

  private emit(event: ClientEvent) {
    for (const fn of this.listeners) {
      try {
        fn(event);
      } catch (err) {
        console.error("[realtime] erro num ouvinte:", err);
      }
    }
  }

  ensureConnected(): Promise<void> {
    if (this.client) return Promise.resolve();
    this.connecting ??= this.connect().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async connect(): Promise<void> {
    const client = new pg.Client({ connectionString: this.connectionString, keepAlive: true });
    client.on("notification", (msg) => {
      if (msg.channel !== PG_CHANNEL || !msg.payload) return;
      const event = parseEvent(msg.payload);
      if (event) this.emit(event);
    });
    const onDown = (err?: Error) => {
      if (this.client !== client) return;
      this.client = null;
      if (err) console.error("[realtime] ligação LISTEN perdida:", err.message);
      client.removeAllListeners();
      client.end().catch(() => {});
      this.scheduleReconnect();
    };
    client.on("error", onDown);
    client.on("end", () => onDown());
    try {
      await client.connect();
      await client.query(`LISTEN ${PG_CHANNEL}`);
      this.client = client;
      this.retryMs = 500;
      // Se a ligação caiu e voltou, podemos ter perdido eventos: todos ressincronizam.
      if (this.connectedOnce) this.emit({ type: "resync" });
      this.connectedOnce = true;
    } catch (err) {
      console.error("[realtime] não foi possível fazer LISTEN:", (err as Error).message);
      client.removeAllListeners();
      client.end().catch(() => {});
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.listeners.size === 0) return;
    const wait = this.retryMs;
    this.retryMs = Math.min(this.retryMs * 2, 15_000);
    setTimeout(() => void this.ensureConnected(), wait).unref?.();
  }

  async close(): Promise<void> {
    const c = this.client;
    this.client = null;
    this.listeners.clear();
    if (c) {
      c.removeAllListeners();
      await c.end().catch(() => {});
    }
  }
}

const globalForHub = globalThis as unknown as { __mesapayRealtimeHub?: RealtimeHub };

export function getHub(): RealtimeHub {
  if (!globalForHub.__mesapayRealtimeHub) {
    const cs = process.env.DIRECT_URL || process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL/DIRECT_URL não definida");
    globalForHub.__mesapayRealtimeHub = new RealtimeHub(cs);
  }
  return globalForHub.__mesapayRealtimeHub;
}

export function createHub(connectionString: string): RealtimeHub {
  return new RealtimeHub(connectionString);
}

export type { RealtimeHub };

/**
 * Resposta SSE (text/event-stream) com os eventos que passam no filtro.
 * - Envia um comentário a cada 20 s para proxies não fecharem a ligação.
 * - `retry: 2000` faz o EventSource do navegador religar em 2 s se cair.
 * - Fecha sozinha ao fim de `maxDurationMs` (limite das funções serverless); o navegador religa.
 */
export function sseResponse(
  filter: (event: RealtimeEvent) => boolean,
  opts: { signal: AbortSignal; maxDurationMs?: number; hub?: RealtimeHub },
): Response {
  const hub = opts.hub ?? getHub();
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          finish();
        }
      };
      const unsubscribe = hub.subscribe((event) => {
        if (event.type === "resync" || filter(event)) write(`data: ${JSON.stringify(event)}\n\n`);
      });
      const ping = setInterval(() => write(`: ping\n\n`), 20_000);
      const limit = setTimeout(() => finish(), opts.maxDurationMs ?? 270_000);
      function finish() {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        clearTimeout(limit);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* já fechado */
        }
      }
      cleanup = finish;
      opts.signal.addEventListener("abort", finish, { once: true });
      write(`retry: 2000\n: ligado\n\n`);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform: impede a compressão gzip de "segurar" os eventos.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
