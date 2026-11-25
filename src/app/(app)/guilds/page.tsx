import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ScrollText, Shield, Users } from "lucide-react";
import { requireHunter } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SetupNotice } from "@/components/app/setup-notice";
import { Panel, PanelHeader } from "@/components/system/panel";
import { GuildCreateForm, GuildLeaveButton } from "@/components/social/guild-controls";
import { getGuildBoard, getGuildDetail, getMyGuildSlug } from "@/lib/data/guilds";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Guilds" };

export default async function GuildsPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  await requireHunter();

  const mySlug = await getMyGuildSlug();
  const [board, myGuild] = await Promise.all([
    getGuildBoard("week"),
    mySlug ? getGuildDetail(mySlug) : Promise.resolve(null),
  ]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
      <div className="space-y-4">
        <Panel glow className="p-4 sm:p-5">
          <p className="hud-label" style={{ color: "var(--color-cyan)" }}>
            [GUILD REGISTRY]
          </p>
          <h1 className="font-hud mt-1.5 text-base text-text">Hunter guilds</h1>
          <p className="mt-1 max-w-lg text-xs text-muted">
            Guilds pool the weekly XP of every member. One guild per hunter — choose allies you will actually study
            with.
          </p>
        </Panel>

        {myGuild ? (
          <Panel className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-xs uppercase"
                  style={{
                    borderColor: `${myGuild.emblem_color}66`,
                    color: myGuild.emblem_color,
                    background: `${myGuild.emblem_color}14`,
                  }}
                  aria-hidden
                >
                  {myGuild.tag}
                </span>
                <div>
                  <p className="hud-label">Your guild</p>
                  <Link href={`/guilds/${myGuild.slug}`} className="font-hud text-sm text-text hover:text-cyan">
                    {myGuild.name}
                  </Link>
                  <p className="numeric mt-0.5 text-[0.62rem] text-faint">
                    {myGuild.member_count} member{myGuild.member_count === 1 ? "" : "s"} ·{" "}
                    {formatNumber(myGuild.weekly_xp)} XP this week
                    {myGuild.weekly_position ? ` · #${myGuild.weekly_position}` : ""}
                  </p>
                </div>
              </div>
              <GuildLeaveButton />
            </div>
            <Link href={`/guilds/${myGuild.slug}`} className="btn btn-ghost mt-3 w-full justify-center py-2 text-xs">
              Open guild hall <ChevronRight size={12} aria-hidden />
            </Link>
          </Panel>
        ) : (
          <Panel className="p-4 sm:p-5">
            <PanelHeader
              title="Found a guild"
              subtitle="You are not in a guild yet. Register one, or join an open guild below."
              icon={<Shield size={14} />}
            />
            <div className="mt-3">
              <GuildCreateForm />
            </div>
          </Panel>
        )}

        <Panel className="p-4 sm:p-5">
          <PanelHeader
            title="Weekly guild board"
            subtitle={board.length === 0 ? "No guilds registered yet" : `${board.length} guilds`}
            icon={<ScrollText size={14} />}
          />

          {board.length === 0 ? (
            <p className="mt-3 rounded-lg border border-line/50 bg-black/20 px-3 py-8 text-center text-xs text-faint">
              The registry is empty. Founding the first guild puts you at the top.
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {board.map((guild) => (
                <li
                  key={guild.guild_id}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border px-2.5 py-2",
                    guild.is_my_guild ? "border-cyan/30 bg-cyan/[0.06]" : "border-line/40 bg-black/15",
                  )}
                >
                  <span className="numeric w-4 shrink-0 text-[0.62rem] text-faint">{guild.rank_position}</span>
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-[0.55rem] uppercase"
                    style={{
                      borderColor: `${guild.emblem_color}55`,
                      color: guild.emblem_color,
                      background: `${guild.emblem_color}12`,
                    }}
                    aria-hidden
                  >
                    {guild.tag}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/guilds/${guild.slug}`} className="block truncate text-xs text-text hover:text-cyan">
                      {guild.name}
                      {guild.is_my_guild ? <span className="ml-1.5 text-[0.55rem] text-cyan">YOURS</span> : null}
                    </Link>
                    <p className="numeric text-[0.58rem] text-faint">
                      {guild.member_count} member{guild.member_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="numeric shrink-0 text-[0.66rem] text-cyan">{formatNumber(guild.period_xp)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <aside className="space-y-4">
        <Panel quiet className="p-4">
          <p className="hud-label flex items-center gap-1.5">
            <Users size={12} aria-hidden /> Guild rules
          </p>
          <ul className="mt-2 space-y-1.5 text-[0.68rem] leading-relaxed text-muted">
            <li>· A hunter belongs to exactly one guild at a time.</li>
            <li>· Guild score is the sum of members&apos; weekly XP — no separate ledger.</li>
            <li>· The leader controls the creed, emblem and membership.</li>
            <li>· Leaving as the last member dissolves the guild.</li>
            <li>· Guild membership never exposes private sessions.</li>
          </ul>
        </Panel>

        <Panel quiet className="p-4">
          <p className="hud-label">Ranks of the hall</p>
          <ul className="mt-2 space-y-1.5 text-[0.68rem] leading-relaxed text-muted">
            <li>
              <span className="text-text">Leader</span> — full control of the guild record and roster.
            </li>
            <li>
              <span className="text-text">Officer</span> — may remove plain members.
            </li>
            <li>
              <span className="text-text">Member</span> — contributes XP, cannot change the roster.
            </li>
          </ul>
        </Panel>
      </aside>
    </div>
  );
}
