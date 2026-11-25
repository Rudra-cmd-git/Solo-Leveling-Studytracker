"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Check,
  Flame,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Square,
  Target,
  Timer as TimerIcon,
  TriangleAlert,
  Zap,
} from "lucide-react";
import {
  cancelSessionAction,
  completeSessionAction,
  heartbeatSessionAction,
  pauseSessionAction,
  resumeSessionAction,
  startSessionAction,
} from "@/app/actions/study";
import { eventsFromCompletion, useSystemEvents } from "@/components/system/system-events";
import { Panel } from "@/components/system/panel";
import { RankBadge } from "@/components/system/rank-badge";
import { StatBar } from "@/components/system/meter";
import type { SessionCompletion, StudySession } from "@/lib/types";
import { formatClock, formatMinutes, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface FocusSubject {
  id: string;
  title: string;
  color: string;
  topics: Array<{ id: string; title: string }>;
}

type Phase = "idle" | "running" | "paused" | "finished";

const PRESETS = [15, 25, 45, 60, 90, 120];
const HEARTBEAT_MS = 20_000;

function newToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  throw new Error("This browser cannot generate a session token.");
}

export function FocusRunner({
  subjects,
  activeSession,
  dailyXpToday,
  dailyXpCap,
}: {
  subjects: FocusSubject[];
  activeSession: StudySession | null;
  dailyXpToday: number;
  dailyXpCap: number;
}) {
  const router = useRouter();
  const { push, pushAll } = useSystemEvents();

  const [session, setSession] = useState<StudySession | null>(activeSession);
  const [phase, setPhase] = useState<Phase>(() => {
    if (!activeSession) return "idle";
    return activeSession.status === "paused" ? "paused" : "running";
  });
  const [baseline, setBaseline] = useState(0);
  const [ticks, setTicks] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<SessionCompletion | null>(null);
  const [pending, startTransition] = useTransition();
  const syncing = useRef(false);

  const elapsed = baseline + (phase === "running" ? ticks : 0);
  const planned = session?.planned_seconds ?? 0;
  const targetReached = planned > 0 && elapsed >= planned;
  const projectedXp = Math.max(0, Math.min(Math.floor(elapsed / 60), Math.max(0, dailyXpCap - dailyXpToday)));

  // --- ticking clock -------------------------------------------------------
  useEffect(() => {
    if (phase !== "running") return;
    const timer = window.setInterval(() => setTicks((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const sync = useCallback(
    async (sessionId: string) => {
      if (syncing.current) return;
      syncing.current = true;
      try {
        const result = await heartbeatSessionAction(sessionId);
        if (result.ok) {
          setBaseline(result.data.creditedSeconds);
          setTicks(0);
          if (result.data.status === "paused") setPhase("paused");
          if (result.data.status === "completed" || result.data.status === "cancelled") {
            setPhase("finished");
          }
        } else if (result.error.includes("no longer exists") || result.error.includes("not active")) {
          setPhase("finished");
        }
      } finally {
        syncing.current = false;
      }
    },
    [],
  );

  // Recover the authoritative credited time for a session restored from the DB.
  useEffect(() => {
    if (!activeSession) return;
    void sync(activeSession.id);
  }, [activeSession, sync]);

  // --- heartbeat -----------------------------------------------------------
  useEffect(() => {
    if (phase !== "running" || !session) return;
    const timer = window.setInterval(() => void sync(session.id), HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [phase, session, sync]);

  useEffect(() => {
    if (phase !== "running" || !session) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void sync(session.id);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [phase, session, sync]);

  // --- actions -------------------------------------------------------------
  const begin = (input: {
    plannedMinutes: number;
    subjectId: string | null;
    topicId: string | null;
    isRevision: boolean;
    note: string;
  }) => {
    setError(null);
    startTransition(async () => {
      const result = await startSessionAction({
        plannedSeconds: input.plannedMinutes * 60,
        clientToken: newToken(),
        subjectId: input.subjectId,
        topicId: input.topicId,
        isRevision: input.isRevision,
        note: input.note || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        push({ kind: "error", title: "SESSION BLOCKED", message: result.error });
        return;
      }
      setSession(result.data);
      setBaseline(0);
      setTicks(0);
      setCompletion(null);
      setPhase("running");
      push({
        kind: "info",
        title: "SESSION STARTED",
        message: `${formatMinutes(input.plannedMinutes)} target locked in. Focus, Hunter.`,
      });
      router.refresh();
    });
  };

  const pause = () => {
    if (!session) return;
    setError(null);
    startTransition(async () => {
      const result = await pauseSessionAction(session.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBaseline(result.data.creditedSeconds);
      setTicks(0);
      setPhase("paused");
    });
  };

  const resume = () => {
    if (!session) return;
    setError(null);
    startTransition(async () => {
      const result = await resumeSessionAction(session.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBaseline(result.data.creditedSeconds);
      setTicks(0);
      setPhase("running");
    });
  };

  const finish = () => {
    if (!session) return;
    setError(null);
    startTransition(async () => {
      const result = await completeSessionAction(session.id);
      if (!result.ok) {
        setError(result.error);
        push({ kind: "error", title: "COMPLETION FAILED", message: result.error });
        return;
      }
      const payload = result.data;
      setBaseline(payload.credited_seconds);
      setTicks(0);
      setCompletion(payload);
      setPhase("finished");
      setSession(null);
      if (!payload.already_completed) pushAll(eventsFromCompletion(payload));
      router.refresh();
    });
  };

  const discard = () => {
    if (!session) return;
    startTransition(async () => {
      const result = await cancelSessionAction(session.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSession(null);
      setPhase("idle");
      setBaseline(0);
      setTicks(0);
      push({ kind: "info", title: "SESSION ABANDONED", message: "No XP was awarded for this session." });
      router.refresh();
    });
  };

  const reset = () => {
    setCompletion(null);
    setSession(null);
    setPhase("idle");
    setBaseline(0);
    setTicks(0);
  };

  if (phase === "finished") {
    return <CompletionPanel completion={completion} onReset={reset} />;
  }

  if (phase === "idle") {
    return (
      <SessionSetup
        subjects={subjects}
        pending={pending}
        error={error}
        dailyXpToday={dailyXpToday}
        dailyXpCap={dailyXpCap}
        onStart={begin}
      />
    );
  }

  const percent = planned > 0 ? Math.min(100, (elapsed / planned) * 100) : 0;
  const activeSubject = subjects.find((subject) => subject.id === session?.subject_id);

  return (
    <Panel glow className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-line/60 px-4 py-2.5">
        <span className="hud-label" style={{ color: "var(--color-cyan)" }}>
          [SYSTEM] FOCUS SESSION
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[0.58rem] uppercase tracking-[0.18em]",
            phase === "running" ? "bg-mint/12 text-mint" : "bg-gold/12 text-gold",
          )}
        >
          <span
            className={cn("h-1.5 w-1.5 rounded-full", phase === "running" ? "animate-pulse-glow bg-mint" : "bg-gold")}
            aria-hidden
          />
          {phase === "running" ? "Recording" : "Paused"}
        </span>
      </div>

      <div className="px-4 py-7 text-center sm:px-8 sm:py-9">
        <p
          className="numeric text-[3.4rem] font-semibold leading-none tracking-tight text-text sm:text-[4.6rem]"
          style={{ textShadow: "0 0 40px rgba(56,225,255,0.35)" }}
          aria-live="polite"
          aria-label={`Elapsed ${Math.floor(elapsed / 60)} minutes ${elapsed % 60} seconds`}
        >
          {formatClock(elapsed)}
        </p>

        <div className="mx-auto mt-5 max-w-md">
          <StatBar
            value={elapsed}
            max={Math.max(planned, 1)}
            height="md"
            label={`Target ${formatMinutes(Math.round(planned / 60))}`}
            rightLabel={`${Math.round(percent)}%`}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[0.68rem] text-faint">
          {activeSubject ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-line/60 bg-white/[0.03] px-2 py-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: activeSubject.color }} aria-hidden />
              {activeSubject.title}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5 rounded-md border border-cyan/25 bg-cyan/8 px-2 py-1 text-cyan">
            <Zap size={11} aria-hidden /> {projectedXp} XP earned so far
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-line/60 bg-white/[0.03] px-2 py-1">
            <TimerIcon size={11} aria-hidden /> {formatMinutes(Math.floor(elapsed / 60))} credited
          </span>
        </div>

        {targetReached ? (
          <p className="mx-auto mt-4 max-w-sm rounded-lg border border-mint/35 bg-mint/10 px-3 py-2 text-xs text-mint">
            Target reached. Claim your XP, or keep going — every extra minute still counts.
          </p>
        ) : null}

        {error ? (
          <p className="mx-auto mt-4 flex max-w-sm items-start justify-center gap-2 rounded-lg border border-ember/35 bg-ember/10 px-3 py-2 text-xs text-ember">
            <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden /> {error}
          </p>
        ) : null}

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          {phase === "running" ? (
            <button type="button" onClick={pause} disabled={pending} className="btn btn-ghost px-4 py-2.5">
              {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Pause size={14} aria-hidden />}
              Pause
            </button>
          ) : (
            <button type="button" onClick={resume} disabled={pending} className="btn btn-ghost px-4 py-2.5">
              {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Play size={14} aria-hidden />}
              Resume
            </button>
          )}

          <button
            type="button"
            onClick={finish}
            disabled={pending || elapsed < 60}
            className={cn("btn btn-primary px-5 py-2.5", targetReached && "animate-pulse-glow")}
            title={elapsed < 60 ? "At least one credited minute is required" : undefined}
          >
            {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Square size={13} aria-hidden />}
            Complete session
          </button>

          <button type="button" onClick={discard} disabled={pending} className="btn btn-ghost px-3.5 py-2.5 text-ember/90">
            Discard
          </button>
        </div>

        {elapsed < 60 ? (
          <p className="mt-3 text-[0.62rem] uppercase tracking-[0.18em] text-faint">
            Minimum one minute of focus is required to record a session
          </p>
        ) : null}
        <p className="mt-4 text-[0.6rem] uppercase tracking-[0.16em] text-faint/70">
          Time is verified against server heartbeats — closing the tab pauses earning
        </p>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
function SessionSetup({
  subjects,
  pending,
  error,
  dailyXpToday,
  dailyXpCap,
  onStart,
}: {
  subjects: FocusSubject[];
  pending: boolean;
  error: string | null;
  dailyXpToday: number;
  dailyXpCap: number;
  onStart: (input: {
    plannedMinutes: number;
    subjectId: string | null;
    topicId: string | null;
    isRevision: boolean;
    note: string;
  }) => void;
}) {
  const [minutes, setMinutes] = useState(25);
  const [subjectId, setSubjectId] = useState<string>(subjects[0]?.id ?? "");
  const [topicId, setTopicId] = useState<string>("");
  const [isRevision, setIsRevision] = useState(false);
  const [note, setNote] = useState("");

  const topics = useMemo(
    () => subjects.find((subject) => subject.id === subjectId)?.topics ?? [],
    [subjects, subjectId],
  );
  const capLeft = Math.max(0, dailyXpCap - dailyXpToday);

  if (subjects.length === 0) {
    return (
      <Panel glow className="p-6 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg border border-cyan/25 bg-cyan/8 text-cyan">
          <BookOpen size={18} aria-hidden />
        </span>
        <h2 className="font-hud mt-3 text-sm text-text">No subjects registered</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-xs text-muted">
          The System cannot record a session without a field of study. Create your first subject to begin.
        </p>
        <Link href="/subjects" className="btn btn-primary mt-4 px-4 py-2 text-sm">
          Create a subject <ArrowRight size={14} aria-hidden />
        </Link>
      </Panel>
    );
  }

  return (
    <Panel glow className="overflow-hidden p-0">
      <div className="border-b border-line/60 px-4 py-2.5">
        <span className="hud-label" style={{ color: "var(--color-cyan)" }}>
          [SYSTEM] SESSION SETUP
        </span>
      </div>

      <form
        className="space-y-5 p-4 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          onStart({
            plannedMinutes: minutes,
            subjectId: subjectId || null,
            topicId: topicId || null,
            isRevision,
            note,
          });
        }}
      >
        <div>
          <p className="hud-label mb-2">Target duration</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setMinutes(preset)}
                className={cn(
                  "rounded-lg border px-2 py-2.5 text-center transition-all",
                  minutes === preset
                    ? "border-cyan/60 bg-cyan/12 text-text shadow-[0_0_20px_-8px_rgba(56,225,255,0.9)]"
                    : "border-line/60 bg-white/[0.02] text-muted hover:border-cyan/30 hover:text-text",
                )}
                aria-pressed={minutes === preset}
              >
                <span className="numeric block text-sm">{preset}</span>
                <span className="block text-[0.55rem] uppercase tracking-[0.16em] text-faint">min</span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <label htmlFor="custom-minutes" className="text-[0.62rem] uppercase tracking-[0.16em] text-faint">
              Custom
            </label>
            <input
              id="custom-minutes"
              type="number"
              min={1}
              max={360}
              value={minutes}
              onChange={(event) => setMinutes(Math.max(1, Math.min(360, Number(event.target.value) || 1)))}
              className="field !w-24 !py-1.5 text-center"
            />
            <span className="text-[0.62rem] text-faint">minutes · {minutes} XP possible</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="subject" className="hud-label mb-1.5 block">
              Subject
            </label>
            <select
              id="subject"
              className="field"
              value={subjectId}
              onChange={(event) => {
                setSubjectId(event.target.value);
                setTopicId("");
              }}
            >
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="topic" className="hud-label mb-1.5 block">
              Topic (optional)
            </label>
            <select
              id="topic"
              className="field"
              value={topicId}
              onChange={(event) => setTopicId(event.target.value)}
              disabled={topics.length === 0}
            >
              <option value="">{topics.length === 0 ? "No topics yet" : "Unassigned"}</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="note" className="hud-label mb-1.5 block">
            Intent (optional)
          </label>
          <input
            id="note"
            type="text"
            maxLength={280}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What will you clear in this session?"
            className="field"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={isRevision}
            onChange={(event) => setIsRevision(event.target.checked)}
            className="h-4 w-4 accent-[var(--color-cyan)]"
          />
          Mark as revision session
        </label>

        {capLeft === 0 ? (
          <p className="rounded-lg border border-gold/35 bg-gold/10 px-3 py-2 text-xs text-gold">
            Today&apos;s XP cap is reached. Your session will still be recorded, but extra XP is paused until tomorrow.
          </p>
        ) : null}

        {error ? (
          <p className="flex items-start gap-2 rounded-lg border border-ember/35 bg-ember/10 px-3 py-2 text-xs text-ember">
            <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden /> {error}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary w-full py-2.5" disabled={pending}>
          {pending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Flame size={15} aria-hidden />}
          {pending ? "Initialising…" : "Begin focus session"}
        </button>
      </form>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
function CompletionPanel({
  completion,
  onReset,
}: {
  completion: SessionCompletion | null;
  onReset: () => void;
}) {
  if (!completion) {
    return (
      <Panel glow className="p-6 text-center">
        <Check size={20} className="mx-auto text-mint" aria-hidden />
        <p className="font-hud mt-3 text-sm text-text">This session is already closed.</p>
        <p className="mt-1 text-xs text-muted">Open your history to review what was recorded.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link href="/history" className="btn btn-primary px-4 py-2 text-sm">
            View history
          </Link>
          <button type="button" onClick={onReset} className="btn btn-ghost px-4 py-2 text-sm">
            <RotateCcw size={13} aria-hidden /> New session
          </button>
        </div>
      </Panel>
    );
  }

  const { credited_minutes, xp_awarded, level, rank, level_up, rank_up, rank_before, streak } = completion;
  const quests = completion.completed_quests ?? [];
  const achievements = completion.unlocked_achievements ?? [];

  return (
    <Panel glow className="overflow-hidden p-0">
      <div className="border-b border-line/60 px-4 py-2.5">
        <span className="hud-label" style={{ color: "var(--color-mint)" }}>
          [SYSTEM] SESSION COMPLETE
        </span>
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="numeric text-3xl text-text glow-text">
              +{formatNumber(xp_awarded)} <span className="text-base text-cyan">XP</span>
            </p>
            <p className="mt-1 text-xs text-muted">
              {formatMinutes(credited_minutes)} of verified focus recorded
              {completion.capped ? " · daily XP cap applied" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-line/60 bg-white/[0.03] px-2.5 py-1.5 text-center">
              <span className="hud-label block">Level</span>
              <span className="numeric text-sm text-text">{String(level).padStart(2, "0")}</span>
            </span>
            <RankBadge rank={rank} size="lg" showName />
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-line/60 bg-white/[0.02] px-3 py-2.5">
            <p className="hud-label">Streak</p>
            <p className="numeric mt-1 text-lg text-gold">{streak} day{streak === 1 ? "" : "s"}</p>
          </div>
          <div className="rounded-lg border border-line/60 bg-white/[0.02] px-3 py-2.5">
            <p className="hud-label">Quests cleared</p>
            <p className="numeric mt-1 text-lg text-violet">{quests.length}</p>
          </div>
          <div className="rounded-lg border border-line/60 bg-white/[0.02] px-3 py-2.5">
            <p className="hud-label">Achievements</p>
            <p className="numeric mt-1 text-lg text-cyan">{achievements.length}</p>
          </div>
        </div>

        {level_up || rank_up ? (
          <div className="mt-3 rounded-lg border border-gold/35 bg-gold/10 px-3 py-2.5 text-xs text-gold">
            {rank_up && rank_before
              ? `RANK ADVANCEMENT DETECTED — ${rank_before}-Rank → ${rank}-Rank. Congratulations, Hunter.`
              : "LEVEL PROGRESSION AVAILABLE — the System has recorded your growth."}
          </div>
        ) : null}

        {quests.length > 0 ? (
          <ul className="mt-4 space-y-1.5">
            {quests.map((quest) => (
              <li
                key={quest.id}
                className="flex items-center gap-2 rounded-lg border border-violet/25 bg-violet/8 px-3 py-2 text-xs"
              >
                <Target size={13} className="text-violet" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-text">{quest.title}</span>
                <span className="numeric text-cyan">+{quest.reward_xp} XP</span>
              </li>
            ))}
          </ul>
        ) : null}

        {achievements.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {achievements.map((achievement) => (
              <li
                key={achievement.code}
                className="flex items-center gap-2 rounded-lg border border-cyan/25 bg-cyan/8 px-3 py-2 text-xs"
              >
                <Check size={13} className="text-cyan" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-text">{achievement.name}</span>
                <span className="numeric text-cyan">+{achievement.reward_xp} XP</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link href="/dashboard" className="btn btn-primary px-4 py-2.5 text-sm">
            Status window <ArrowRight size={13} aria-hidden />
          </Link>
          <button type="button" onClick={onReset} className="btn btn-ghost px-4 py-2.5 text-sm">
            <RotateCcw size={13} aria-hidden /> Run another
          </button>
        </div>
      </div>
    </Panel>
  );
}
