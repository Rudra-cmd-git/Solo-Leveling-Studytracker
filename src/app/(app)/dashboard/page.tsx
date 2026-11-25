import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Flame,
  Play,
  ScrollText,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { requireHunter } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SetupNotice } from "@/components/app/setup-notice";
import { getDailySeries, getHistory, getOverview, getSubjectBreakdown } from "@/lib/data/hunter";
import { Panel, PanelHeader } from "@/components/system/panel";
import { RankBadge } from "@/components/system/rank-badge";
import { LevelRing, StatBar } from "@/components/system/meter";
import { HunterAvatar } from "@/components/system/hunter-avatar";
import { StudyBars, SubjectDonut } from "@/components/charts/study-charts";
import { formatDateTime, formatMinutes, formatNumber, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Status" };

function StatTile({
  label,
  value,
  sub,
  icon,
  tone = "cyan",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone?: "cyan" | "violet" | "gold" | "mint";
}) {
  const toneClass = {
    cyan: "text-cyan border-cyan/25 bg-cyan/8",
    violet: "text-violet border-violet/25 bg-violet/8",
    gold: "text-gold border-gold/25 bg-gold/8",
    mint: "text-mint border-mint/25 bg-mint/8",
  }[tone];

  return (
    <div className="rounded-xl border border-line/60 bg-white/[0.02] p-3.5">
      <div className="flex items-center justify-between">
        <p className="hud-label">{label}</p>
        <span className={cn("flex h-6 w-6 items-center justify-center rounded-md border", toneClass)}>{icon}</span>
      </div>
      <p className="numeric mt-2 text-xl text-text">{value}</p>
      {sub ? <p className="mt-0.5 text-[0.65rem] text-faint">{sub}</p> : null}
    </div>
  );
}

export default async function DashboardPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  await requireHunter();

  const [overview, series, subjects, history] = await Promise.all([
    getOverview(),
    getDailySeries(14),
    getSubjectBreakdown(30),
    getHistory(6, 0),
  ]);

  const { profile, level, rank, today, week, totals, streak, quests, active_session } = overview;
  const goalPercent = Math.min(100, Math.round((today.minutes / Math.max(1, today.goal)) * 100));
  const donutData = subjects
    .filter((subject) => subject.minutes > 0)
    .slice(0, 6)
    .map((subject) => ({ title: subject.title, color: subject.color, minutes: subject.minutes }));

  return (
    <div className="space-y-4">
      {/* Status window */}
      <Panel glow className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-line/60 px-4 py-2.5">
          <span className="hud-label" style={{ color: "var(--color-cyan)" }}>
            [STATUS WINDOW]
          </span>
          <span className="numeric text-[0.6rem] uppercase tracking-[0.18em] text-faint">
            {profile.hunter_id}
          </span>
        </div>

        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1.4fr_auto_1fr] lg:items-center">
          <div className="flex items-center gap-4">
            <HunterAvatar
              username={profile.username}
              avatarUrl={profile.avatar_url}
              rank={profile.rank}
              size={68}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-hud truncate text-lg text-text">
                  {profile.display_name || profile.username}
                </h1>
                <RankBadge rank={profile.rank} size="md" showName />
              </div>
              <p className="mt-0.5 truncate text-xs text-faint">
                @{profile.username} · joined {formatDateTime(profile.created_at)}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[0.6rem] uppercase tracking-[0.14em]">
                <span className="inline-flex items-center gap-1 rounded border border-gold/25 bg-gold/8 px-1.5 py-0.5 text-gold">
                  <Flame size={10} aria-hidden /> {streak.current} day streak
                </span>
                <span className="inline-flex items-center gap-1 rounded border border-line/60 bg-white/[0.03] px-1.5 py-0.5 text-faint">
                  best {streak.longest}
                </span>
                <span className="inline-flex items-center gap-1 rounded border border-cyan/25 bg-cyan/8 px-1.5 py-0.5 text-cyan">
                  <Zap size={10} aria-hidden /> {formatNumber(totals.xp)} lifetime XP
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-center lg:px-4">
            <LevelRing level={profile.level} percent={level.percent} rank={profile.rank} size={124} />
          </div>

          <div className="space-y-2.5">
            <StatBar
              value={level.into}
              max={level.needed}
              label="Next level"
              rightLabel={`${formatNumber(level.into)} / ${formatNumber(level.needed)} XP`}
            />
            <StatBar
              value={rank.next ? rank.percent : 100}
              max={100}
              variant="gold"
              label={rank.next ? `To ${rank.next}-Rank` : "Peak rank"}
              rightLabel={rank.next ? `${formatNumber(rank.remaining)} XP left` : "MAX"}
            />
            <StatBar
              value={today.minutes}
              max={Math.max(1, today.goal)}
              variant="mint"
              label="Daily goal"
              rightLabel={`${today.minutes} / ${today.goal} min`}
            />
            <div className="flex flex-wrap gap-2 pt-1">
              {active_session ? (
                <Link href="/study" className="btn btn-primary px-3 py-1.5 text-xs">
                  <Play size={12} aria-hidden /> Resume session
                </Link>
              ) : (
                <Link href="/study" className="btn btn-primary px-3 py-1.5 text-xs">
                  <Timer size={12} aria-hidden /> Start focus
                </Link>
              )}
              <Link href="/quests" className="btn btn-ghost px-3 py-1.5 text-xs">
                <ScrollText size={12} aria-hidden /> {quests.active} active quests
              </Link>
            </div>
          </div>
        </div>
      </Panel>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Today"
          value={formatMinutes(today.minutes)}
          sub={`${today.sessions} session${today.sessions === 1 ? "" : "s"} · ${today.xp} XP`}
          icon={<CalendarDays size={12} aria-hidden />}
        />
        <StatTile
          label="This week"
          value={formatMinutes(week.minutes)}
          sub={`${week.sessions} sessions · ${formatNumber(week.xp)} XP`}
          tone="violet"
          icon={<TrendingUp size={12} aria-hidden />}
        />
        <StatTile
          label="Lifetime focus"
          value={formatMinutes(Math.round(totals.minutes))}
          sub={`${totals.sessions} sessions recorded`}
          tone="mint"
          icon={<Timer size={12} aria-hidden />}
        />
        <StatTile
          label="Achievements"
          value={`${totals.achievements}`}
          sub={`${quests.completed_total} quests cleared`}
          tone="gold"
          icon={<Trophy size={12} aria-hidden />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-4">
          <Panel>
            <PanelHeader
              title="Focus, last 14 days"
              subtitle={`${formatMinutes(series.reduce((sum, point) => sum + point.minutes, 0))} recorded in this window`}
              icon={<TrendingUp size={14} />}
              action={
                <Link href="/analytics" className="btn btn-ghost px-2.5 py-1 text-[0.62rem]">
                  Analytics <ChevronRight size={11} aria-hidden />
                </Link>
              }
            />
            <div className="px-2 pb-3 pt-4">
              <StudyBars data={series} height={196} />
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Recent sessions"
              subtitle="The latest entries in your record"
              icon={<Timer size={14} />}
              action={
                <Link href="/history" className="btn btn-ghost px-2.5 py-1 text-[0.62rem]">
                  All <ChevronRight size={11} aria-hidden />
                </Link>
              }
            />
            <div className="p-2">
              {history.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <Timer size={20} className="text-faint" aria-hidden />
                  <p className="text-xs text-muted">No sessions recorded yet.</p>
                  <Link href="/study" className="btn btn-primary mt-1 px-3 py-1.5 text-xs">
                    Start your first session
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-line/40">
                  {history.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-3 px-2 py-2.5">
                      <span
                        className="h-7 w-1 shrink-0 rounded-full"
                        style={{ background: entry.subject_color ?? "var(--color-azure)" }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-text">
                          {entry.subject_title ?? "General study"}
                          {entry.topic_title ? <span className="text-faint"> · {entry.topic_title}</span> : null}
                        </p>
                        <p className="text-[0.62rem] text-faint">
                          {timeAgo(entry.started_at)}
                          {entry.is_revision ? " · revision" : ""}
                          {entry.note ? ` · ${entry.note}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="numeric text-xs text-text">
                          {entry.credited_minutes != null ? formatMinutes(entry.credited_minutes) : "—"}
                        </p>
                        <p className="numeric text-[0.6rem] text-cyan">+{entry.xp_awarded} XP</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Daily goal" subtitle={`${goalPercent}% of today's target`} icon={<Target size={14} />} />
            <div className="p-4">
              <div className="flex items-end justify-between">
                <span className="numeric text-3xl text-text">{today.minutes}</span>
                <span className="text-xs text-faint">/ {today.goal} min</span>
              </div>
              <StatBar value={today.minutes} max={Math.max(1, today.goal)} variant="mint" className="mt-2" />
              <p className="mt-2.5 text-[0.68rem] text-muted">
                {today.minutes >= today.goal
                  ? "Target cleared. Anything more is surplus XP."
                  : `${formatMinutes(Math.max(0, today.goal - today.minutes))} left to clear today's target.`}
              </p>
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Subject split"
              subtitle="Last 30 days"
              icon={<BookOpen size={14} />}
              action={
                <Link href="/analytics" className="btn btn-ghost px-2.5 py-1 text-[0.62rem]">
                  Detail <ChevronRight size={11} aria-hidden />
                </Link>
              }
            />
            <div className="p-4">
              {donutData.length === 0 ? (
                <p className="py-6 text-center text-xs text-faint">
                  Record a session to build your subject split.
                </p>
              ) : (
                <SubjectDonut data={donutData} height={176} />
              )}
            </div>
          </Panel>

          <Panel id="feed">
            <PanelHeader
              title="Quests snapshot"
              subtitle={`${quests.completed_today} cleared today`}
              icon={<ScrollText size={14} />}
              action={
                <Link href="/quests" className="btn btn-ghost px-2.5 py-1 text-[0.62rem]">
                  Open <ChevronRight size={11} aria-hidden />
                </Link>
              }
            />
            <div className="p-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-line/60 bg-white/[0.02] p-2.5">
                  <p className="hud-label">Active</p>
                  <p className="numeric mt-1 text-lg text-cyan">{quests.active}</p>
                </div>
                <div className="rounded-lg border border-line/60 bg-white/[0.02] p-2.5">
                  <p className="hud-label">Cleared</p>
                  <p className="numeric mt-1 text-lg text-violet">{quests.completed_total}</p>
                </div>
              </div>
              <Link
                href="/achievements"
                className="mt-2 flex items-center justify-between rounded-lg border border-line/60 bg-white/[0.02] px-3 py-2 text-xs text-muted transition-colors hover:border-cyan/30 hover:text-text"
              >
                <span>View achievements</span>
                <ArrowRight size={12} aria-hidden />
              </Link>
            </div>
          </Panel>
        </div>
      </div>

      <p className="pb-2 text-center text-[0.6rem] uppercase tracking-[0.2em] text-faint/70">
        All figures computed from recorded sessions · XP is server-verified
      </p>
    </div>
  );
}
