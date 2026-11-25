/**
 * Shown above the sign-in and sign-up forms when the app is running without
 * Supabase credentials. Without it the form looks normal and only fails after
 * the visitor has typed everything in, which reads as "the form is broken".
 */
export function ConfigNotice() {
  return (
    <div className="mb-4 rounded-lg border border-ember/35 bg-ember/10 px-3 py-2.5 text-[0.7rem] leading-relaxed text-ember">
      <p className="font-hud text-[0.62rem] uppercase tracking-wide">[SYSTEM OFFLINE]</p>
      <p className="mt-1 text-muted">
        This server started without Supabase credentials, so registration and sign-in cannot work. Put{" "}
        <code className="text-ember">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="text-ember">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{" "}
        <code className="text-ember">.env.local</code>, then <strong>restart</strong> the dev server
        (<code className="text-ember">Ctrl+C</code>, then <code className="text-ember">npm run dev</code>). Environment
        variables are only read at startup.
      </p>
    </div>
  );
}
