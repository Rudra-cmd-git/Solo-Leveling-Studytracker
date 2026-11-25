"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { refreshQuestsAction } from "@/app/actions/study";
import { useSystemEvents } from "@/components/system/system-events";

/** Re-runs quest evaluation server-side and narrates any new completions. */
export function QuestRefreshButton() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { push, pushAll } = useSystemEvents();

  return (
    <button
      type="button"
      className="btn btn-ghost px-2.5 py-1 text-[0.62rem]"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await refreshQuestsAction();
          if (!result.ok) {
            push({ kind: "error", title: "SYNC FAILED", message: result.error });
            return;
          }
          const { completed_quests, unlocked_achievements } = result.data;
          pushAll([
            ...(completed_quests ?? []).map((quest) => ({
              id: `quest-${quest.id}`,
              kind: "quest" as const,
              title: "QUEST COMPLETED",
              message: quest.title,
              xp: quest.reward_xp,
            })),
            ...(unlocked_achievements ?? []).map((achievement) => ({
              id: `ach-${achievement.code}`,
              kind: "achievement" as const,
              title: "ACHIEVEMENT UNLOCKED",
              message: achievement.name,
              detail: achievement.description,
              xp: achievement.reward_xp,
              rarity: achievement.rarity,
              icon: achievement.icon,
            })),
          ]);
          if ((completed_quests?.length ?? 0) === 0 && (unlocked_achievements?.length ?? 0) === 0) {
            push({ kind: "info", title: "SYNC COMPLETE", message: "Quest progress is up to date." });
          }
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 size={11} className="animate-spin" aria-hidden /> : <RefreshCw size={11} aria-hidden />}
      Sync
    </button>
  );
}
