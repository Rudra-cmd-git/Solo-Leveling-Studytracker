import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { ConfigNotice } from "@/components/auth/config-notice";
import { isSupabaseConfigured } from "@/lib/supabase/env";

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

  return (
    <AuthShell
      eyebrow="[SYSTEM] IDENTITY CHECK"
      title="Welcome back, Hunter."
      subtitle="Authenticate to reopen your status window, resume your streak and continue toward the next rank."
    >
      {isSupabaseConfigured ? null : <ConfigNotice />}
      {params.error === "profile_missing" ? (
        <p className="mb-4 rounded-lg border border-ember/35 bg-ember/10 px-3 py-2.5 text-xs text-ember">
          That account has no Hunter record. Try signing up again or contact the operator.
        </p>
      ) : null}
      <LoginForm next={next} />
    </AuthShell>
  );
}
