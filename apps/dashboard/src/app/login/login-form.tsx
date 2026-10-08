"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@mesapay/ui";
import { loginOwner, type LoginState } from "./actions";

export interface LoginLabels {
  email: string;
  password: string;
  trustDevice: string;
  signIn: string;
  signingIn: string;
}

export function LoginForm({ labels }: { labels: LoginLabels }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginOwner, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Field label={labels.email} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required defaultValue={state.email} autoFocus />
      </Field>
      <Field label={labels.password} htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <label className="flex items-center gap-2.5 text-sm text-fg select-none">
        <input type="checkbox" name="trusted" defaultChecked className="size-4 accent-[var(--brand)]" />
        {labels.trustDevice}
      </label>
      <Button type="submit" size="lg" disabled={pending} className="mt-1">
        {pending ? labels.signingIn : labels.signIn}
      </Button>
    </form>
  );
}
