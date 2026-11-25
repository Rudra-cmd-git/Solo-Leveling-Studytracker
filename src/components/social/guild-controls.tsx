"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, DoorOpen, Loader2, Plus, Save, Shield, Trash2, TriangleAlert, UserMinus } from "lucide-react";
import {
  createGuildAction,
  joinGuildAction,
  leaveGuildAction,
  removeGuildMemberAction,
  setGuildRoleAction,
  updateGuildAction,
  type SocialState,
} from "@/app/actions/social";
import { cn } from "@/lib/utils";

const INITIAL: SocialState = { status: "idle" };

/* ------------------------------------------------------------ create guild -- */

export function GuildCreateForm() {
  const [state, formAction, pending] = useActionState(createGuildAction, INITIAL);
  const [color, setColor] = useState("#38e1ff");

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1.6fr_0.9fr]">
        <div>
          <label htmlFor="name" className="hud-label mb-1.5 block">
            Guild name
          </label>
          <input
            id="name"
            name="name"
            required
            minLength={3}
            maxLength={32}
            placeholder="Blue Gate"
            className={cn("field", state.fields?.name && "field-invalid")}
          />
          {state.fields?.name ? <p className="mt-1 text-[0.68rem] text-ember">{state.fields.name}</p> : null}
        </div>
        <div>
          <label htmlFor="tag" className="hud-label mb-1.5 block">
            Tag
          </label>
          <input
            id="tag"
            name="tag"
            required
            minLength={2}
            maxLength={5}
            placeholder="BG"
            className={cn("field uppercase", state.fields?.tag && "field-invalid")}
          />
          {state.fields?.tag ? <p className="mt-1 text-[0.68rem] text-ember">{state.fields.tag}</p> : null}
        </div>
      </div>

      <div>
        <label htmlFor="description" className="hud-label mb-1.5 block">
          Creed (optional)
        </label>
        <textarea
          id="description"
          name="description"
          rows={2}
          maxLength={280}
          placeholder="What does your guild stand for?"
          className={cn("field resize-none", state.fields?.description && "field-invalid")}
        />
        {state.fields?.description ? (
          <p className="mt-1 text-[0.68rem] text-ember">{state.fields.description}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="color" className="hud-label mb-1.5 block">
            Emblem
          </label>
          <input
            id="color"
            name="color"
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="h-8 w-16 cursor-pointer rounded-md border border-line/60 bg-black/30 p-0.5"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            name="isOpen"
            defaultChecked
            className="h-4 w-4 accent-[var(--color-cyan)]"
            aria-label="Open to new members"
          />
          Open to new members
        </label>
      </div>

      {state.status === "error" && state.message ? (
        <p className="flex items-start gap-2 rounded-lg border border-ember/35 bg-ember/10 px-3 py-2 text-xs text-ember">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary w-full py-2.5" disabled={pending}>
        {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Plus size={14} aria-hidden />}
        {pending ? "Registering…" : "Found guild"}
      </button>
    </form>
  );
}

/* -------------------------------------------------------------- join guild -- */

export function GuildJoinButton({ guildId, slug }: { guildId: string; slug: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setError(null);
    setPending(true);
    try {
      const result = await joinGuildAction(guildId);
      if (result.status === "error") {
        setError(result.message ?? "The System refused that request.");
        return;
      }
      router.push(`/guilds/${slug}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={() => void join()} disabled={pending} className="btn px-2.5 py-1 text-[0.62rem]">
        {pending ? <Loader2 size={11} className="animate-spin" aria-hidden /> : <Plus size={11} aria-hidden />}
        Join
      </button>
      {error ? <span className="max-w-[10rem] text-right text-[0.6rem] text-ember">{error}</span> : null}
    </div>
  );
}

/* --------------------------------------------------------------- leave guild -- */

export function GuildLeaveButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    setError(null);
    setPending(true);
    try {
      const result = await leaveGuildAction();
      if (result.status === "error") {
        setError(result.message ?? "The System refused that request.");
        return;
      }
      router.push("/guilds");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={cn("btn btn-ghost px-2.5 py-1 text-[0.62rem] text-ember", compact && "px-2 py-0.5")}
        >
          <DoorOpen size={11} aria-hidden /> Leave
        </button>
        {error ? <span className="text-[0.6rem] text-ember">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <span className="text-[0.6rem] text-muted">Leave the guild?</span>
      <button
        type="button"
        onClick={() => void leave()}
        disabled={pending}
        className="btn px-2 py-0.5 text-[0.6rem]"
        style={{ background: "rgba(255,107,107,0.16)", color: "var(--color-ember)" }}
      >
        {pending ? <Loader2 size={10} className="animate-spin" aria-hidden /> : null} Confirm
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="btn btn-ghost px-2 py-0.5 text-[0.6rem]">
        Cancel
      </button>
    </div>
  );
}

/* -------------------------------------------------------- member controls -- */

export function GuildMemberControls({
  userId,
  role,
  myRole,
}: {
  userId: string;
  role: "leader" | "officer" | "member";
  myRole: "leader" | "officer" | "member";
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<null | "promote" | "demote" | "remove">(null);
  const [error, setError] = useState<string | null>(null);

  const canManage = myRole === "leader" || (myRole === "officer" && role === "member");
  if (!canManage || role === "leader") return null;

  async function run(kind: "promote" | "demote" | "remove") {
    setError(null);
    setBusy(kind);
    try {
      const result =
        kind === "remove"
          ? await removeGuildMemberAction(userId)
          : await setGuildRoleAction(userId, kind === "promote" ? "officer" : "member");
      if (result.status === "error") setError(result.message ?? "The System refused that request.");
      else startTransition(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {myRole === "leader" ? (
        role === "officer" ? (
          <button
            type="button"
            onClick={() => void run("demote")}
            disabled={busy !== null}
            className="btn btn-ghost px-2 py-0.5 text-[0.58rem]"
          >
            {busy === "demote" ? <Loader2 size={10} className="animate-spin" aria-hidden /> : null} Demote
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void run("promote")}
            disabled={busy !== null}
            className="btn btn-ghost px-2 py-0.5 text-[0.58rem]"
          >
            {busy === "promote" ? <Loader2 size={10} className="animate-spin" aria-hidden /> : <Shield size={10} aria-hidden />}
            Promote
          </button>
        )
      ) : null}
      <button
        type="button"
        onClick={() => void run("remove")}
        disabled={busy !== null}
        className="btn btn-ghost px-2 py-0.5 text-[0.58rem] text-ember"
      >
        {busy === "remove" ? <Loader2 size={10} className="animate-spin" aria-hidden /> : <UserMinus size={10} aria-hidden />}
        Remove
      </button>
      {error ? <span className="text-[0.58rem] text-ember">{error}</span> : null}
    </div>
  );
}

/* --------------------------------------------------------- guild settings -- */

export function GuildSettingsForm({
  isOpen,
  color,
  description,
}: {
  isOpen: boolean;
  color: string;
  description: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateGuildAction, INITIAL);
  const [nextColor, setNextColor] = useState(color);

  return (
    <form action={formAction} className="mt-3 space-y-3">
      <div>
        <label htmlFor="guild-description" className="hud-label mb-1.5 block">
          Creed
        </label>
        <textarea
          id="guild-description"
          name="description"
          rows={2}
          maxLength={280}
          defaultValue={description ?? ""}
          className="field resize-none"
        />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="guild-color" className="hud-label mb-1.5 block">
            Emblem
          </label>
          <input
            id="guild-color"
            name="color"
            type="color"
            value={nextColor}
            onChange={(event) => setNextColor(event.target.value)}
            className="h-8 w-16 cursor-pointer rounded-md border border-line/60 bg-black/30 p-0.5"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            name="isOpen"
            defaultChecked={isOpen}
            className="h-4 w-4 accent-[var(--color-cyan)]"
          />
          Open to new members
        </label>
      </div>

      {state.status === "error" && state.message ? (
        <p className="text-[0.68rem] text-ember">{state.message}</p>
      ) : null}
      {state.status === "success" ? (
        <p className="flex items-center gap-1.5 text-[0.68rem] text-mint">
          <Check size={12} aria-hidden /> {state.message}
        </p>
      ) : null}

      <button type="submit" className="btn px-3 py-1.5 text-xs" disabled={pending}>
        {pending ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Save size={12} aria-hidden />}
        Save guild record
      </button>
    </form>
  );
}

/* ---------------------------------------------------------- dissolve hint -- */

export function GuildDangerNote() {
  return (
    <p className="mt-3 flex items-start gap-2 rounded-lg border border-ember/25 bg-ember/[0.06] px-3 py-2 text-[0.66rem] leading-relaxed text-muted">
      <Trash2 size={12} className="mt-0.5 shrink-0 text-ember" aria-hidden />
      <span>
        Leaving as the last member dissolves the guild permanently. As leader you hand leadership to the
        longest-serving officer instead.{" "}
        <Link href="/guilds" className="text-cyan hover:underline">
          Back to the registry
        </Link>
      </span>
    </p>
  );
}
