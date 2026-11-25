"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { markAwakenedAction } from "@/app/actions/profile";
import { RankBadge } from "@/components/system/rank-badge";
import { HunterAvatar } from "@/components/system/hunter-avatar";
import { AvatarUploader } from "@/components/profile/avatar-uploader";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

const BOOT_LINES = [
  "INITIALISING HUNTER REGISTRY…",
  "BINDING IDENTITY TO THE SYSTEM…",
  "CALIBRATING RANK ASSESSMENT…",
  "AWAKENING DETECTED.",
];

export function AwakeningCinematic({ profile }: { profile: Profile }) {
  const [stage, setStage] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const marked = useRef(false);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), 550),
      setTimeout(() => setStage(2), 1250),
      setTimeout(() => setStage(3), 2000),
      setTimeout(() => setStage(4), 2750),
      setTimeout(() => setRevealed(true), 3200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    void markAwakenedAction();
  }, []);

  const skip = () => {
    setStage(4);
    setRevealed(true);
  };

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center px-4 py-10">
      {/* Ignition flash */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
        <div
          className="h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(56,225,255,0.55),transparent_65%)]"
          style={{ animation: "burst 2.4s ease-out 0.4s both" }}
        />
      </div>

      <div className="w-full text-center">
        <p className="hud-label" style={{ color: "var(--color-cyan)" }}>
          [SYSTEM] AWAKENING SEQUENCE
        </p>

        <h1 className="hero-title mt-4 text-4xl text-text sm:text-5xl">
          {stage >= 3 ? <span className="glow-text">AWAKENING DETECTED.</span> : "Detecting…"}
        </h1>

        <div className="mx-auto mt-5 h-16 max-w-md space-y-1 text-left font-mono text-[0.66rem] tracking-[0.05em]">
          {BOOT_LINES.slice(0, Math.max(1, stage)).map((line, index) => (
            <p key={line} className={cn("text-cyan/70", index === stage - 1 && "text-cyan")}>
              <span className="text-faint">›</span> {line}
            </p>
          ))}
        </div>

        {!revealed ? (
          <button
            type="button"
            onClick={skip}
            className="mt-6 text-[0.62rem] uppercase tracking-[0.22em] text-faint hover:text-text"
          >
            Skip sequence
          </button>
        ) : null}

        <div
          className={cn(
            "mt-8 overflow-hidden rounded-2xl border border-cyan/25 bg-[linear-gradient(155deg,rgba(14,26,44,0.92),rgba(6,11,20,0.96))] p-6 text-left transition-all duration-700",
            revealed ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
          )}
          style={{ boxShadow: "0 0 60px -30px rgba(56,225,255,0.8), inset 0 1px 0 rgba(160,210,255,0.08)" }}
          aria-hidden={!revealed}
        >
          <p className="hud-label" style={{ color: "var(--color-cyan)" }}>
            Welcome to the Hunter Association
          </p>

          <div className="mt-3 flex items-center gap-3">
            <HunterAvatar username={profile.username} avatarUrl={avatarUrl} rank={profile.rank} size={52} />
            <div className="min-w-0 flex-1">
              <p className="font-hud truncate text-base text-text">{profile.username}</p>
              <p className="numeric text-[0.62rem] uppercase tracking-[0.2em] text-faint">{profile.hunter_id}</p>
            </div>
            <RankBadge rank={profile.rank} size="lg" showName />
          </div>

          <dl className="mt-5 grid grid-cols-3 gap-2">
            {[
              { label: "Level", value: String(profile.level).padStart(2, "0") },
              { label: "XP", value: "0" },
              { label: "Sessions", value: "0" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-line/60 bg-black/30 px-3 py-2">
                <dt className="hud-label">{item.label}</dt>
                <dd className="numeric mt-0.5 text-lg text-text">{item.value}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-4 text-xs leading-relaxed text-muted">
            Your record is now part of the System. Every credited minute of focus earns experience. Rank is earned on
            lifetime XP alone — there are no shortcuts to buy.
          </p>

          <AvatarUploader profile={profile} onChange={(url) => setAvatarUrl(url ?? "")} className="mt-4" />

          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link href="/study" className="btn btn-primary px-4 py-2.5 text-sm">
              Start your first session <ArrowRight size={14} aria-hidden />
            </Link>
            <Link href="/profile" className="btn btn-ghost px-4 py-2.5 text-sm">
              <Sparkles size={13} aria-hidden /> Personalise your record
            </Link>
          </div>
        </div>

        <p className="mt-6 text-[0.62rem] uppercase tracking-[0.2em] text-faint">
          Welcome, Hunter. Your progression is now being recorded.
        </p>
      </div>
    </div>
  );
}
