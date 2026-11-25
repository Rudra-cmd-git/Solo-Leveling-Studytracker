"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Save, ShieldAlert, TriangleAlert, Trash2 } from "lucide-react";
import {
  deleteAccountAction,
  updateProfileAction,
  type ProfileState,
} from "@/app/actions/profile";
import { Panel, PanelHeader } from "@/components/system/panel";
import { AvatarUploader } from "@/components/profile/avatar-uploader";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

const INITIAL: ProfileState = { status: "idle" };

export function ProfileSettingsForm({ profile }: { profile: Profile }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, INITIAL);
  const timezoneRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = timezoneRef.current;
    if (!input || input.value) return;
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (zone && !input.value) input.value = zone;
    } catch {
      /* keep server value */
    }
  }, []);

  return (
    <Panel glow className="p-4 sm:p-5">
      <PanelHeader
        title="Hunter record"
        subtitle="These fields appear on your public profile, except your email."
        icon={<Save size={14} />}
      />

      <AvatarUploader profile={profile} className="mt-4" />

      <form action={formAction} className="mt-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="username" className="hud-label mb-1.5 block">
              Hunter handle
            </label>
            <input
              id="username"
              name="username"
              defaultValue={profile.username}
              required
              minLength={3}
              maxLength={20}
              pattern="[A-Za-z0-9_]{3,20}"
              className={cn("field", state.fields?.username && "field-invalid")}
            />
            <p className="mt-1 text-[0.62rem] text-faint">Changing this changes your public profile URL.</p>
            {state.fields?.username ? <p className="mt-1 text-[0.68rem] text-ember">{state.fields.username}</p> : null}
          </div>
          <div>
            <label htmlFor="displayName" className="hud-label mb-1.5 block">
              Display name
            </label>
            <input
              id="displayName"
              name="displayName"
              defaultValue={profile.display_name ?? ""}
              maxLength={40}
              placeholder="Optional"
              className="field"
            />
          </div>
        </div>

        <div>
          <label htmlFor="bio" className="hud-label mb-1.5 block">
            Bio
          </label>
          <textarea
            id="bio"
            name="bio"
            defaultValue={profile.bio ?? ""}
            maxLength={500}
            rows={3}
            placeholder="What are you working towards?"
            className={cn("field resize-none", state.fields?.bio && "field-invalid")}
          />
          {state.fields?.bio ? <p className="mt-1 text-[0.68rem] text-ember">{state.fields.bio}</p> : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="timezone" className="hud-label mb-1.5 block">
              Timezone
            </label>
            <input
              id="timezone"
              name="timezone"
              ref={timezoneRef}
              defaultValue={profile.timezone}
              className="field"
              placeholder="Asia/Kolkata"
            />
            <p className="mt-1 text-[0.62rem] text-faint">Decides when your day, streak and quests reset.</p>
          </div>
          <div>
            <label htmlFor="dailyGoalMinutes" className="hud-label mb-1.5 block">
              Daily goal (minutes)
            </label>
            <input
              id="dailyGoalMinutes"
              name="dailyGoalMinutes"
              type="number"
              min={15}
              max={1440}
              defaultValue={profile.daily_goal_minutes}
              className={cn("field", state.fields?.dailyGoalMinutes && "field-invalid")}
            />
            {state.fields?.dailyGoalMinutes ? (
              <p className="mt-1 text-[0.68rem] text-ember">{state.fields.dailyGoalMinutes}</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-line/60 bg-black/20 p-3">
          <label className="flex cursor-pointer items-start gap-2.5 text-xs text-muted">
            <input
              type="checkbox"
              name="isPublic"
              defaultChecked={profile.is_public}
              className="mt-0.5 h-4 w-4 accent-[var(--color-cyan)]"
            />
            <span>
              <span className="block text-text">Public hunter profile</span>
              Anyone with the link can see your level, rank and study totals. Your email is never shown.
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2.5 text-xs text-muted">
            <input
              type="checkbox"
              name="showOnLeaderboard"
              defaultChecked={profile.show_on_leaderboard}
              className="mt-0.5 h-4 w-4 accent-[var(--color-cyan)]"
            />
            <span>
              <span className="block text-text">Appear on the leaderboard</span>
              Your handle, rank, level and XP appear in global rankings. You can leave at any time.
            </span>
          </label>
        </div>

        {state.status === "error" && state.message ? (
          <p className="flex items-start gap-2 rounded-lg border border-ember/35 bg-ember/10 px-3 py-2 text-xs text-ember">
            <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden /> {state.message}
          </p>
        ) : null}
        {state.status === "success" ? (
          <p className="flex items-center gap-2 rounded-lg border border-mint/35 bg-mint/10 px-3 py-2 text-xs text-mint">
            <Check size={13} aria-hidden /> {state.message}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary w-full py-2.5" disabled={pending}>
          {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Save size={14} aria-hidden />}
          {pending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </Panel>
  );
}

export function DangerZone() {
  const [state, formAction, pending] = useActionState(deleteAccountAction, INITIAL);
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Panel className="border-ember/30 p-4 sm:p-5">
      <PanelHeader
        title="Delete account"
        subtitle="Permanently removes your profile, sessions, XP and achievements."
        icon={<ShieldAlert size={14} />}
      />

      <div className="mt-3 px-1">
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 text-[0.68rem] uppercase tracking-[0.15em] text-ember/80 transition-colors hover:text-ember"
          >
            <Trash2 size={12} aria-hidden /> I want to delete my account
          </button>
        ) : (
          <form
            action={formAction}
            className="space-y-2.5 rounded-lg border border-ember/30 bg-ember/[0.06] p-3"
            onSubmit={() => startTransition(() => router.refresh())}
          >
            <p className="text-xs text-muted">
              This cannot be undone. Type <span className="font-mono text-ember">DELETE</span> to confirm.
            </p>
            <input
              name="confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className={cn("field", state.fields?.confirmation && "field-invalid")}
              placeholder="DELETE"
              autoComplete="off"
            />
            {state.status === "error" && state.message ? (
              <p className="text-[0.68rem] text-ember">{state.message}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="btn px-3 py-1.5 text-xs"
                style={{ background: "rgba(255,107,107,0.16)", color: "var(--color-ember)", border: "1px solid rgba(255,107,107,0.4)" }}
                disabled={pending || confirmation.trim().toUpperCase() !== "DELETE"}
              >
                {pending ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Trash2 size={12} aria-hidden />}
                Delete permanently
              </button>
              <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost px-3 py-1.5 text-xs">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </Panel>
  );
}
