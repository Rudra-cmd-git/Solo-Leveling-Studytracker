"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, Plus, Sparkles, X } from "lucide-react";
import { NAV_GROUPS, navItemForPath } from "@/lib/nav";
import { levelProgress, rankProgress } from "@/lib/progression";
import type { NotificationRow, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { RankBadge } from "@/components/system/rank-badge";
import { StatBar } from "@/components/system/meter";
import { HunterAvatar } from "@/components/system/hunter-avatar";
import { NotificationCenter } from "@/components/app/notification-center";
import { logoutAction } from "@/app/actions/auth";

export function AppShell({
  profile,
  notifications,
  unread,
  children,
}: {
  profile: Profile;
  notifications: NotificationRow[];
  unread: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const current = navItemForPath(pathname);
  const level = levelProgress(profile.xp_total);
  const rank = rankProgress(profile.xp_total);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-dvh">
      {/* Mobile scrim */}
      {drawerOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[17rem] flex-col border-r border-line/60 bg-[#060b14]/95 backdrop-blur-xl transition-transform duration-300 lg:translate-x-0",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Primary navigation"
      >
        <div className="flex items-center justify-between px-4 pb-3 pt-4">
          <Link href="/dashboard" className="group flex items-center gap-2.5">
            <span
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-cyan/30 bg-[radial-gradient(circle_at_30%_20%,rgba(56,225,255,0.35),transparent_60%)]"
              aria-hidden
            >
              <Sparkles size={15} className="text-cyan" />
              <span className="absolute inset-0 rounded-lg shadow-[inset_0_0_18px_-8px_rgba(56,225,255,0.9)]" />
            </span>
            <span className="leading-tight">
              <span className="font-hud block text-[0.82rem] text-text">Hunter System</span>
              <span className="block text-[0.58rem] uppercase tracking-[0.28em] text-faint">Association</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="btn btn-ghost h-8 w-8 !rounded-md !px-0 lg:hidden"
            aria-label="Close navigation"
          >
            <X size={14} aria-hidden />
          </button>
        </div>

        {/* Compact status window */}
        <div className="mx-3 mb-3 rounded-xl border border-line/60 bg-[linear-gradient(150deg,rgba(12,22,38,0.85),rgba(6,11,20,0.6))] p-3">
          <div className="flex items-center gap-2.5">
            <HunterAvatar username={profile.username} avatarUrl={profile.avatar_url} rank={profile.rank} size={38} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text">{profile.display_name || profile.username}</p>
              <p className="numeric text-[0.62rem] uppercase tracking-[0.14em] text-faint">{profile.hunter_id}</p>
            </div>
            <RankBadge rank={profile.rank} size="sm" />
          </div>
          <div className="mt-2.5">
            <StatBar
              value={level.intoLevel}
              max={level.needed}
              height="sm"
              label={`LV ${profile.level}`}
              rightLabel={`${formatNumber(profile.xp_total)} XP`}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[0.58rem] uppercase tracking-[0.14em] text-faint">
            <span>{rank.next ? `Next: ${rank.next.code}-Rank` : "Peak rank reached"}</span>
            <span className="numeric">{rank.next ? `${formatNumber(rank.remaining)} to go` : "MAX"}</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-3">
              <p className="hud-label px-2 pb-1.5 pt-1">{group.label}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setDrawerOpen(false)}
                        className={cn(
                          "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.82rem] transition-all",
                          active
                            ? "bg-[linear-gradient(90deg,rgba(56,225,255,0.14),rgba(56,225,255,0.02))] text-text shadow-[inset_0_0_0_1px_rgba(56,225,255,0.22)]"
                            : "text-muted hover:bg-white/[0.035] hover:text-text",
                        )}
                        aria-current={active ? "page" : undefined}
                      >
                        {active ? (
                          <span
                            className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-cyan shadow-[0_0_10px_rgba(56,225,255,0.9)]"
                            aria-hidden
                          />
                        ) : null}
                        <Icon size={15} className={active ? "text-cyan" : "text-faint group-hover:text-muted"} aria-hidden />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-line/60 p-3">
          <Link href="/study" className="btn btn-primary mb-2 w-full py-2 text-[0.78rem]">
            <Plus size={14} aria-hidden /> New session
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost w-full py-1.5 text-[0.72rem]">
              <LogOut size={13} aria-hidden /> Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="lg:pl-[17rem]">
        <header className="sticky top-0 z-30 border-b border-line/50 bg-[#050a12]/85 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-[86rem] items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="btn btn-ghost h-9 w-9 !rounded-lg !px-0 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={16} aria-hidden />
            </button>

            <div className="min-w-0 flex-1">
              <p className="hud-label leading-none" style={{ color: "var(--color-cyan)" }}>
                {current?.label ?? "System"}
              </p>
              <p className="mt-1 truncate text-[0.7rem] text-faint">{current?.description ?? "Hunter interface"}</p>
            </div>

            <span className="hidden items-center gap-1.5 rounded-md border border-mint/25 bg-mint/10 px-2 py-1 text-[0.58rem] uppercase tracking-[0.16em] text-mint sm:inline-flex">
              <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-mint" aria-hidden />
              System online
            </span>

            <NotificationCenter notifications={notifications} unread={unread} />

            <Link
              href="/profile"
              className="flex items-center gap-2 rounded-lg border border-line/60 bg-white/[0.03] px-1.5 py-1 transition-colors hover:border-cyan/40"
              aria-label="Your hunter profile"
            >
              <HunterAvatar
                username={profile.username}
                avatarUrl={profile.avatar_url}
                rank={profile.rank}
                size={26}
                ring={false}
              />
              <span className="hidden pr-1 text-xs text-muted md:inline">{profile.username}</span>
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[86rem] px-4 py-5 sm:px-6 sm:py-7">{children}</main>
      </div>
    </div>
  );
}
