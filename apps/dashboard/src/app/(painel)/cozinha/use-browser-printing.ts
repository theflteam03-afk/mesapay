"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Impressão pelo navegador (opção C do plano): este computador "é" a impressora escolhida.
 * Busca os tickets na fila e imprime cada um num iframe escondido com window.print().
 * Com o Chrome aberto em --kiosk-printing, imprime direto na impressora padrão, sem janela.
 * Cada consulta à fila também é o sinal de vida (sem este ecrã aberto, a impressora fica offline).
 */

const STORAGE_KEY = "mp_print_here";

export function readPrintHere(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writePrintHere(printerId: string | null) {
  try {
    if (printerId) window.localStorage.setItem(STORAGE_KEY, printerId);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* sem armazenamento: vale só até recarregar */
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);
}

/** Imprime o texto do ticket (monoespaçado, 80 mm) num iframe escondido. */
function printText(text: string, width: number): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:80mm;height:10px;border:0;opacity:0;pointer-events:none";
    const paper = width <= 32 ? "58mm" : "80mm";
    iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>
      @page { size: ${paper} auto; margin: 0 }
      html, body { margin: 0; padding: 0 }
      pre { margin: 0; padding: 2mm; font: 600 ${width <= 32 ? 10 : 11}px/1.25 "Courier New", ui-monospace, monospace; white-space: pre; color: #000 }
    </style></head><body><pre>${escapeHtml(text)}</pre></body></html>`;
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => {
          iframe.remove();
          resolve();
        }, 300);
      }
    };
    document.body.appendChild(iframe);
  });
}

export function useBrowserPrinting(printerId: string | null) {
  const [lastTicket, setLastTicket] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const again = useRef(false);

  const drain = useCallback(async () => {
    if (!printerId) return;
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    try {
      do {
        again.current = false;
        for (;;) {
          const res = await fetch(`/api/print/browser/${printerId}/next`, { method: "POST", cache: "no-store" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = (await res.json()) as { job: { id: string; text: string } | null; width: number };
          if (!body.job) break;
          let ok = true;
          try {
            await printText(body.job.text, body.width);
            setLastTicket(body.job.text);
          } catch {
            ok = false;
          }
          await fetch(`/api/print/browser/${printerId}/jobs/${body.job.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(ok ? { ok: true } : { ok: false, error: "O navegador não conseguiu imprimir." }),
          });
        }
      } while (again.current);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy.current = false;
    }
  }, [printerId]);

  // Consulta a fila ao ligar e a cada 5 s (sinal de vida + rede que perdeu um aviso).
  useEffect(() => {
    if (!printerId) return;
    void drain();
    const t = setInterval(() => void drain(), 5000);
    return () => clearInterval(t);
  }, [printerId, drain]);

  return { kick: drain, lastTicket, error };
}

/** Bip de alerta (Web Audio). O navegador só deixa tocar depois de um clique na página. */
export function useAlertSound(active: boolean) {
  const ctx = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(false);

  const enable = useCallback(() => {
    try {
      ctx.current ??= new AudioContext();
      void ctx.current.resume();
      setEnabled(true);
    } catch {
      setEnabled(false);
    }
  }, []);

  const beep = useCallback(() => {
    const c = ctx.current;
    if (!c || c.state !== "running") return;
    [0, 0.35, 0.7].forEach((offset) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "square";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, c.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, c.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + offset + 0.25);
      osc.connect(gain).connect(c.destination);
      osc.start(c.currentTime + offset);
      osc.stop(c.currentTime + offset + 0.3);
    });
  }, []);

  // Toca quando o alerta aparece e repete a cada 60 s enquanto durar.
  useEffect(() => {
    if (!active || !enabled) return;
    beep();
    const t = setInterval(beep, 60_000);
    return () => clearInterval(t);
  }, [active, enabled, beep]);

  return { enabled, enable };
}
