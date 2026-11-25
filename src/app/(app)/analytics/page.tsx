import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, CalendarRange, PieChart, Target, TrendingUp, Zap } from "lucide-react";
import { requireHunter } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SetupNotice } from "@/components/app/setup-notice";
import { getDailySeries, getOverview, getSubjectBreakdown, getSubjectSummary } from "@/lib/data/hunter";
import { Panel, PanelHeader } from "@/components/system/panel";
import { StatBar } from "@/components/system/meter";
import { ConsistencyGrid, StudyBars, SubjectDonut, XpArea } from "@/components/charts/study-charts";
import { formatMinutes, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Analytics" };

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  if (!isSupabaseConfigured) return <SetupNotice />;
  await requireHunter();
  const params = await searchParams;
  const days = RANGES.some((range) => String(range.days) === params.range)
    ? Number(params.range)
    : 30;

  const [overview, series, subjects, summaries] = await Promise.all([
    getOverview(),
    getDailySeries(days),
    getSubjectBreakdown(days),
    getSubjectSummary(),
  ]);

  const totalMinutes = series.reduce((sum, point) => sum + point.minutes, 0);
  const totalXp = series.reduce((sum, point) => sum + point.xp, 0);
  const activeDays = series.filter((point) => point.minutes > 0).length;
  const average = activeDays === 0 ? 0 : Math.round(totalMinutes / activeDays);
  const best = series.reduce(
    (top, point) => (point.minutes > top.minutes ? point : top),
    { day: "—", minutes: 0, sessions: 0, xp: 0 },
  );

  const donutData = subjects
    .filter((subject) => subject.minutes > 0)
    .slice(0, 6)
    .map((subject) => ({ title: subject.title, color: subject.color, minutes: subject.minutes }));

  const topSubjects = [...summaries].sort((a, b) => b.minutes_total - a.minutes_total).slice(0, 6);
  const maxSubjectMinutes = Math.max(1, ...topSubjects.map((subject) => subject.minutes_total));
  const weeklyGoalHits = Math.round((activeDays / Math.max(1, days)) * 100);

  return (
    <div className="space-y-4">
      <Panel glow className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="hud-label" style={{ color: "var(--color-cyan)" }}>
              [ANALYSIS]
            </p>
            <h1 className="font-hud mt-1.5 text-base text-text">Study patterns</h1>
            <p className="mt-1 text-xs text-muted">
              Everything here is computed in the database from your recorded sessions.
            </p>
          </div>
          <div className="flex gap-1 rounded-lg border border-line/60 bg-black/30 p-1">
            {RANGES.map((range) => (
              <Link
                key={range.days}
                href={`/analytics?range=${range.days}`}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.14em] transition-colors",
                  days === range.days ? "bg-cyan/15 text-cyan" : "text-faint hover:text-text",
                )}
              >
                {range.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            { label: "Focus time", value: formatMinutes(totalMinutes), sub: `${series.length} day window`, icon: CalendarRange },
            { label: "XP earned", value: formatNumber(totalXp), sub: `${overview.totals.xp} lifetime`, icon: Zap },
            { label: "Active days", value: `${activeDays}`, sub: `${weeklyGoalHits}% consistency`, icon: Target },
            { label: "Daily average", value: formatMinutes(average), sub: `best ${formatMinutes(best.minutes)}`, icon: TrendingUp },
          ].map((tile) => {
            const Icon = tile.icon;
            return (
              <div key={tile.label} className="rounded-lg border border-line/60 bg-white/[0.02] p-2.5">
                <div className="flex items-center justify-between">
                  <p className="hud-label">{tile.label}</p>
                  <Icon size={12} className="text-cyan/70" aria-hidden />
                </div>
                <p className="numeric mt-1 text-lg text-text">{tile.value}</p>
                <p className="text-[0.6rem] text-faint">{tile.sub}</p>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Panel>
            <PanelHeader
              title="Daily focus"
              subtitle={`${formatMinutes(totalMinutes)} across ${series.length} days`}
              icon={<BarChart3 size={14} />}
            />
            <div className="px-2 pb-3 pt-4">
              <StudyBars data={series} height={216} />
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="XP earned per day" subtitle="Capped days still record all study time" icon={<Zap size={14} />} />
            <div className="px-2 pb-3 pt-4">
              <XpArea data={series} height={180} />
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Consistency"
              subtitle="Each square is one day; brighter means more focus"
              icon={<CalendarRange size={14} />}
            />
            <div className="p-4">
              <ConsistencyGrid data={series} />
              <div className="mt-3 flex items-center gap-2 text-[0.58rem] uppercase tracking-[0.14em] text-faint">
                <span>Low</span>
                <span className="h-3 w-3 rounded-[2px] border border-line/40 bg-[rgba(120,170,230,0.08)]" aria-hidden />
                <span className="h-3 w-3 rounded-[2px] bg-[rgba(56,225,255,0.35)]" aria-hidden />
                <span className="h-3 w-3 rounded-[2px] bg-[rgba(56,225,255,0.6)]" aria-hidden />
                <span className="h-3 w-3 rounded-[2px] bg-[rgba(56,225,255,0.88)]" aria-hidden />
                <span>High</span>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Subject distribution" subtitle={`Last ${days} days`} icon={<PieChart size={14} />} />
            <div className="p-4">
              {donutData.length === 0 ? (
                <p className="py-8 text-center text-xs text-faint">No subject data in this window.</p>
              ) : (
                <SubjectDonut data={donutData} height={184} />
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Lifetime by subject" subtitle="All credited time" icon={<Target size={14} />} />
            <div className="space-y-2.5 p-4">
              {topSubjects.length === 0 ? (
                <p className="py-6 text-center text-xs text-faint">Nothing recorded yet.</p>
              ) : (
                topSubjects.map((subject) => (
                  <div key={subject.subject_id}>
                    <div className="mb-1 flex items-center justify-between text-[0.68rem]">
                      <span className="min-w-0 truncate text-muted">{subject.title}</span>
                      <span className="numeric shrink-0 text-faint">{formatMinutes(subject.minutes_total)}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.round((subject.minutes_total / maxSubjectMinutes) * 100)}%`,
                          background: subject.color,
                          boxShadow: `0 0 12px -4px ${subject.color}`,
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel quiet className="p-4">
            <p className="hud-label">Momentum</p>
            <div className="mt-2 space-y-2">
              <StatBar value={overview.today.minutes} max={Math.max(1, overview.today.goal)} label="Today vs goal" variant="mint" />
              <StatBar
                value={overview.rank.next ? overview.rank.percent : 100}
                max={100}
                label={overview.rank.next ? `To ${overview.rank.next}-Rank` : "Peak rank"}
                variant="gold"
              />
              <p className="pt-1 text-[0.66rem] leading-relaxed text-faint">
                Streak {overview.streak.current} days · longest {overview.streak.longest}. A day counts when at least one
                session is recorded.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
