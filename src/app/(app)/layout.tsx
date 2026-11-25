import { redirect } from "next/navigation";
import { requireHunter } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getNotifications, getUnreadNotificationCount } from "@/lib/data/hunter";
import { AppShell } from "@/components/app/app-shell";
import { SetupNotice } from "@/components/app/setup-notice";

export const dynamic = "force-dynamic";

export default async function HunterLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured) return <SetupNotice />;

  const { profile } = await requireHunter();
  if (!profile.awakened_at) redirect("/awakening");

  const [notifications, unread] = await Promise.all([
    getNotifications(8).catch(() => []),
    getUnreadNotificationCount().catch(() => 0),
  ]);

  return (
    <AppShell profile={profile} notifications={notifications} unread={unread}>
      {children}
    </AppShell>
  );
}
