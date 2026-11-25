import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, History as HistoryIcon, Timer } from "lucide-react";
import { requireHunter } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SetupNotice } from "@/components/app/setup-notice";
import { getHistory, getHistoryCount } from "@/lib/data/hunter";
import { Panel, PanelHeader } from "@/components/system/panel";
import { formatDateTime, formatMinutes } from "@/lib/format";
import { SESSION_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "History" };

const PAGE_SIZE = 20;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  if (!isSupabaseConfigured) return <SetupNotice />;
  await requireHunter();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const [rows, total] = await Promise.all([getHistory(PAGE_SIZE, (page - 1) * PAGE_SIZE), getHistoryCount()]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const minutes = rows.reduce((sum, row) => sum + (row.credited_minutes ?? 0), 0);
  const xp = rows.reduce((sum, row) => sum + row.xp_awarded, 0);

  return (
    <div className="space-y-4">
      <Panel glow className="p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="hud-label" style={{ color: "var(--color-cyan)" }}>
              [SESSION LOG]
            </p>
            <h1 className="font-hud mt-1.5 text-base text-text">{total} recorded sessions</h1>
            <p className="mt-1 text-xs text-muted">Every entry is immutable once completed, and audited in your XP ledger.</p>
          </div>
          <div className="flex gap-2">
            <div className="rounded-lg border border-line/60 bg-white/[0.02] px-3 py-1.5">
              <p className="hud-label">This page</p>
              <p className="numeric text-sm text-text">{formatMinutes(minutes)}</p>
            </div>
            <div className="rounded-lg border border-line/60 bg-white/[0.02] px-3 py-1.5">
              <p className="hud-label">XP</p>
              <p className="numeric text-sm text-cyan">{xp}</p>
            </div>
          </div>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader
          title="Records"
          subtitle={`Page ${page} of ${pageCount}`}
          icon={<HistoryIcon size={14} />}
          action={
            <Link href="/study" className="btn btn-ghost px-2.5 py-1 text-[0.62rem]">
              <Timer size={11} aria-hidden /> New session
            </Link>
          }
        />

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
            <Timer size={22} className="text-faint" aria-hidden />
            <p className="text-sm text-muted">Nothing recorded yet.</p>
            <Link href="/study" className="btn btn-primary mt-1 px-3 py-1.5 text-xs">
              Run your first session
            </Link>
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <thead>
                <tr className="border-y border-line/50 text-left">
                  {["When", "Subject", "Topic", "Duration", "XP", "Status"].map((heading) => (
                    <th key={heading} className="hud-label px-3 py-2 font-normal">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-line/30 transition-colors hover:bg-white/[0.02]">
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted">{formatDateTime(row.started_at)}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: row.subject_color ?? "var(--color-azure)" }}
                          aria-hidden
                        />
                        <span className="text-xs text-text">{row.subject_title ?? "General"}</span>
                      </span>
                    </td>
                    <td className="max-w-[14rem] truncate px-3 py-2.5 text-xs text-faint">{row.topic_title ?? "—"}</td>
                    <td className="numeric whitespace-nowrap px-3 py-2.5 text-xs text-text">
                      {row.credited_minutes != null ? formatMinutes(row.credited_minutes) : "—"}
                      {row.is_revision ? <span className="ml-1 text-[0.58rem] text-violet">REV</span> : null}
                    </td>
                    <td className="numeric px-3 py-2.5 text-xs text-cyan">+{row.xp_awarded}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-[0.58rem] uppercase tracking-[0.12em]",
                          row.status === "completed"
                            ? "border-mint/30 text-mint"
                            : row.status === "cancelled"
                              ? "border-ember/30 text-ember"
                              : "border-line/60 text-faint",
                        )}
                      >
                        {SESSION_STATUS_LABEL[row.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pageCount > 1 ? (
          <div className="flex items-center justify-between border-t border-line/50 px-3 py-2.5">
            {page > 1 ? (
              <Link href={`/history?page=${page - 1}`} className="btn btn-ghost px-2.5 py-1 text-[0.62rem]">
                <ChevronLeft size={11} aria-hidden /> Previous
              </Link>
            ) : (
              <span />
            )}
            <span className="numeric text-[0.62rem] text-faint">
              {page} / {pageCount}
            </span>
            {page < pageCount ? (
              <Link href={`/history?page=${page + 1}`} className="btn btn-ghost px-2.5 py-1 text-[0.62rem]">
                Next <ChevronRight size={11} aria-hidden />
              </Link>
            ) : (
              <span />
            )}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
