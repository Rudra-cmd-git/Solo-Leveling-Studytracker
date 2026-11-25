import type { Metadata } from "next";
import Link from "next/link";
import { Award, ChevronLeft, ChevronRight, Crown, Search, Trophy, Users } from "lucide-react";
import { Panel, PanelHeader } from "@/components/system/panel";
import { RankBadge } from "@/components/system/rank-badge";
import { HunterAvatar } from "@/components/system/hunter-avatar";
import { getLeaderboard, getStanding, parsePeriod, PERIOD_LABEL, type LeaderboardPage } from "@/lib/data/leaderboard";
import type { LeaderboardStanding } from "@/lib/types";
import { getOptionalHunter } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Global hunter rankings by XP earned from verified study sessions.",
};

const PERIODS = ["week", "month", "all"] as const;

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const period = parsePeriod(params.period);
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const search = (params.q ?? "").trim().slice(0, 32);

  const { user } = await getOptionalHunter();

  let board: LeaderboardPage = { rows: [], total: 0, page, pageSize: 25, pageCount: 1 };
  let standing: LeaderboardStanding | null = null;
  if (isSupabaseConfigured) {
    try {
      board = await getLeaderboard({ period, page, pageSize: 25, search: search || undefined });
      standing = user ? await getStanding(period) : null;
    } catch {
      board = { rows: [], total: 0, page, pageSize: 25, pageCount: 1 };
    }
  }

  const podium = board.rows.slice(0, 3);
  const rest = board.rows.slice(3);

  const buildQuery = (next: { period?: string; page?: number }) => {
    const query = new URLSearchParams();
    query.set("period", next.period ?? period);
    if (next.page && next.page > 1) query.set("page", String(next.page));
    if (search) query.set("q", search);
    return `/leaderboard?${query.toString()}`;
  };

  return (
    <div className="space-y-4">
      <Panel glow className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="hud-label" style={{ color: "var(--color-gold)" }}>
              [GLOBAL RANKING]
            </p>
            <h1 className="font-hud mt-1.5 text-base text-text">Hunter leaderboard</h1>
            <p className="mt-1 max-w-lg text-xs text-muted">
              Ranked by XP earned from verified focus sessions. Lifetime XP decides your hunter rank; this board only
              measures the selected window.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-lg border border-line/60 bg-black/30 p-1">
              {PERIODS.map((option) => (
                <Link
                  key={option}
                  href={buildQuery({ period: option, page: 1 })}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.14em] transition-colors",
                    period === option ? "bg-gold/15 text-gold" : "text-faint hover:text-text",
                  )}
                >
                  {PERIOD_LABEL[option]}
                </Link>
              ))}
            </div>

            <form action="/leaderboard" method="get" className="flex items-center gap-1.5">
              <input type="hidden" name="period" value={period} />
              <input
                name="q"
                defaultValue={search}
                placeholder="Find hunter"
                className="field !w-32 !py-1.5 text-xs"
                aria-label="Search hunters"
              />
              <button type="submit" className="btn btn-ghost h-8 w-8 !px-0" aria-label="Search">
                <Search size={13} aria-hidden />
              </button>
            </form>

            {user ? (
              <Link href="/friends" className="btn btn-ghost px-2.5 py-1.5 text-[0.62rem]">
                <Users size={11} aria-hidden /> Friends board
              </Link>
            ) : null}
          </div>
        </div>
      </Panel>

      {standing ? (
        <Panel quiet className="p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-md border border-cyan/25 bg-cyan/8 text-cyan">
                <Award size={14} aria-hidden />
              </span>
              <div>
                <p className="hud-label">Your standing · {PERIOD_LABEL[period]}</p>
                <p className="text-xs text-muted">
                  {standing.listed
                    ? `#${standing.position} of ${standing.total} hunters · ${formatNumber(standing.period_xp ?? 0)} XP`
                    : "You are not listed on the leaderboard. Enable it in Settings."}
                </p>
              </div>
            </div>
            {!standing.listed ? (
              <Link href="/settings" className="btn btn-ghost px-3 py-1.5 text-xs">
                Open settings
              </Link>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {podium.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {podium.map((hunter, index) => (
            <Link
              key={hunter.user_id}
              href={`/hunters/${hunter.username}`}
              className={cn(
                "group relative overflow-hidden rounded-xl border p-4 transition-all hover:-translate-y-0.5",
                index === 0
                  ? "border-gold/40 bg-[linear-gradient(155deg,rgba(40,32,10,0.75),rgba(8,12,20,0.9))]"
                  : "border-line/60 bg-white/[0.02]",
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "numeric flex h-7 w-7 items-center justify-center rounded-md border text-xs",
                    index === 0 ? "border-gold/50 text-gold" : "border-line/60 text-faint",
                  )}
                >
                  {hunter.rank_position}
                </span>
                {index === 0 ? <Crown size={14} className="text-gold" aria-hidden /> : null}
              </div>
              <div className="mt-3 flex items-center gap-2.5">
                <HunterAvatar
                  username={hunter.username}
                  avatarUrl={hunter.avatar_url}
                  rank={hunter.hunter_rank}
                  size={40}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm text-text group-hover:text-cyan">{hunter.username}</p>
                  <p className="numeric text-[0.62rem] text-faint">
                    LV {hunter.level} · {formatNumber(hunter.period_xp)} XP
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <RankBadge rank={hunter.hunter_rank} size="sm" showName />
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      <Panel>
        <PanelHeader
          title={`${PERIOD_LABEL[period]} rankings`}
          subtitle={board.total === 0 ? "No hunters listed yet" : `${board.total} hunters`}
          icon={<Trophy size={14} />}
        />

        {board.rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
            <Users size={22} className="text-faint" aria-hidden />
            <p className="text-sm text-muted">
              {search ? `No hunter matches “${search}”.` : "The board is empty. Complete sessions to appear here."}
            </p>
            {!user ? (
              <Link href="/signup" className="btn btn-primary mt-1 px-3 py-1.5 text-xs">
                Awaken and join
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse">
              <thead>
                <tr className="border-y border-line/50 text-left">
                  {["#", "Hunter", "Rank", "Level", "XP"].map((heading) => (
                    <th key={heading} className="hud-label px-3 py-2 font-normal">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rest.map((hunter) => (
                  <tr
                    key={hunter.user_id}
                    className={cn(
                      "border-b border-line/30 transition-colors hover:bg-white/[0.025]",
                      hunter.is_me && "bg-cyan/[0.06]",
                    )}
                  >
                    <td className="numeric px-3 py-2.5 text-xs text-faint">{hunter.rank_position}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/hunters/${hunter.username}`} className="flex items-center gap-2 group">
                        <HunterAvatar
                          username={hunter.username}
                          avatarUrl={hunter.avatar_url}
                          rank={hunter.hunter_rank}
                          size={26}
                          ring={false}
                        />
                        <span className="truncate text-xs text-text group-hover:text-cyan">
                          {hunter.username}
                          {hunter.is_me ? <span className="ml-1.5 text-[0.58rem] text-cyan">YOU</span> : null}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <RankBadge rank={hunter.hunter_rank} size="sm" />
                    </td>
                    <td className="numeric px-3 py-2.5 text-xs text-muted">{hunter.level}</td>
                    <td className="numeric px-3 py-2.5 text-xs text-cyan">{formatNumber(hunter.period_xp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {board.pageCount > 1 ? (
          <div className="flex items-center justify-between border-t border-line/50 px-3 py-2.5">
            {board.page > 1 ? (
              <Link href={buildQuery({ page: board.page - 1 })} className="btn btn-ghost px-2.5 py-1 text-[0.62rem]">
                <ChevronLeft size={11} aria-hidden /> Previous
              </Link>
            ) : (
              <span />
            )}
            <span className="numeric text-[0.62rem] text-faint">
              {board.page} / {board.pageCount}
            </span>
            {board.page < board.pageCount ? (
              <Link href={buildQuery({ page: board.page + 1 })} className="btn btn-ghost px-2.5 py-1 text-[0.62rem]">
                Next <ChevronRight size={11} aria-hidden />
              </Link>
            ) : (
              <span />
            )}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
