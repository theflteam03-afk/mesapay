"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Input } from "@mesapay/ui";
import { fill, type TableMessages } from "./i18n";

/** Primeira vez neste navegador: só o nome. Nada de e-mail, senha ou telefone. */
export function NameScreen({
  m,
  restaurant,
  tableNumber,
  initialName,
  busy,
  error,
  onSubmit,
}: {
  m: TableMessages;
  restaurant: { name: string; logoUrl: string | null };
  tableNumber: number;
  initialName: string;
  busy: boolean;
  error: string | null;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) onSubmit(name);
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="relative overflow-hidden bg-brand px-6 pt-[max(env(safe-area-inset-top),3.5rem)] pb-14 text-brand-fg">
        {restaurant.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={restaurant.logoUrl} alt="" className="mb-6 size-16 rounded-2xl bg-white/90 object-contain p-1.5" />
        ) : null}
        <p className="text-sm font-medium opacity-80">{fill(m.tableLabel, { number: tableNumber })}</p>
        <h1 className="mt-1 text-[2.6rem] leading-[1.02] font-semibold" data-testid="restaurant-name">
          {restaurant.name}
        </h1>
        {/* Número da mesa gigante e discreto, a marca d'água do ecrã de entrada. */}
        <span aria-hidden className="pointer-events-none absolute -right-3 -bottom-10 font-display text-[11rem] leading-none font-bold opacity-[0.12]">
          {tableNumber}
        </span>
      </header>

      <form onSubmit={submit} className="-mt-6 flex flex-1 flex-col rounded-t-[28px] bg-bg px-6 pt-8 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <label htmlFor="guest-name" className="font-display text-2xl font-semibold">
          {m.nameTitle}
        </label>
        <p className="mt-1.5 text-sm text-muted">{m.nameHint}</p>
        <Input
          id="guest-name"
          name="name"
          autoComplete="given-name"
          autoCapitalize="words"
          enterKeyHint="go"
          maxLength={30}
          placeholder={m.namePlaceholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-5 h-14 text-lg"
          autoFocus
          data-testid="name-input"
        />
        {error ? <Alert className="mt-3">{error}</Alert> : null}
        <div className="flex-1" />
        <Button type="submit" size="lg" className="mt-6 h-14 w-full text-base" disabled={busy || !name.trim()} data-testid="name-submit">
          {m.seeMenu}
        </Button>
      </form>
    </div>
  );
}
