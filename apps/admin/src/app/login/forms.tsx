"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@mesapay/ui";
import { loginAdmin, verifyAdminCode, type FormState } from "./actions";

export function PasswordForm({ labels }: { labels: { email: string; password: string; signIn: string; signingIn: string } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAdmin, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Field label={labels.email} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required defaultValue={state.email} autoFocus />
      </Field>
      <Field label={labels.password} htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" size="lg" disabled={pending} className="mt-1">
        {pending ? labels.signingIn : labels.signIn}
      </Button>
    </form>
  );
}

export function CodeForm({ labels }: { labels: { code: string; verify: string } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(verifyAdminCode, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Field label={labels.code} htmlFor="code">
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
          className="text-center font-mono text-xl tracking-[0.4em]"
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {labels.verify}
      </Button>
    </form>
  );
}
