"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { loginAction, type AuthState } from "@/app/actions/auth";

const INITIAL: AuthState = { status: "idle" };

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL);

  // Publish the browser's real timezone so day boundaries and streaks follow
  // the hunter's local calendar.
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
    <form action={formAction} className="space-y-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <input type="hidden" name="timezone" value="UTC" data-timezone-field />

      {state.status === "error" ? (
        <div className="flex items-start gap-2 rounded-lg border border-ember/35 bg-ember/10 px-3 py-2.5 text-xs text-ember">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>{state.message}</span>
        </div>
      ) : null}

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
      </div>

      <div>
        <label htmlFor="password" className="hud-label mb-1.5 block">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={`field ${state.fields?.password ? "field-invalid" : ""}`}
        />
      </div>

      <button type="submit" className="btn btn-primary w-full py-2.5" disabled={pending}>
        {pending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : null}
        {pending ? "Verifying…" : "Enter the System"}
      </button>

      <p className="text-center text-xs text-faint">
        Not awakened yet?{" "}
        <Link href="/signup" className="text-cyan hover:underline">
          Register
        </Link>
      </p>
    </form>
  );
}
