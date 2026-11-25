import type { Metadata } from "next";
import { Check, Clock, ScrollText, Sparkles, Target } from "lucide-react";
import { requireHunter } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SetupNotice } from "@/components/app/setup-notice";
import { getQuests, syncQuests } from "@/lib/data/hunter";
import { Panel, PanelHeader } from "@/components/system/panel";
import { StatBar } from "@/components/system/meter";
import { QuestRefreshButton } from "@/components/quests/quest-refresh-button";
import { QUEST_CATEGORY_LABEL, QUEST_DIFFICULTY_LABEL, QUEST_METRIC_LABEL } from "@/lib/labels";
import type { Quest, QuestCategory } from "@/lib/types";
import { timeUntil } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Quests" };

const DIFFICULTY_TONE: Record<string, string> = {
  easy: "border-line/60 text-faint",
  normal: "border-cyan/30 text-cyan",
  hard: "border-violet/35 text-violet",
  elite: "border-gold/40 text-gold",
};

const ORDER: QuestCategory[] = ["daily", "weekly", "special"];

function QuestRow({ quest }: { quest: Quest }) {
  const done = quest.status === "completed";
  const expired = quest.status === "expired";
  const percent = Math.min(100, Math.round((quest.progress_value / Math.max(1, quest.target_value)) * 100));

  return (
    <li
      className={cn(
        "rounded-lg border bg-white/[0.02] p-3 transition-colors",
        done ? "border-mint/30" : expired ? "border-line/40 opacity-60" : "border-line/60",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
            done
              ? "border-mint/40 bg-mint/12 text-mint"
              : expired
                ? "border-line/50 text-faint"
                : "border-violet/35 bg-violet/10 text-violet",
          )}
          aria-hidden
        >
          {done ? <Check size={12} /> : expired ? <Clock size={12} /> : <Target size={12} />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-[0.8rem] text-text">{quest.title}</p>
            <span
              className={cn(
                "rounded border px-1 py-0.5 text-[0.55rem] uppercase tracking-[0.14em]",
                DIFFICULTY_TONE[quest.difficulty] ?? "border-line/60 text-faint",
              )}
            >
              {QUEST_DIFFICULTY_LABEL[quest.difficulty]}
            </span>
          </div>
          <p className="mt-0.5 text-[0.68rem] text-muted">{quest.description}</p>

          <div className="mt-2">
            <StatBar
              value={quest.progress_value}
              max={quest.target_value}
              height="sm"
              variant={done ? "mint" : "violet"}
              rightLabel={`${Number(quest.progress_value)} / ${quest.target_value} ${
                QUEST_METRIC_LABEL[quest.metric] ?? quest.metric
              }`}
            />
          </div>

          <div className="mt-1.5 flex items-center justify-between text-[0.6rem] uppercase tracking-[0.14em]">
            <span className={done ? "text-mint" : expired ? "text-faint" : "text-faint"}>
              {done ? "Completed" : expired ? "Expired" : timeUntil(quest.ends_at)}
            </span>
            <span className="text-cyan">+{quest.reward_xp} XP</span>
          </div>
        </div>
      </div>

      <span className="sr-only">{percent}% complete</span>
    </li>
  );
}

export default async function QuestsPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  await requireHunter();
  await syncQuests().catch(() => null);

  const quests = await getQuests();
  const grouped = ORDER.map((category) => ({
    category,
    items: quests.filter((quest) => quest.category === category),
  })).filter((group) => group.items.length > 0);

  const active = quests.filter((quest) => quest.status === "active").length;
  const completed = quests.filter((quest) => quest.status === "completed").length;
  const xpAvailable = quests
    .filter((quest) => quest.status === "active")
    .reduce((sum, quest) => sum + quest.reward_xp, 0);

  return (
    <div className="space-y-4">
      <Panel glow className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="hud-label" style={{ color: "var(--color-violet)" }}>
              [QUEST BOARD]
            </p>
            <h1 className="font-hud mt-1.5 text-base text-text">Objectives from the System</h1>
            <p className="mt-1 max-w-lg text-xs text-muted">
              Quests refresh automatically each day and week. Progress is measured from recorded sessions only — nothing
              here can be claimed without the study behind it.
            </p>
          </div>
          <QuestRefreshButton />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: "Active", value: String(active), tone: "text-cyan" },
            { label: "Completed", value: String(completed), tone: "text-mint" },
            { label: "XP available", value: String(xpAvailable), tone: "text-violet" },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-line/60 bg-white/[0.02] p-2.5">
              <p className="hud-label">{item.label}</p>
              <p className={cn("numeric mt-1 text-lg", item.tone)}>{item.value}</p>
            </div>
          ))}
        </div>
      </Panel>

      {grouped.length === 0 ? (
        <Panel className="p-10 text-center">
          <ScrollText size={20} className="mx-auto text-faint" aria-hidden />
          <p className="font-hud mt-3 text-sm text-text">No quests issued yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
            The System issues quests on your first completed session. Record one session to open the board.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {grouped.map((group) => (
            <Panel key={group.category} className="overflow-hidden">
              <PanelHeader
                title={QUEST_CATEGORY_LABEL[group.category]}
                subtitle={`${group.items.filter((quest) => quest.status === "active").length} active of ${group.items.length}`}
                icon={group.category === "special" ? <Sparkles size={14} /> : <ScrollText size={14} />}
              />
              <ul className="space-y-2 p-3">
                {group.items.map((quest) => (
                  <QuestRow key={quest.id} quest={quest} />
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}

      <p className="pb-2 text-center text-[0.6rem] uppercase tracking-[0.2em] text-faint/70">
        Quest rewards are granted once per period and audited in your XP ledger
      </p>
    </div>
  );
}
