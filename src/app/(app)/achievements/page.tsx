import type { Metadata } from "next";
import { Award, Lock, Sparkles, Trophy } from "lucide-react";
import { requireHunter } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SetupNotice } from "@/components/app/setup-notice";
import { getAchievements } from "@/lib/data/hunter";
import { Panel, PanelHeader } from "@/components/system/panel";
import { StatBar } from "@/components/system/meter";
import { RARITY_LABEL } from "@/lib/format";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Achievements" };

const RARITY_TONE: Record<string, { text: string; border: string; bg: string }> = {
  common: { text: "text-muted", border: "border-line/60", bg: "bg-white/[0.03]" },
  rare: { text: "text-cyan", border: "border-cyan/30", bg: "bg-cyan/8" },
  epic: { text: "text-violet", border: "border-violet/35", bg: "bg-violet/10" },
  legendary: { text: "text-gold", border: "border-gold/40", bg: "bg-gold/10" },
};

export default async function AchievementsPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  await requireHunter();

  const achievements = await getAchievements();
  const unlocked = achievements.filter((item) => item.unlocked_at);
  const locked = achievements.filter((item) => !item.unlocked_at);
  const percent = achievements.length === 0 ? 0 : Math.round((unlocked.length / achievements.length) * 100);

  return (
    <div className="space-y-4">
      <Panel glow className="p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="hud-label" style={{ color: "var(--color-violet)" }}>
              [ACHIEVEMENT ARCHIVE]
            </p>
            <h1 className="font-hud mt-1.5 text-base text-text">
              {unlocked.length} of {achievements.length} unlocked
            </h1>
            <p className="mt-1 max-w-lg text-xs text-muted">
              Achievements are permanent. Each one is earned from recorded behaviour, never assigned manually.
            </p>
          </div>
          <div className="w-full max-w-xs">
            <StatBar value={percent} max={100} variant="violet" label="Archive completion" rightLabel={`${percent}%`} />
          </div>
        </div>
      </Panel>

      {unlocked.length > 0 ? (
        <Panel>
          <PanelHeader
            title="Unlocked"
            subtitle={`${unlocked.length} earned`}
            icon={<Trophy size={14} />}
          />
          <ul className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {unlocked.map((achievement) => {
              const tone = RARITY_TONE[achievement.rarity] ?? RARITY_TONE.common;
              return (
                <li
                  key={achievement.code}
                  className={cn("rounded-lg border p-3", tone.border, tone.bg)}
                >
                  <div className="flex items-start gap-2.5">
                    <span className={cn("mt-0.5 flex h-7 w-7 items-center justify-center rounded-md border", tone.border, tone.text)}>
                      <Award size={13} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[0.8rem] text-text">{achievement.name}</p>
                      <p className="mt-0.5 text-[0.68rem] text-muted">{achievement.description}</p>
                      <p className="mt-1 flex items-center gap-2 text-[0.58rem] uppercase tracking-[0.14em]">
                        <span className={tone.text}>{RARITY_LABEL[achievement.rarity] ?? achievement.rarity}</span>
                        <span className="text-faint">·</span>
                        <span className="text-cyan">+{achievement.reward_xp} XP</span>
                        <span className="text-faint">·</span>
                        <span className="text-faint">{formatDate(achievement.unlocked_at)}</span>
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      {locked.length > 0 ? (
        <Panel>
          <PanelHeader title="Still locked" subtitle={`${locked.length} remain`} icon={<Lock size={14} />} />
          <ul className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {locked.map((achievement) => (
              <li key={achievement.code} className="rounded-lg border border-line/40 bg-white/[0.015] p-3 opacity-70">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md border border-line/50 text-faint">
                    <Lock size={12} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[0.8rem] text-muted">{achievement.name}</p>
                    <p className="mt-0.5 text-[0.68rem] text-faint">{achievement.description}</p>
                    <p className="mt-1 text-[0.58rem] uppercase tracking-[0.14em] text-faint">
                      {RARITY_LABEL[achievement.rarity] ?? achievement.rarity} · target {achievement.target_value}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <Panel className="p-8 text-center">
          <Sparkles size={18} className="mx-auto text-gold" aria-hidden />
          <p className="font-hud mt-2 text-sm text-gold">Perfect archive</p>
          <p className="mt-1 text-xs text-muted">Every achievement in the System has been unlocked.</p>
        </Panel>
      )}
    </div>
  );
}
