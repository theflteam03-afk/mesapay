"use client";

import { useEffect, useRef } from "react";
import type { ClientEvent } from "./events";

/**
 * Liga o navegador ao fluxo SSE `url` e chama `onEvent` a cada aviso.
 *
 * Nunca depende só do tempo real para estar certo:
 *  - ao religar (rede caiu, celular voltou do bloqueio) → `resync`;
 *  - ao voltar a mostrar a página → `resync`;
 *  - a cada `fallbackMs` (padrão 30 s) → `resync`, caso a ligação esteja "zumbi".
 */
export function useLiveEvents(url: string | null, onEvent: (event: ClientEvent) => void, opts: { fallbackMs?: number } = {}) {
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);

  const fallbackMs = opts.fallbackMs ?? 30_000;

  useEffect(() => {
    if (!url || typeof window === "undefined") return;
    let source: EventSource | null = null;
    let opened = false;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const resync = () => handler.current({ type: "resync" });

    const connect = () => {
      if (stopped) return;
      source = new EventSource(url);
      source.onopen = () => {
        if (opened) resync();
        opened = true;
      };
      source.onmessage = (msg) => {
        try {
          handler.current(JSON.parse(msg.data as string) as ClientEvent);
        } catch {
          /* aviso mal formado: ignorar */
        }
      };
      source.onerror = () => {
        // O EventSource religa sozinho; se desistiu (CLOSED), voltamos a tentar.
        if (source?.readyState === EventSource.CLOSED) {
          source.close();
          clearTimeout(retry);
          retry = setTimeout(connect, 3000);
        }
      };
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") resync();
    };

    connect();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", resync);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") resync();
    }, fallbackMs);

    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", resync);
      source?.close();
    };
  }, [url, fallbackMs]);
}
