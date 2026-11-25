import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Crown, Shield, TrendingUp, Users } from "lucide-react";
import { requireHunter } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SetupNotice } from "@/components/app/setup-notice";
import { Panel, PanelHeader } from "@/components/system/panel";
import { RankBadge } from "@/components/system/rank-badge";
import { HunterAvatar } from "@/components/system/hunter-avatar";
import {
  GuildDangerNote,
  GuildJoinButton,
  GuildLeaveButton,
  GuildMemberControls,
  GuildSettingsForm,
} from "@/components/social/guild-controls";
import { getGuildDetail } from "@/lib/data/guilds";
import { formatHours, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guild = isSupabaseConfigured ? await getGuildDetail(slug) : null;
  return { title: guild ? `${guild.name} [${guild.tag}]` : "Guild" };
}

export default async function GuildPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured) return <SetupNotice />;
  await requireHunter();

  const { slug } = await params;
  const guild = await getGuildDetail(slug);
  if (!guild) notFound();

  const myRole = guild.my_role;
  const inGuild = myRole !== null;

  return (
    <div className="space-y-4">
      <Panel glow className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border text-sm uppercase"
              style={{
                borderColor: `${guild.emblem_color}66`,
                color: guild.emblem_color,
                background: `${guild.emblem_color}14`,
                boxShadow: `0 12px 40px -24px ${guild.emblem_color}`,
              }}
              aria-hidden
            >
              {guild.tag}
            </span>
            <div>
              <Link href="/guilds" className="hud-label inline-flex items-center gap-1 hover:text-text">
                <ArrowLeft size={11} aria-hidden /> Registry
              </Link>
              <h1 className="font-hud mt-1 text-base text-text">{guild.name}</h1>
              <p className="mt-1 max-w-lg text-xs text-muted">
                {guild.description ?? "No creed registered."}
              </p>
              <p className="numeric mt-1.5 text-[0.62rem] text-faint">
                {guild.member_count}/{guild.member_limit} members ·{" "}
                {guild.is_open ? "open to recruits" : "closed to recruits"}
                {guild.weekly_position ? ` · weekly #${guild.weekly_position}` : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {inGuild ? <GuildLeaveButton compact /> : guild.is_open ? <GuildJoinButton guildId={guild.id} slug={guild.slug} /> : null}
            {!guild.is_open && !inGuild ? (
              <span className="text-[0.62rem] uppercase tracking-[0.16em] text-faint">Recruitment closed</span>
            ) : null}
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Weekly XP", value: formatNumber(guild.weekly_xp), icon: TrendingUp },
            { label: "Lifetime XP", value: formatNumber(guild.xp_total), icon: Crown },
            { label: "Study time", value: formatHours(guild.study_seconds), icon: Clock },
            { label: "Sessions", value: formatNumber(guild.sessions), icon: Users },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-line/60 bg-black/30 px-3 py-2">
              <dt className="hud-label flex items-center gap-1.5">
                <item.icon size={10} aria-hidden /> {item.label}
              </dt>
              <dd className="numeric mt-0.5 text-sm text-text">{item.value}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <Panel className="p-4 sm:p-5">
          <PanelHeader
            title="Roster"
            subtitle={`${guild.member_count} hunter${guild.member_count === 1 ? "" : "s"}`}
            icon={<Users size={14} />}
          />

          <ul className="mt-3 space-y-1.5">
            {guild.members.map((member) => (
              <li
                key={member.user_id}
                className={cn(
                  "flex flex-wrap items-center gap-2.5 rounded-lg border border-line/40 px-2.5 py-2",
                  member.user_id === guild.owner_id ? "bg-gold/[0.05]" : "bg-black/15",
                )}
              >
                <HunterAvatar
                  username={member.username}
                  avatarUrl={member.avatar_url}
                  rank={member.rank}
                  size={28}
                  ring={member.role === "leader"}
                />
                <div className="min-w-0 flex-1">
                  <Link href={`/hunters/${member.username}`} className="truncate text-xs text-text hover:text-cyan">
                    {member.username}
                  </Link>
                  <p className="numeric text-[0.58rem] text-faint">
                    LV {member.level} · {formatNumber(member.xp_total)} XP
                  </p>
                </div>
                {member.role !== "member" ? (
                  <span
                    className={cn(
                      "flex items-center gap-1 rounded border px-1.5 py-0.5 text-[0.52rem] uppercase tracking-[0.14em]",
                      member.role === "leader"
                        ? "border-gold/40 bg-gold/10 text-gold"
                        : "border-cyan/35 bg-cyan/10 text-cyan",
                    )}
                  >
                    <Shield size={9} aria-hidden /> {member.role}
                  </span>
                ) : null}
                <RankBadge rank={member.rank} size="sm" />
                {myRole ? <GuildMemberControls userId={member.user_id} role={member.role} myRole={myRole} /> : null}
              </li>
            ))}
          </ul>

          {inGuild ? <GuildDangerNote /> : null}
        </Panel>

        <aside className="space-y-4">
          {myRole === "leader" ? (
            <Panel className="p-4">
              <PanelHeader title="Guild record" subtitle="Leader controls" icon={<Shield size={14} />} />
              <GuildSettingsForm
                isOpen={guild.is_open}
                color={guild.emblem_color}
                description={guild.description}
              />
            </Panel>
          ) : (
            <Panel quiet className="p-4">
              <p className="hud-label">Your role</p>
              <p className="mt-1 text-xs text-muted">
                {myRole
                  ? myRole === "officer"
                    ? "Officer — you can remove plain members and contribute XP."
                    : "Member — you contribute weekly XP to the guild total."
                  : "Observer — join the guild to contribute and appear on its roster."}
              </p>
            </Panel>
          )}

          <Panel quiet className="p-4">
            <p className="hud-label">How the score works</p>
            <p className="mt-1.5 text-[0.68rem] leading-relaxed text-muted">
              Guild XP is the sum of verified session XP earned by members in the selected window. The guild cannot
              mint XP: everything it counts was recorded by a hunter completing a focus session.
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
