import Link from "next/link";
import { ArrowLeft, Gauge } from "lucide-react";
import { Panel } from "@/components/system/panel";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-16">
      <Panel glow className="p-6 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg border border-cyan/25 bg-cyan/8 text-cyan">
          <Gauge size={18} aria-hidden />
        </span>
        <p className="hud-label mt-4" style={{ color: "var(--color-cyan)" }}>
          [SYSTEM] SIGNAL LOST
        </p>
        <h1 className="hero-title mt-2 text-3xl text-text">404 — no such record</h1>
        <p className="mx-auto mt-2 max-w-sm text-xs text-muted">
          That coordinate is not registered in the System. It may have been deleted, renamed, or set to private.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href="/dashboard" className="btn btn-primary px-4 py-2 text-sm">
            Status window
          </Link>
          <Link href="/" className="btn btn-ghost px-4 py-2 text-sm">
            <ArrowLeft size={13} aria-hidden /> Landing page
          </Link>
        </div>
      </Panel>
    </div>
  );
}
