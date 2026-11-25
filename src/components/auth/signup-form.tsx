"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { signUpAction, type AuthState } from "@/app/actions/auth";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";

const INITIAL: AuthState = { status: "idle" };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-[0.68rem] text-ember">{message}</p>;
}

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, INITIAL);

  useEffect(() => {
    const field = document.querySelector<HTMLInputElement>("[data-timezone-field]");
    if (!field) return;
    try {
      field.value = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      field.value = "UTC";
    }
  }, []);

  return (
    <div className="space-y-4">
      <GoogleButton label="Continue with Google" />
      <OrDivider />

      <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="timezone" value="UTC" data-timezone-field />

      {state.status === "error" && !state.fields ? (
        <div className="flex items-start gap-2 rounded-lg border border-ember/35 bg-ember/10 px-3 py-2.5 text-xs text-ember">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>{state.message}</span>
        </div>
      ) : null}

      {state.status === "success" ? (
        <div className="rounded-lg border border-mint/35 bg-mint/10 px-3 py-2.5 text-xs text-mint">
          {state.message}
        </div>
      ) : null}

      <div>
        <label htmlFor="username" className="hud-label mb-1.5 block">
          Hunter handle
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          minLength={3}
          maxLength={20}
          pattern="[A-Za-z0-9_]{3,20}"
          placeholder="ShadowRider"
          className={`field ${state.fields?.username ? "field-invalid" : ""}`}
          aria-describedby="username-hint"
        />
        <p id="username-hint" className="mt-1 text-[0.65rem] text-faint">
          3–20 characters. Letters, numbers, underscores. This is public.
        </p>
        <FieldError message={state.fields?.username} />
      </div>

      <div>
        <label htmlFor="email" className="hud-label mb-1.5 block">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="hunter@example.com"
          className={`field ${state.fields?.email ? "field-invalid" : ""}`}
        />
        <p className="mt-1 text-[0.65rem] text-faint">Used for sign-in only. Never shown on your profile.</p>
        <FieldError message={state.fields?.email} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="password" className="hud-label mb-1.5 block">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className={`field ${state.fields?.password ? "field-invalid" : ""}`}
          />
          <FieldError message={state.fields?.password} />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="hud-label mb-1.5 block">
            Confirm
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className={`field ${state.fields?.confirmPassword ? "field-invalid" : ""}`}
          />
          <FieldError message={state.fields?.confirmPassword} />
        </div>
      </div>

      <button type="submit" className="btn btn-primary w-full py-2.5" disabled={pending}>
        {pending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : null}
        {pending ? "Registering awakening…" : "Awaken"}
      </button>

      <p className="text-center text-xs text-faint">
        Already registered?{" "}
        <Link href="/login" className="text-cyan hover:underline">
          Enter the System
        </Link>
      </p>
      </form>
    </div>
  );
}
