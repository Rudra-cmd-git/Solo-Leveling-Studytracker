"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surfaced in the server logs during development; no analytics in the free tier.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-16">
      <div className="panel panel-glow p-6 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg border border-ember/30 bg-ember/10 text-ember">
          <TriangleAlert size={18} aria-hidden />
        </span>
        <p className="hud-label mt-4" style={{ color: "var(--color-ember)" }}>
          [SYSTEM] FAULT DETECTED
        </p>
        <h1 className="hero-title mt-2 text-2xl text-text">The System hit an error</h1>
        <p className="mx-auto mt-2 max-w-sm text-xs text-muted">
          Nothing was lost. Your recorded sessions are stored server-side. Try the action again, or return to your
          status window.
        </p>
        {error.digest ? (
          <p className="numeric mt-2 text-[0.6rem] uppercase tracking-[0.18em] text-faint">ref {error.digest}</p>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={reset} className="btn btn-primary px-4 py-2 text-sm">
            <RotateCcw size={13} aria-hidden /> Retry
          </button>
          <Link href="/dashboard" className="btn btn-ghost px-4 py-2 text-sm">
            Status window
          </Link>
        </div>
      </div>
    </div>
  );
}
