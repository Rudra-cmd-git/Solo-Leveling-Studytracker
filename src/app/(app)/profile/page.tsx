import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Award, Eye, EyeOff, Flame, Settings, Sparkles, Timer, Trophy } from "lucide-react";
import { requireHunter } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SetupNotice } from "@/components/app/setup-notice";
import { getAchievements, getOverview } from "@/lib/data/hunter";
import { Panel } from "@/components/system/panel";
import { RankBadge } from "@/components/system/rank-badge";
import { HunterAvatar } from "@/components/system/hunter-avatar";
import { LevelRing, StatBar } from "@/components/system/meter";
import { formatDate, formatMinutes, formatNumber, RARITY_LABEL } from "@/lib/format";
import { RARITY_TONE } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  const { profile } = await requireHunter();
  const [overview, achievements] = await Promise.all([getOverview(), getAchievements()]);
  const unlocked = achievements.filter((item) => item.unlocked_at);

  return (
    <div className="space-y-4">
      <Panel glow className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 px-4 py-2.5">
          <span className="hud-label" style={{ color: "var(--color-cyan)" }}>
            [YOUR RECORD]
          </span>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[0.58rem] uppercase tracking-[0.14em]",
                profile.is_public ? "border-mint/30 text-mint" : "border-line/60 text-faint",
              )}
            >
              {profile.is_public ? <Eye size={10} aria-hidden /> : <EyeOff size={10} aria-hidden />}
              {profile.is_public ? "Public profile" : "Private profile"}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[0.58rem] uppercase tracking-[0.14em]",
                profile.show_on_leaderboard ? "border-gold/30 text-gold" : "border-line/60 text-faint",
              )}
            >
              <Trophy size={10} aria-hidden />
              {profile.show_on_leaderboard ? "On leaderboard" : "Off leaderboard"}
            </span>
          </div>
        </div>

        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1.5fr_auto_1fr] lg:items-center">
          <div className="flex items-center gap-4">
            <HunterAvatar
              username={profile.username}
              avatarUrl={profile.avatar_url}
              rank={profile.rank}
              size={72}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-hud truncate text-xl text-text">
                  {profile.display_name || profile.username}
                </h1>
                <RankBadge rank={profile.rank} size="md" showName />
              </div>
              <p className="mt-0.5 text-xs text-faint">
                @{profile.username} · {profile.hunter_id} · joined {formatDate(profile.created_at)}
              </p>
              <p className="mt-2 max-w-md text-xs leading-relaxed text-muted">
                {profile.bio || "No bio yet. Add one in settings so other hunters know what you are working towards."}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[0.6rem] uppercase tracking-[0.14em]">
                <span className="inline-flex items-center gap-1 rounded border border-gold/25 bg-gold/8 px-1.5 py-0.5 text-gold">
                  <Flame size={10} aria-hidden /> {profile.current_streak} day streak
                </span>
                <span className="inline-flex items-center gap-1 rounded border border-cyan/25 bg-cyan/8 px-1.5 py-0.5 text-cyan">
                  <Sparkles size={10} aria-hidden /> {formatNumber(profile.xp_total)} XP
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-center lg:px-4">
            <LevelRing level={profile.level} percent={overview.level.percent} rank={profile.rank} size={124} />
          </div>

          <div className="space-y-2.5">
            <StatBar
              value={overview.level.into}
              max={overview.level.needed}
              label="Next level"
              rightLabel={`${formatNumber(overview.level.into)} / ${formatNumber(overview.level.needed)} XP`}
            />
            <StatBar
              value={overview.rank.next ? overview.rank.percent : 100}
              max={100}
              variant="gold"
              label={overview.rank.next ? `To ${overview.rank.next}-Rank` : "Peak rank"}
              rightLabel={overview.rank.next ? `${formatNumber(overview.rank.remaining)} XP left` : "MAX"}
            />
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href="/settings" className="btn btn-primary px-3 py-1.5 text-xs">
                <Settings size={12} aria-hidden /> Edit record
              </Link>
              {profile.is_public ? (
                <Link href={`/hunters/${profile.username}`} className="btn btn-ghost px-3 py-1.5 text-xs">
                  View public page <ArrowRight size={11} aria-hidden />
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Lifetime focus", value: formatMinutes(Math.round(profile.total_study_seconds / 60)), icon: Timer },
          { label: "Sessions", value: formatNumber(profile.sessions_completed), icon: Timer },
          { label: "Quests cleared", value: formatNumber(profile.quests_completed), icon: Award },
          { label: "Longest streak", value: `${profile.longest_streak}d`, icon: Flame },
        ].map((tile) => {
          const Icon = tile.icon;
          return (
            <div key={tile.label} className="rounded-xl border border-line/60 bg-white/[0.02] p-3.5">
              <div className="flex items-center justify-between">
                <p className="hud-label">{tile.label}</p>
                <Icon size={12} className="text-cyan/60" aria-hidden />
              </div>
              <p className="numeric mt-2 text-lg text-text">{tile.value}</p>
            </div>
          );
        })}
      </div>

      <Panel>
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="font-hud text-[0.78rem] text-cyan/90">Achievement archive</h2>
          <span className="numeric text-[0.62rem] text-faint">
            {unlocked.length} / {achievements.length}
          </span>
        </div>
        {unlocked.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-faint">
            Nothing unlocked yet. Your first session opens the archive.
          </p>
        ) : (
          <ul className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {unlocked.map((achievement) => {
              const tone = RARITY_TONE[achievement.rarity] ?? RARITY_TONE.common;
              return (
                <li key={achievement.code} className={cn("rounded-lg border p-3", tone.border, tone.bg)}>
                  <p className="text-[0.8rem] text-text">{achievement.name}</p>
                  <p className="mt-0.5 text-[0.68rem] text-muted">{achievement.description}</p>
                  <p className={cn("mt-1 text-[0.58rem] uppercase tracking-[0.14em]", tone.text)}>
                    {RARITY_LABEL[achievement.rarity] ?? achievement.rarity} · {formatDate(achievement.unlocked_at)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
