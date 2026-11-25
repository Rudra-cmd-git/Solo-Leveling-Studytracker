import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ShieldCheck, Sparkles, Timer, Trophy } from "lucide-react";
import { Panel } from "@/components/system/panel";
import { RANKS } from "@/lib/progression";
import { RankBadge } from "@/components/system/rank-badge";

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[80rem] flex-col px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan/30 bg-[radial-gradient(circle_at_30%_20%,rgba(56,225,255,0.35),transparent_60%)]"
            aria-hidden
          >
            <Sparkles size={15} className="text-cyan" />
          </span>
          <span className="leading-tight">
            <span className="font-hud block text-[0.82rem] text-text">Hunter System</span>
            <span className="block text-[0.55rem] uppercase tracking-[0.3em] text-faint">Study Protocol</span>
          </span>
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[0.68rem] uppercase tracking-[0.18em] text-faint transition-colors hover:text-text"
        >
          <ArrowLeft size={12} aria-hidden /> Back
        </Link>
      </div>

      <div className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[1fr_0.9fr] lg:gap-14">
        <div className="order-2 animate-rise lg:order-1">
          <p className="hud-label" style={{ color: "var(--color-cyan)" }}>
            {eyebrow}
          </p>
          <h1 className="hero-title mt-3 text-4xl text-text sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">{subtitle}</p>

          <ul className="mt-7 space-y-2.5">
            {[
              { icon: Timer, text: "Server-verified focus sessions — 1 credited minute = 1 XP" },
              { icon: Trophy, text: "Global leaderboards with weekly and monthly windows" },
              { icon: ShieldCheck, text: "Row Level Security on every table; your email stays private" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.text} className="flex items-start gap-2.5 text-xs text-muted">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-cyan/25 bg-cyan/8 text-cyan">
                    <Icon size={11} aria-hidden />
                  </span>
                  {item.text}
                </li>
              );
            })}
          </ul>

          <div className="mt-7">
            <p className="hud-label mb-2">Rank ladder</p>
            <div className="flex flex-wrap gap-1.5">
              {RANKS.map((rank) => (
                <RankBadge key={rank.code} rank={rank.code} size="sm" />
              ))}
            </div>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <Panel glow className="p-5 sm:p-6">
            {children}
          </Panel>
        </div>
      </div>
    </div>
  );
}
