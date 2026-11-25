import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { ConfigNotice } from "@/components/auth/config-notice";
import { isSupabaseConfigured, describeSupabaseConfig } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Return to your Hunter status window.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = params.next?.startsWith("/") ? params.next : undefined;

  const errors: Record<string, string> = {
    profile_missing: "That account has no Hunter record. Try signing up again or contact the operator.",
    link_expired: "That link has expired. Request a new one from the sign-in form.",
    oauth_unavailable:
      "Google sign-in is not configured on this project yet. Enable the Google provider in Supabase, or use email and password below.",
    not_configured: "The System is not configured. Add your Supabase keys to .env.local and restart the server.",
  };
  const errorMessage = params.error ? errors[params.error] : undefined;

  return (
    <AuthShell
      eyebrow="[SYSTEM] IDENTITY CHECK"
      title="Welcome back, Hunter."
      subtitle="Authenticate to reopen your status window, resume your streak and continue toward the next rank."
    >
      {isSupabaseConfigured ? null : <ConfigNotice {...describeSupabaseConfig()} />}
      {errorMessage ? (
        <p className="mb-4 rounded-lg border border-ember/35 bg-ember/10 px-3 py-2.5 text-xs text-ember">{errorMessage}</p>
      ) : null}
      <LoginForm next={next} />
    </AuthShell>
  );
}
