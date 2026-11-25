import type { ConfigState } from "@/lib/supabase/env";

const LABEL: Record<ConfigState, string> = {
  set: "seen at build time",
  placeholder: "still the .env.example placeholder",
  missing: "missing",
};

function Row({ name, state }: { name: string; state: ConfigState }) {
  const ok = state === "set";
  return (
    <li className="flex flex-wrap items-baseline gap-x-2">
      <code className={ok ? "text-mint" : "text-ember"}>{name}</code>
      <span className={ok ? "text-mint" : "text-muted"}>— {LABEL[state]}</span>
    </li>
  );
}

/**
 * Shown above the sign-in and sign-up forms when the app is running without
 * Supabase credentials. It reports what this process saw, because on a host
 * like Vercel the NEXT_PUBLIC_* values are baked in when the bundle is built:
 * adding them in the dashboard does nothing until you redeploy.
 */
export function ConfigNotice({
  url,
  key,
  environment,
}: {
  url: ConfigState;
  key: ConfigState;
  environment: string;
}) {
  const isBuild = environment === "production";

  return (
    <div className="mb-4 rounded-lg border border-ember/35 bg-ember/10 px-3 py-3 text-[0.7rem] leading-relaxed text-muted">
      <p className="font-hud text-[0.62rem] uppercase tracking-wide text-ember">[SYSTEM OFFLINE]</p>
      <p className="mt-1">This build has no Supabase credentials, so registration and sign-in cannot work.</p>

      <ul className="mt-2 space-y-1">
        <Row name="NEXT_PUBLIC_SUPABASE_URL" state={url} />
        <Row name="NEXT_PUBLIC_SUPABASE_ANON_KEY" state={key} />
      </ul>

      <p className="mt-2 border-t border-ember/25 pt-2">
        {isBuild ? (
          <>
            On Vercel these variables are <strong className="text-ember">inlined when the bundle is built</strong>. Adding
            them in Settings does nothing to a deployment that already exists — open{" "}
            <strong className="text-ember">Deployments → ⋯ → Redeploy</strong> after saving them, and make sure they are
            ticked for the environment you are viewing (Production and Preview are separate).
          </>
        ) : (
          <>
            Put them in <code className="text-ember">.env.local</code> in the project root, then{" "}
            <strong className="text-ember">restart</strong> the dev server (<code>Ctrl+C</code>, then{" "}
            <code>npm run dev</code>). Environment variables are read only at startup.
          </>
        )}
      </p>
    </div>
  );
}
