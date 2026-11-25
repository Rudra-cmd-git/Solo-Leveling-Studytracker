import Link from "next/link";
import { OctagonAlert, Terminal } from "lucide-react";
import { Panel, PanelHeader } from "@/components/system/panel";

/**
 * Shown instead of a crash when Supabase credentials are missing, so the owner
 * sees exactly what to do on first run.
 */
export function SetupNotice() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-4 py-16">
      <Panel glow className="p-6">
        <PanelHeader
          title="System offline"
          subtitle="The Hunter System has no database connection yet."
          icon={<OctagonAlert size={16} />}
        />
        <div className="mt-4 space-y-4 px-1 text-sm text-muted">
          <p>
            Add your Supabase project credentials to <code className="rounded bg-white/10 px-1.5 py-0.5 text-text">.env.local</code>{" "}
            and restart the dev server:
          </p>
          <pre className="overflow-x-auto rounded-lg border border-line/70 bg-black/50 p-3 text-xs text-cyan">
            {"NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>"}
          </pre>
          <p className="flex items-start gap-2 text-xs text-faint">
            <Terminal size={14} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              Then apply the SQL migrations in <code className="text-text">supabase/migrations</code> to that project. The
              README walks through it step by step.
            </span>
          </p>
          <Link href="/" className="btn btn-ghost px-3 py-2 text-xs">
            Back to landing page
          </Link>
        </div>
      </Panel>
    </div>
  );
}
