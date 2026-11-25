import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronRight, Info, ScrollText, Target, Zap } from "lucide-react";
import { requireHunter } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SetupNotice } from "@/components/app/setup-notice";
import { getOverview, getSubjectsWithTopics } from "@/lib/data/hunter";
import { FocusRunner } from "@/components/study/focus-runner";
import { Panel, PanelHeader } from "@/components/system/panel";
import { StatBar } from "@/components/system/meter";
import { formatMinutes, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Focus" };

export default async function StudyPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  await requireHunter();

  const [subjects, overview] = await Promise.all([getSubjectsWithTopics(), getOverview()]);
  const { today, week, config, streak, active_session } = overview;

  const focusSubjects = subjects
    .filter((subject) => !subject.archived)
    .map((subject) => ({
      id: subject.id,
      title: subject.title,
      color: subject.color,
      topics: subject.topics.map((topic) => ({ id: topic.id, title: topic.title })),
    }));

  return (
    <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
      <div className="space-y-4">
        <FocusRunner
          subjects={focusSubjects}
          activeSession={active_session}
          dailyXpToday={today.xp}
          dailyXpCap={config.daily_xp_cap}
        />

        {!active_session ? (
          <Panel quiet className="p-4">
            <p className="hud-label flex items-center gap-1.5">
              <Info size={12} aria-hidden /> How credit works
            </p>
            <ul className="mt-2 space-y-1.5 text-xs text-muted">
              <li>· One credited minute of focus equals one XP.</li>
              <li>· Time is measured by server heartbeats, not by your device clock.</li>
              <li>· Paused time earns nothing, and gaps longer than {Math.round(config.max_heartbeat_gap / 60)} minutes are clipped.</li>
              <li>· Sessions under {config.min_session_seconds} seconds are not recorded.</li>
              <li>· Daily XP caps at {formatNumber(config.daily_xp_cap)}, but study time beyond it is still stored.</li>
            </ul>
          </Panel>
        ) : null}
      </div>

      <aside className="space-y-4">
        <Panel>
          <PanelHeader title="Today" subtitle="Verified focus for your local day" icon={<CalendarDays size={14} />} />
          <div className="p-4">
            <div className="flex items-end justify-between">
              <span className="numeric text-3xl text-text">{formatMinutes(today.minutes)}</span>
              <span className="text-xs text-faint">goal {today.goal}m</span>
            </div>
            <StatBar value={today.minutes} max={Math.max(1, today.goal)} variant="mint" className="mt-2" />
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { label: "Sessions", value: String(today.sessions) },
                { label: "XP today", value: formatNumber(today.xp) },
                { label: "Streak", value: `${streak.current}d` },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-line/60 bg-white/[0.02] p-2 text-center">
                  <p className="hud-label">{item.label}</p>
                  <p className="numeric mt-0.5 text-sm text-text">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="This week" subtitle={`${week.sessions} sessions across ${week.subjects} subjects`} icon={<Zap size={14} />} />
          <div className="space-y-2 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Focus time</span>
              <span className="numeric text-text">{formatMinutes(week.minutes)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">XP earned</span>
              <span className="numeric text-cyan">{formatNumber(week.xp)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Daily XP cap</span>
              <span className="numeric text-faint">{formatNumber(config.daily_xp_cap)}</span>
            </div>
          </div>
        </Panel>

        <Panel quiet className="p-4">
          <p className="hud-label flex items-center gap-1.5">
            <ScrollText size={12} aria-hidden /> Next up
          </p>
          <div className="mt-2 space-y-1.5">
            <Link
              href="/quests"
              className="flex items-center justify-between rounded-lg border border-line/60 bg-white/[0.02] px-3 py-2 text-xs text-muted transition-colors hover:border-violet/35 hover:text-text"
            >
              <span className="inline-flex items-center gap-1.5">
                <Target size={12} aria-hidden /> Review active quests
              </span>
              <ChevronRight size={12} aria-hidden />
            </Link>
            <Link
              href="/subjects"
              className="flex items-center justify-between rounded-lg border border-line/60 bg-white/[0.02] px-3 py-2 text-xs text-muted transition-colors hover:border-cyan/35 hover:text-text"
            >
              <span>Manage subjects and topics</span>
              <ChevronRight size={12} aria-hidden />
            </Link>
          </div>
        </Panel>
      </aside>
    </div>
  );
}
