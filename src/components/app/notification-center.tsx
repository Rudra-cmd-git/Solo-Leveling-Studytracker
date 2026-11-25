"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import type { NotificationRow } from "@/lib/types";
import { markNotificationsReadAction } from "@/app/actions/profile";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";

const TYPE_ACCENT: Record<string, string> = {
  level: "var(--color-cyan)",
  rank: "var(--color-gold)",
  quest: "var(--color-violet)",
  achievement: "var(--color-violet)",
  session: "var(--color-cyan)",
  xp: "var(--color-cyan)",
  system: "var(--color-azure)",
  report: "var(--color-azure)",
};

export function NotificationCenter({
  notifications,
  unread,
}: {
  notifications: NotificationRow[];
  unread: number;
}) {
  const [open, setOpen] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const unreadCount = cleared ? 0 : unread;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAll = () => {
    startTransition(async () => {
      const result = await markNotificationsReadAction();
      if (result.ok) setCleared(true);
    });
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="btn btn-ghost relative h-9 w-9 !rounded-lg !px-0"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
      >
        <Bell size={16} aria-hidden />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-cyan)] px-1 text-[0.55rem] font-bold text-[#00131b] shadow-[0_0_12px_rgba(56,225,255,0.9)]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line/70 bg-[#070d18]/97 shadow-[0_30px_80px_-30px_rgba(0,0,0,1)] backdrop-blur-xl"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between border-b border-line/60 px-3.5 py-2.5">
            <span className="hud-label" style={{ color: "var(--color-cyan)" }}>
              [SYSTEM FEED]
            </span>
            <button
              type="button"
              onClick={markAll}
              disabled={pending || unreadCount === 0}
              className="inline-flex items-center gap-1 text-[0.62rem] uppercase tracking-[0.16em] text-faint transition-colors hover:text-text disabled:opacity-40"
            >
              <CheckCheck size={12} aria-hidden /> Mark read
            </button>
          </div>

          <div className="max-h-[22rem] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Inbox size={22} className="text-faint" aria-hidden />
                <p className="text-xs text-faint">The System has nothing to report yet.</p>
              </div>
            ) : (
              <ul className="divide-y divide-line/40">
                {notifications.map((item) => (
                  <li
                    key={item.id}
                    className={cn(
                      "flex gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-white/[0.03]",
                      !item.is_read && "bg-white/[0.02]",
                    )}
                  >
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background: TYPE_ACCENT[item.type] ?? "var(--color-cyan)",
                        boxShadow: `0 0 8px ${TYPE_ACCENT[item.type] ?? "var(--color-cyan)"}`,
                        opacity: item.is_read ? 0.35 : 1,
                      }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="font-hud text-[0.68rem] text-cyan/85">{item.title}</p>
                      <p className="mt-0.5 break-words text-xs text-muted">{item.message}</p>
                      <p className="mt-1 text-[0.6rem] uppercase tracking-[0.14em] text-faint/80">
                        {timeAgo(item.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-line/60 px-3.5 py-2 text-center">
            <Link
              href="/dashboard#feed"
              onClick={() => setOpen(false)}
              className="text-[0.62rem] uppercase tracking-[0.16em] text-cyan/80 hover:text-cyan"
            >
              Open full feed
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
