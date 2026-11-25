import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { requireHunter } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SetupNotice } from "@/components/app/setup-notice";
import { getSubjectSummary, getSubjectsWithTopics } from "@/lib/data/hunter";
import { SubjectCard, SubjectCreateForm } from "@/components/subjects/subjects-manager";
import { Panel } from "@/components/system/panel";
import { formatMinutes } from "@/lib/format";

export const metadata: Metadata = { title: "Subjects" };

export default async function SubjectsPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  await requireHunter();

  const [subjects, summary] = await Promise.all([getSubjectsWithTopics(), getSubjectSummary()]);
  const byId = new Map(summary.map((row) => [row.subject_id, row]));
  const active = subjects.filter((subject) => !subject.archived);
  const totalMinutes = summary.reduce((sum, row) => sum + row.minutes_total, 0);
  const topicsTotal = active.reduce((sum, subject) => sum + subject.topics.length, 0);
  const mastered = active.reduce(
    (sum, subject) => sum + subject.topics.filter((topic) => topic.status === "mastered").length,
    0,
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          <SubjectCreateForm />

          <Panel quiet className="p-4">
            <p className="hud-label">Field summary</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[
                { label: "Subjects", value: String(subjects.length) },
                { label: "Topics", value: String(topicsTotal) },
                { label: "Mastered", value: String(mastered) },
                { label: "Recorded", value: formatMinutes(totalMinutes) },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-line/60 bg-white/[0.02] p-2.5">
                  <p className="hud-label">{item.label}</p>
                  <p className="numeric mt-1 text-sm text-text">{item.value}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[0.66rem] leading-relaxed text-faint">
              Topics you mark as mastered feed the System&apos;s revision quests and achievements.
            </p>
          </Panel>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-hud text-sm text-cyan/90">Your fields</h1>
              <p className="mt-0.5 text-xs text-faint">Tap a name to rename. Open a subject to manage topics.</p>
            </div>
            <Link href="/study" className="btn btn-ghost px-2.5 py-1 text-[0.62rem]">
              Focus <ArrowRight size={11} aria-hidden />
            </Link>
          </div>

          {active.length === 0 ? (
            <Panel className="p-8 text-center">
              <BookOpen size={20} className="mx-auto text-faint" aria-hidden />
              <p className="font-hud mt-3 text-sm text-text">No subjects yet</p>
              <p className="mx-auto mt-1 max-w-xs text-xs text-muted">
                Register your first subject to unlock session tracking, quests and analytics.
              </p>
            </Panel>
          ) : (
            <div className="space-y-2">
              {active.map((subject) => (
                <SubjectCard key={subject.id} subject={subject} summary={byId.get(subject.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
