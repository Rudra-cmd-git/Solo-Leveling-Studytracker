import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Award, Flame, Sparkles, Timer, Trophy } from "lucide-react";
import { getPublicHunter } from "@/lib/data/leaderboard";
import { getOptionalHunter } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { Panel } from "@/components/system/panel";
import { RankBadge } from "@/components/system/rank-badge";
import { HunterAvatar } from "@/components/system/hunter-avatar";
import { LevelRing, StatBar } from "@/components/system/meter";
import { rankProgress, levelProgress } from "@/lib/progression";
import { formatDate, formatMinutes, formatNumber, RARITY_LABEL } from "@/lib/format";
import { RARITY_TONE } from "@/lib/labels";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `${username} · Hunter record`,
    description: `Study statistics and achievements for the hunter ${username}.`,
  };
}

export default async function HunterProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  if (!isSupabaseConfigured) notFound();
  const hunter = await getPublicHunter(decodeURIComponent(username));

  if (!hunter) notFound();

  const { profile } = await getOptionalHunter();
  const isMe = profile?.id === hunter.id;
  const rank = rankProgress(hunter.xp_total);
  const level = levelProgress(hunter.xp_total);

  return (
    <div className="space-y-4">
      <Panel glow className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-line/60 px-4 py-2.5">
          <span className="hud-label" style={{ color: "var(--color-cyan)" }}>
            [HUNTER RECORD]
          </span>
          <span className="numeric text-[0.6rem] uppercase tracking-[0.18em] text-faint">{hunter.hunter_id}</span>
        </div>

        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1.5fr_auto_1fr] lg:items-center">
          <div className="flex items-center gap-4">
            <HunterAvatar username={hunter.username} avatarUrl={hunter.avatar_url} rank={hunter.rank} size={72} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-hud truncate text-xl text-text">{hunter.display_name || hunter.username}</h1>
                <RankBadge rank={hunter.rank} size="md" showName />
              </div>
              <p className="mt-0.5 text-xs text-faint">
                @{hunter.username} · joined {formatDate(hunter.created_at)}
                {hunter.on_leaderboard && hunter.position ? ` · #${hunter.position} on the board` : ""}
              </p>
              {hunter.bio ? <p className="mt-2 max-w-md text-xs leading-relaxed text-muted">{hunter.bio}</p> : null}
              <div className="mt-2 flex flex-wrap gap-1.5 text-[0.6rem] uppercase tracking-[0.14em]">
                <span className="inline-flex items-center gap-1 rounded border border-gold/25 bg-gold/8 px-1.5 py-0.5 text-gold">
                  <Flame size={10} aria-hidden /> {hunter.current_streak} day streak
                </span>
                <span className="inline-flex items-center gap-1 rounded border border-line/60 bg-white/[0.03] px-1.5 py-0.5 text-faint">
                  best {hunter.longest_streak}
                </span>
                <span className="inline-flex items-center gap-1 rounded border border-cyan/25 bg-cyan/8 px-1.5 py-0.5 text-cyan">
                  <Sparkles size={10} aria-hidden /> {formatNumber(hunter.xp_total)} XP
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-center lg:px-4">
            <LevelRing level={hunter.level} percent={level.percent} rank={hunter.rank} size={124} />
          </div>

          <div className="space-y-2.5">
            <StatBar
              value={level.intoLevel}
              max={level.needed}
              label="Next level"
              rightLabel={`${formatNumber(level.intoLevel)} / ${formatNumber(level.needed)} XP`}
            />
            <StatBar
              value={rank.next ? rank.percent : 100}
              max={100}
              variant="gold"
              label={rank.next ? `To ${rank.next.code}-Rank` : "Peak rank"}
              rightLabel={rank.next ? `${formatNumber(rank.remaining)} XP left` : "MAX"}
            />
            {isMe ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <Link href="/dashboard" className="btn btn-primary px-3 py-1.5 text-xs">
                  Status window <ArrowRight size={12} aria-hidden />
                </Link>
                <Link href="/settings" className="btn btn-ghost px-3 py-1.5 text-xs">
                  Edit record
                </Link>
              </div>
            ) : (
              <Link href="/leaderboard" className="btn btn-ghost mt-1 px-3 py-1.5 text-xs">
                <Trophy size={12} aria-hidden /> Back to rankings
              </Link>
            )}
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Lifetime focus", value: formatMinutes(hunter.lifetime_minutes), icon: Timer },
          { label: "Sessions", value: formatNumber(hunter.lifetime_sessions), icon: Timer },
          { label: "Quests cleared", value: formatNumber(hunter.quests_completed), icon: Award },
          { label: "This week", value: formatMinutes(hunter.weekly_minutes), icon: Sparkles },
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
          <h2 className="font-hud text-[0.78rem] text-cyan/90">Achievements</h2>
          <span className="numeric text-[0.62rem] text-faint">
            {hunter.achievements.length} of {hunter.achievements_count}
          </span>
        </div>
        {hunter.achievements.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-faint">No achievements unlocked yet.</p>
        ) : (
          <ul className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {hunter.achievements.map((achievement) => {
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

      <p className="pb-2 text-center text-[0.6rem] uppercase tracking-[0.2em] text-faint/70">
        Public records show study statistics only
      </p>
    </div>
  );
}
