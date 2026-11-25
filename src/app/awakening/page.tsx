import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireHunter } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { AwakeningCinematic } from "@/components/auth/awakening-cinematic";
import { SetupNotice } from "@/components/app/setup-notice";

export const metadata: Metadata = { title: "Awakening" };

export const dynamic = "force-dynamic";

export default async function AwakeningPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;

  const { profile } = await requireHunter();
  if (profile.awakened_at) redirect("/dashboard");

  return <AwakeningCinematic profile={profile} />;
}
