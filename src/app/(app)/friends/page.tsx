import type { Metadata } from "next";
import Link from "next/link";
import { Trophy, Users } from "lucide-react";
import { requireHunter } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SetupNotice } from "@/components/app/setup-notice";
import { Panel, PanelHeader } from "@/components/system/panel";
import { HunterAvatar } from "@/components/system/hunter-avatar";
import { FriendsManager } from "@/components/social/friends-manager";
import { getSocialOverview } from "@/lib/data/social";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Roster" };

export default async function FriendsPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  await requireHunter();

  const { friends, requests, board } = await getSocialOverview();

  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
      <div className="space-y-4">
        <Panel glow className="p-4 sm:p-5">
          <p className="hud-label" style={{ color: "var(--color-cyan)" }}>
            [HUNTER ROSTER]
          </p>
          <h1 className="font-hud mt-1.5 text-base text-text">Allies of the System</h1>
          <p className="mt-1 max-w-lg text-xs text-muted">
            Add hunters you study alongside. Only public level, rank and XP are shared — never sessions, notes or
            subjects.
          </p>
        </Panel>

        <FriendsManager friends={friends} requests={requests} />
      </div>

      <aside className="space-y-4">
        <Panel className="p-4">
          <PanelHeader title="Friends board · this week" subtitle="You and your roster" icon={<Trophy size={14} />} />

          {board.length === 0 ? (
            <p className="mt-3 rounded-lg border border-line/50 bg-black/20 px-3 py-6 text-center text-xs text-faint">
              No allies yet. Add a hunter to start a private board.
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {board.map((row) => (
                <li
                  key={row.user_id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border border-line/40 px-2.5 py-1.5",
                    row.is_me ? "bg-cyan/[0.07]" : "bg-black/15",
                  )}
                >
                  <span className="numeric w-4 shrink-0 text-[0.62rem] text-faint">{row.rank_position}</span>
                  <HunterAvatar
                    username={row.username}
                    avatarUrl={row.avatar_url}
                    rank={row.hunter_rank}
                    size={22}
                    ring={false}
                  />
                  <Link href={`/hunters/${row.username}`} className="min-w-0 flex-1 truncate text-[0.72rem] text-text hover:text-cyan">
                    {row.username}
                    {row.is_me ? <span className="ml-1 text-[0.55rem] text-cyan">YOU</span> : null}
                  </Link>
                  <span className="numeric shrink-0 text-[0.62rem] text-cyan">{formatNumber(row.period_xp)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel quiet className="p-4">
          <p className="hud-label flex items-center gap-1.5">
            <Users size={12} aria-hidden /> Roster rules
          </p>
          <ul className="mt-2 space-y-1.5 text-[0.68rem] leading-relaxed text-muted">
            <li>· A request becomes a friendship only when both sides agree.</li>
            <li>· Private hunters cannot be found or invited.</li>
            <li>· Removing a friend is instant and works both ways.</li>
            <li>· Friendships never unlock another hunter&apos;s sessions or notes.</li>
          </ul>
        </Panel>

        <Panel quiet className="p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="hud-label">Need more allies?</span>
            <Link href="/guilds" className="btn btn-ghost px-2.5 py-1 text-[0.62rem]">
              Browse guilds
            </Link>
          </div>
        </Panel>
      </aside>
    </div>
  );
}
