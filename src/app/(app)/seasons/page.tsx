import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Crown, Flame, Sparkles, Trophy } from "lucide-react";
import { requireHunter } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SetupNotice } from "@/components/app/setup-notice";
import { Panel, PanelHeader } from "@/components/system/panel";
import { RankBadge } from "@/components/system/rank-badge";
import { HunterAvatar } from "@/components/system/hunter-avatar";
import { getCurrentSeason, getMySeasonStanding, getPreviousSeason, getSeasonBoard } from "@/lib/data/seasons";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Season" };

const THEME_ACCENT: Record<string, string> = {
  azure: "var(--color-cyan)",
  violet: "#a78bfa",
  gold: "var(--color-gold)",
  ember: "var(--color-ember)",
};

export default async function SeasonPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  await requireHunter();

  const [season, standing, previous] = await Promise.all([
    getCurrentSeason(),
    getMySeasonStanding(),
    getPreviousSeason(),
  ]);
  const board = await getSeasonBoard(season?.code ?? null, 25);
  const accent = THEME_ACCENT[season?.theme ?? "azure"] ?? "var(--color-cyan)";

  return (
    <div className="space-y-4">
      <Panel glow className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="hud-label flex items-center gap-1.5" style={{ color: accent }}>
              <Sparkles size={11} aria-hidden /> [SEASONAL COMPETITION]
            </p>
            <h1 className="font-hud mt-1.5 text-base text-text">{season?.name ?? "No active season"}</h1>
            <p className="mt-1 max-w-lg text-xs text-muted">
              Seasons run one calendar month. Only XP earned inside the window counts, so every hunter starts level with
              everyone else on day one.
            </p>
          </div>

          {season ? (
            <div className="rounded-lg border border-line/60 bg-black/30 px-3 py-2 text-right">
              <p className="hud-label flex items-center justify-end gap-1.5">
                <CalendarClock size={11} aria-hidden /> Ends
              </p>
              <p className="numeric mt-0.5 text-sm text-text">{formatDate(season.ends_at)}</p>
              <p className="numeric text-[0.6rem] text-faint">
                {season.days_left} day{season.days_left === 1 ? "" : "s"} left
              </p>
            </div>
          ) : null}
        </div>

        {standing ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Season XP", value: formatNumber(standing.season_xp) },
              {
                label: "Position",
                value: standing.position ? `#${standing.position}` : "—",
              },
              { label: "Hunters", value: formatNumber(standing.total) },
              {
                label: "Gap to above",
                value:
                  standing.position && standing.position > 1 ? `${formatNumber(standing.gap_to_above)} XP` : "—",
              },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-line/60 bg-black/25 px-3 py-2">
                <p className="hud-label">{item.label}</p>
                <p className="numeric mt-0.5 text-sm text-text">{item.value}</p>
              </div>
            ))}
          </div>
        ) : null}

        {standing && !standing.listed ? (
          <p className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-ember/30 bg-ember/[0.07] px-3 py-2 text-[0.68rem] text-muted">
            <Flame size={12} className="text-ember" aria-hidden />
            You are not listed in season standings.
            <Link href="/settings" className="text-cyan hover:underline">
              Enable the leaderboard in Settings
            </Link>
          </p>
        ) : null}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <Panel>
          <PanelHeader
            title={`${season?.name ?? "Season"} standings`}
            subtitle={board.length === 0 ? "No XP recorded this season yet" : `${board.length} hunters ranked`}
            icon={<Trophy size={14} />}
          />

          {board.length === 0 ? (
            <p className="mt-3 rounded-lg border border-line/50 bg-black/20 px-3 py-10 text-center text-xs text-faint">
              The season has just begun. Complete a focus session to take the lead.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse">
                <thead>
                  <tr className="border-y border-line/50 text-left">
                    {["#", "Hunter", "Rank", "LV", "Season XP"].map((heading) => (
                      <th key={heading} className="hud-label px-3 py-2 font-normal">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {board.map((row) => (
                    <tr
                      key={row.user_id}
                      className={cn(
                        "border-b border-line/30 hover:bg-white/[0.02]",
                        row.is_me && "bg-cyan/[0.06]",
                        row.rank_position === 1 && "bg-gold/[0.05]",
                      )}
                    >
                      <td className="numeric px-3 py-2 text-xs text-faint">
                        {row.rank_position === 1 ? <Crown size={11} className="inline text-gold" aria-hidden /> : null}{" "}
                        {row.rank_position}
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/hunters/${row.username}`} className="group flex items-center gap-2">
                          <HunterAvatar
                            username={row.username}
                            avatarUrl={row.avatar_url}
                            rank={row.hunter_rank}
                            size={24}
                            ring={false}
                          />
                          <span className="truncate text-xs text-text group-hover:text-cyan">{row.username}</span>
                          {row.is_me ? <span className="text-[0.55rem] text-cyan">YOU</span> : null}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <RankBadge rank={row.hunter_rank} size="sm" />
                      </td>
                      <td className="numeric px-3 py-2 text-xs text-muted">{row.level}</td>
                      <td className="numeric px-3 py-2 text-xs text-cyan">{formatNumber(row.period_xp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <aside className="space-y-4">
          <Panel quiet className="p-4">
            <PanelHeader
              title="Last season"
              subtitle={previous ? previous.name : "No completed season yet"}
              icon={<Crown size={14} />}
            />
            {previous ? (
              <ol className="mt-2 space-y-1.5">
                {previous.winners.map((winner) => (
                  <li key={winner.username} className="flex items-center gap-2">
                    <span className="numeric w-4 text-[0.62rem] text-faint">{winner.rank_position}</span>
                    <HunterAvatar
                      username={winner.username}
                      avatarUrl={winner.avatar_url}
                      rank={winner.hunter_rank}
                      size={20}
                      ring={false}
                    />
                    <Link
                      href={`/hunters/${winner.username}`}
                      className="min-w-0 flex-1 truncate text-[0.7rem] text-text hover:text-cyan"
                    >
                      {winner.username}
                    </Link>
                    <span className="numeric text-[0.62rem] text-gold">{formatNumber(winner.period_xp)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-[0.68rem] text-faint">The first season is still running.</p>
            )}
          </Panel>

          <Panel quiet className="p-4">
            <p className="hud-label">Season rules</p>
            <ul className="mt-2 space-y-1.5 text-[0.68rem] leading-relaxed text-muted">
              <li>· A season is one calendar month, in your own timezone.</li>
              <li>· Only XP earned inside the window is counted.</li>
              <li>· Season XP never replaces lifetime XP — your rank is unaffected.</li>
              <li>· Opting out of the leaderboard removes you from season standings too.</li>
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
