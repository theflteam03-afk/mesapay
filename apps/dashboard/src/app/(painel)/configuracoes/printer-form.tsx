"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import type { Messages } from "@mesapay/i18n";
import { Alert, Button, Input } from "@mesapay/ui";
import { deletePrinter, newPrinterKey, savePrinter, type PrinterFormState } from "./actions";

type M = Messages["dashboard"]["printers"];
type PrinterType = "BROWSER" | "LOCAL_AGENT" | "CLOUDPRNT" | "EPSON_SDP";

export interface PrinterRow {
  id: string;
  name: string;
  station: "KITCHEN" | "BAR";
  type: PrinterType;
  address: string | null;
  width: number;
}

const selectClass = "h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px]";

/** Formulário de impressora (novo ou editar). */
export function PrinterForm({ m, printer, stationLabels }: { m: M; printer?: PrinterRow; stationLabels: { KITCHEN: string; BAR: string } }) {
  const [state, action, pending] = useActionState<PrinterFormState, FormData>(savePrinter, {});
  const [type, setType] = useState<PrinterType>(printer?.type ?? "LOCAL_AGENT");
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && !printer) formRef.current?.reset();
  }, [state, printer]);

  return (
    <form ref={formRef} action={action} className="grid gap-3 sm:grid-cols-2" data-testid={printer ? "printer-edit" : "printer-new"}>
      {printer ? <input type="hidden" name="id" value={printer.id} /> : null}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {m.name}
        <Input name="name" defaultValue={printer?.name ?? ""} required maxLength={40} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {m.station}
        <select name="station" defaultValue={printer?.station ?? "KITCHEN"} className={selectClass}>
          <option value="KITCHEN">{stationLabels.KITCHEN}</option>
          <option value="BAR">{stationLabels.BAR}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {m.type}
        <select name="type" value={type} onChange={(e) => setType(e.target.value as PrinterType)} className={selectClass}>
          {(Object.keys(m.types) as PrinterType[]).map((k) => (
            <option key={k} value={k}>
              {m.types[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {m.paper}
        <select name="width" defaultValue={String(printer?.width ?? 48)} className={selectClass}>
          <option value="48">{m.paper80}</option>
          <option value="32">{m.paper58}</option>
        </select>
      </label>
      {type === "LOCAL_AGENT" ? (
        <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
          {m.address}
          <Input name="address" defaultValue={printer?.address ?? ""} placeholder="192.168.0.50:9100" required />
          <span className="text-xs font-normal text-muted">{m.addressHint}</span>
        </label>
      ) : null}
      {state.error ? <Alert className="sm:col-span-2">{m.invalid}</Alert> : null}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {printer ? m.save : m.add}
        </Button>
      </div>
    </form>
  );
}

/** Chave secreta (escondida por padrão) + ações de remover/gerar nova chave. */
export function PrinterKeyActions({ m, printerId, setup }: { m: M; printerId: string; setup: string | null }) {
  const [show, setShow] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      {setup ? (
        <div className="flex items-start gap-2">
          <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs" data-testid="printer-setup">
            {show ? setup : setup.replace(/[A-Za-z0-9]{24,64}/g, (k) => `${k.slice(0, 4)}${"•".repeat(12)}`)}
          </pre>
          <Button size="sm" variant="secondary" onClick={() => setShow((v) => !v)}>
            {m.showKey}
          </Button>
        </div>
      ) : null}
      <div className="flex gap-2">
        {setup ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(() => newPrinterKey(printerId))}>
            {m.regenerate}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" className="text-danger" disabled={pending} onClick={() => start(() => deletePrinter(printerId))}>
          {m.remove}
        </Button>
      </div>
    </div>
  );
}
