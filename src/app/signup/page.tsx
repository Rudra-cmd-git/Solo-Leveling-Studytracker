import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/signup-form";
import { ConfigNotice } from "@/components/auth/config-notice";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Awaken",
  description: "Register as a Hunter and begin your progression.",
};

export default function SignUpPage() {
  return (
    <AuthShell
      eyebrow="[SYSTEM] AWAKENING PROTOCOL"
      title="Begin your awakening."
      subtitle="Register to receive a Hunter ID. You will start at Level 1 and F-Rank, with nothing but your own focus to build on."
    >
      {isSupabaseConfigured ? null : <ConfigNotice />}
      <SignUpForm />
    </AuthShell>
  );
}
