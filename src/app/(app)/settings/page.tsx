import type { Metadata } from "next";
import { Info, ShieldCheck } from "lucide-react";
import { requireHunter } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SetupNotice } from "@/components/app/setup-notice";
import { DangerZone, ProfileSettingsForm } from "@/components/profile/profile-settings-form";
import { Panel } from "@/components/system/panel";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  const { profile, user } = await requireHunter();

  return (
    <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
      <div className="space-y-4">
        <ProfileSettingsForm profile={profile} />
        <DangerZone />
      </div>

      <aside className="space-y-4">
        <Panel quiet className="p-4">
          <p className="hud-label flex items-center gap-1.5">
            <ShieldCheck size={12} aria-hidden /> Account
          </p>
          <dl className="mt-2 space-y-2 text-xs">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-faint">Email</dt>
              <dd className="min-w-0 truncate text-text">{user.email}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-faint">Hunter ID</dt>
              <dd className="numeric text-text">{profile.hunter_id}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-faint">Registered</dt>
              <dd className="text-text">{formatDate(profile.created_at)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-faint">Role</dt>
              <dd className="text-text capitalize">{profile.role}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[0.66rem] leading-relaxed text-faint">
            Your email is only used to sign in. It is never displayed on your public profile or shared with other
            hunters.
          </p>
        </Panel>

        <Panel quiet className="p-4">
          <p className="hud-label flex items-center gap-1.5">
            <Info size={12} aria-hidden /> Integrity rules
          </p>
          <ul className="mt-2 space-y-1.5 text-[0.68rem] leading-relaxed text-muted">
            <li>· XP, levels and ranks are computed by the database, never by your browser.</li>
            <li>· Every XP change is written to an append-only ledger with a unique source key.</li>
            <li>· Completing the same session twice cannot award XP twice.</li>
            <li>· Only your subjects and topics are directly editable.</li>
          </ul>
        </Panel>
      </aside>
    </div>
  );
}
