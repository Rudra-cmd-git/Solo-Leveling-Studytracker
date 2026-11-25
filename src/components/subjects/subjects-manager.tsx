"use client";

import { useActionState, useState, useTransition } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Trash2,
  TriangleAlert,
  Layers,
} from "lucide-react";
import {
  createSubjectAction,
  createTopicAction,
  deleteSubjectAction,
  deleteTopicAction,
  renameSubjectAction,
  setTopicStatusAction,
  type SubjectState,
} from "@/app/actions/subjects";
import { Panel } from "@/components/system/panel";
import { StatBar } from "@/components/system/meter";
import type { SubjectWithTopics } from "@/lib/data/hunter";
import type { SubjectSummaryRow } from "@/lib/data/hunter";
import { formatMinutes } from "@/lib/format";
import { TOPIC_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

const INITIAL: SubjectState = { status: "idle" };

const PALETTE = [
  "#38e1ff",
  "#3b7dff",
  "#a06bff",
  "#ff6fb5",
  "#f5c451",
  "#5ef2b0",
  "#ff8a5b",
  "#7c8cff",
];

const STATUS_TONE: Record<string, string> = {
  not_started: "text-faint border-line/60",
  learning: "text-cyan border-cyan/30",
  revised: "text-violet border-violet/30",
  mastered: "text-mint border-mint/30",
};

export function SubjectCreateForm() {
  const [state, formAction, pending] = useActionState(createSubjectAction, INITIAL);
  const [color, setColor] = useState(PALETTE[0]);

  return (
    <Panel glow className="p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-hud text-[0.78rem] text-cyan/90">Register a subject</p>
          <p className="mt-0.5 text-xs text-faint">Anything you study: a subject, a project, a language.</p>
        </div>
        <Layers size={16} className="text-cyan/60" aria-hidden />
      </div>

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="color" value={color} />

        <div className="grid gap-3 sm:grid-cols-[1.6fr_0.8fr]">
          <div>
            <label htmlFor="subject-title" className="hud-label mb-1.5 block">
              Name
            </label>
            <input
              id="subject-title"
              name="title"
              required
              maxLength={60}
              placeholder="Organic Chemistry"
              className={cn("field", state.fields?.title && "field-invalid")}
            />
            {state.fields?.title ? <p className="mt-1 text-[0.68rem] text-ember">{state.fields.title}</p> : null}
          </div>
          <div>
            <label htmlFor="subject-target" className="hud-label mb-1.5 block">
              Weekly target (min)
            </label>
            <input
              id="subject-target"
              name="targetMinutesPerWeek"
              type="number"
              min={0}
              max={10080}
              placeholder="300"
              className="field"
            />
          </div>
        </div>

        <div>
          <p className="hud-label mb-1.5">Colour tag</p>
          <div className="flex flex-wrap gap-1.5">
            {PALETTE.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => setColor(swatch)}
                className={cn(
                  "h-6 w-6 rounded-md border transition-transform",
                  color === swatch ? "scale-110 border-white/70" : "border-white/10 hover:scale-105",
                )}
                style={{ background: swatch }}
                aria-label={`Use colour ${swatch}`}
                aria-pressed={color === swatch}
              />
            ))}
          </div>
        </div>

        {state.status === "error" && state.message && !state.fields?.title ? (
          <p className="flex items-start gap-2 rounded-lg border border-ember/35 bg-ember/10 px-3 py-2 text-xs text-ember">
            <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden /> {state.message}
          </p>
        ) : null}
        {state.status === "success" ? (
          <p className="rounded-lg border border-mint/35 bg-mint/10 px-3 py-2 text-xs text-mint">{state.message}</p>
        ) : null}

        <button type="submit" className="btn btn-primary w-full py-2 text-sm" disabled={pending}>
          {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Plus size={14} aria-hidden />}
          {pending ? "Registering…" : "Register subject"}
        </button>
      </form>
    </Panel>
  );
}

export function SubjectCard({
  subject,
  summary,
}: {
  subject: SubjectWithTopics;
  summary?: SubjectSummaryRow;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(subject.title);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<SubjectState>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.status === "error") setError(result.message ?? "That did not work.");
    });
  };

  const weeklyTarget = subject.target_minutes_per_week ?? 0;
  const weeklyMinutes = summary?.minutes_week ?? 0;

  return (
    <div className="rounded-xl border border-line/60 bg-white/[0.02]">
      <div className="flex items-center gap-3 p-3">
        <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: subject.color }} aria-hidden />

        <div className="min-w-0 flex-1">
          {renaming ? (
            <form
              className="flex items-center gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                run(async () => {
                  const result = await renameSubjectAction(subject.id, title);
                  if (result.status === "success") setRenaming(false);
                  return result;
                });
              }}
            >
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="field !py-1 text-xs"
                maxLength={60}
                autoFocus
              />
              <button type="submit" className="btn btn-ghost h-7 w-7 !px-0" aria-label="Save name" disabled={pending}>
                {pending ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Check size={12} aria-hidden />}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="block max-w-full truncate text-left text-sm text-text hover:text-cyan"
              title="Rename subject"
            >
              {subject.title}
            </button>
          )}
          <p className="mt-0.5 text-[0.62rem] text-faint">
            {subject.topics.length} topic{subject.topics.length === 1 ? "" : "s"} ·{" "}
            {formatMinutes(summary?.minutes_total ?? 0)} total · {formatMinutes(weeklyMinutes)} this week
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="btn btn-ghost h-7 px-2 text-[0.6rem]"
          aria-expanded={open}
        >
          {open ? <ChevronUp size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />}
          {open ? "Hide" : "Open"}
        </button>
      </div>

      {weeklyTarget > 0 ? (
        <div className="px-3 pb-2">
          <StatBar
            value={weeklyMinutes}
            max={weeklyTarget}
            height="sm"
            rightLabel={`${formatMinutes(weeklyMinutes)} / ${formatMinutes(weeklyTarget)}`}
          />
        </div>
      ) : null}

      {error ? (
        <p className="mx-3 mb-2 flex items-start gap-1.5 rounded border border-ember/35 bg-ember/10 px-2 py-1.5 text-[0.68rem] text-ember">
          <TriangleAlert size={11} className="mt-0.5 shrink-0" aria-hidden /> {error}
        </p>
      ) : null}

      {open ? (
        <div className="border-t border-line/50 p-3">
          <TopicList subjectId={subject.id} topics={subject.topics} onError={setError} />

          <form
            className="mt-2 flex items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              data.set("subjectId", subject.id);
              run(async () => {
                const result = await createTopicAction(INITIAL, data);
                if (result.status === "success") form.reset();
                return result;
              });
            }}
          >
            <input
              name="title"
              required
              maxLength={120}
              placeholder="Add a topic…"
              className="field !py-1.5 text-xs"
              aria-label="New topic name"
            />
            <button type="submit" className="btn btn-ghost h-8 w-8 !px-0" aria-label="Add topic" disabled={pending}>
              {pending ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Plus size={12} aria-hidden />}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`Delete "${subject.title}"? Past sessions keep their recorded time.`)) return;
              run(() => deleteSubjectAction(subject.id));
            }}
            disabled={pending}
            className="mt-3 inline-flex items-center gap-1.5 text-[0.62rem] uppercase tracking-[0.14em] text-faint transition-colors hover:text-ember"
          >
            <Trash2 size={11} aria-hidden /> Delete subject
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TopicList({
  subjectId,
  topics,
  onError,
}: {
  subjectId: string;
  topics: SubjectWithTopics["topics"];
  onError: (message: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();

  if (topics.length === 0) {
    return <p className="text-[0.68rem] text-faint">No topics yet. Topics let you target chapters precisely.</p>;
  }

  return (
    <ul className="space-y-1">
      {topics.map((topic) => (
        <li key={topic.id} className="flex items-center gap-1.5 rounded-md border border-line/40 bg-black/20 px-2 py-1.5">
          <span className="min-w-0 flex-1 truncate text-[0.72rem] text-muted">{topic.title}</span>
          <select
            value={topic.status}
            onChange={(event) => {
              const status = event.target.value;
              startTransition(async () => {
                const result = await setTopicStatusAction(topic.id, status);
                if (result.status === "error") onError(result.message ?? "Could not update topic.");
              });
            }}
            className={cn(
              "rounded border bg-transparent px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.1em] outline-none",
              STATUS_TONE[topic.status],
            )}
            aria-label={`Status for ${topic.title}`}
            disabled={pending}
          >
            {Object.entries(TOPIC_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value} className="bg-[#0a1220] text-text">
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                const result = await deleteTopicAction(topic.id);
                if (result.status === "error") onError(result.message ?? "Could not delete topic.");
              })
            }
            className="text-faint transition-colors hover:text-ember"
            aria-label={`Delete ${topic.title}`}
            disabled={pending}
          >
            <Trash2 size={11} aria-hidden />
          </button>
          <span className="sr-only">{subjectId}</span>
        </li>
      ))}
    </ul>
  );
}
