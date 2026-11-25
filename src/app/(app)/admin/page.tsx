import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck, Search, Users } from "lucide-react";
import { requireHunter } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SetupNotice } from "@/components/app/setup-notice";
import { Panel, PanelHeader } from "@/components/system/panel";
import { RankBadge } from "@/components/system/rank-badge";
import { HunterAvatar } from "@/components/system/hunter-avatar";
import { RoleControl } from "@/components/admin/role-control";
import { getAdminHunters, getAdminOverview } from "@/lib/data/admin";
import { formatDate, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Console" };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  if (!isSupabaseConfigured) return <SetupNotice />;

  const { profile } = await requireHunter();
  // Not a 403 page: staff-only routes should not advertise themselves.
  if (profile.role !== "admin" && profile.role !== "moderator") notFound();

  const { q } = await searchParams;
  const search = (q ?? "").trim() || null;

  const [overview, hunters] = await Promise.all([getAdminOverview(), getAdminHunters(search, 30)]);

  const stats = overview
    ? [
        { label: "Hunters", value: formatNumber(overview.hunters) },
        { label: "New (7d)", value: formatNumber(overview.new_last_7d) },
        { label: "Active today", value: formatNumber(overview.active_today) },
        { label: "Sessions", value: formatNumber(overview.sessions) },
        { label: "Hours logged", value: formatNumber(Math.round(overview.minutes / 60)) },
        { label: "XP awarded", value: formatNumber(overview.xp_awarded) },
        { label: "Guilds", value: formatNumber(overview.guilds) },
        { label: "Ally links", value: formatNumber(overview.friendships) },
      ]
    : [];

  return (
    <div className="space-y-4">
      <Panel glow className="p-4 sm:p-5">
        <p className="hud-label flex items-center gap-1.5" style={{ color: "var(--color-cyan)" }}>
          <ShieldCheck size={11} aria-hidden /> [MODERATION CONSOLE] · {profile.role}
        </p>
        <h1 className="font-hud mt-1.5 text-base text-text">System Oversight</h1>
        <p className="mt-1 max-w-xl text-xs text-muted">
          Read-only telemetry plus role assignment. XP, levels and ranks are never editable here — they are derived from
          verified sessions and cannot be written by anyone, staff included.
        </p>

        {overview ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {stats.map((item) => (
              <div key={item.label} className="rounded-lg border border-line/60 bg-black/25 px-3 py-2">
                <p className="hud-label">{item.label}</p>
                <p className="numeric mt-0.5 text-sm text-text">{item.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-faint">Telemetry unavailable.</p>
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="Hunters"
          subtitle={`${hunters.length} shown${search ? ` for “${search}”` : ""}`}
          icon={<Users size={14} />}
          action={
            <form action="/admin" method="get" className="flex items-center gap-1.5">
              <input
                name="q"
                defaultValue={search ?? ""}
                placeholder="Find hunter"
                className="field !w-32 !py-1.5 text-xs"
                aria-label="Search hunters"
              />
              <button type="submit" className="btn btn-ghost h-8 w-8 !px-0" aria-label="Search">
                <Search size={13} aria-hidden />
              </button>
            </form>
          }
        />

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse">
            <thead>
              <tr className="border-y border-line/50 text-left">
                {["Hunter", "Rank", "LV", "XP", "Sessions", "Joined", "Role"].map((heading) => (
                  <th key={heading} className="hud-label px-3 py-2 font-normal">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hunters.map((hunter) => (
                <tr key={hunter.user_id} className="border-b border-line/30 hover:bg-white/[0.02]">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <HunterAvatar
                        username={hunter.username}
                        avatarUrl={hunter.avatar_url}
                        rank={hunter.hunter_rank}
                        size={22}
                        ring={false}
                      />
                      <Link href={`/hunters/${hunter.username}`} className="truncate text-xs text-text hover:text-cyan">
                        {hunter.username}
                      </Link>
                      {!hunter.is_public ? (
                        <span className="rounded border border-line/60 px-1 text-[0.5rem] text-faint">private</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <RankBadge rank={hunter.hunter_rank} size="sm" />
                  </td>
                  <td className="numeric px-3 py-2 text-xs text-muted">{hunter.level}</td>
                  <td className="numeric px-3 py-2 text-xs text-cyan">{formatNumber(hunter.xp_total)}</td>
                  <td className="numeric px-3 py-2 text-xs text-muted">{formatNumber(hunter.sessions)}</td>
                  <td className="numeric px-3 py-2 text-[0.6rem] text-faint">{formatDate(hunter.created_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <RoleControl
                      userId={hunter.user_id}
                      role={hunter.hunter_role}
                      isSelf={hunter.user_id === profile.id}
                    />
                  </td>
                </tr>
              ))}
              {hunters.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-xs text-faint">
                    No hunters match that search.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-[0.62rem] leading-relaxed text-faint">
          Admin rights cannot be granted from this console, and nobody can change their own role. To create the first
          admin, the project owner runs{" "}
          <code className="text-muted">update profiles set role = &apos;admin&apos; where username = &apos;you&apos;;</code>{" "}
          in the Supabase SQL editor.
        </p>
      </Panel>
    </div>
  );
}
