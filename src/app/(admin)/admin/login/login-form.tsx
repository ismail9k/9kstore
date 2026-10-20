"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="flex w-full max-w-xs flex-col gap-3">
      <Label htmlFor="password">Password</Label>
      <Input
        id="password"
        type="password"
        name="password"
        autoComplete="current-password"
        required
        autoFocus
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "password-error" : undefined}
      />
      {state.error ? (
        <p id="password-error" role="alert" className="text-sm text-foreground">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        Log in
      </Button>
    </form>
  );
}
