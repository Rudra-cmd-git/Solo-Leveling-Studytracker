"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { describeDatabaseError, startSessionSchema } from "@/lib/validation";
import type { QuestRefreshResult, SessionCompletion, StudySession } from "@/lib/types";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function revalidateHunterSurfaces() {
  revalidatePath("/dashboard");
  revalidatePath("/quests");
  revalidatePath("/achievements");
  revalidatePath("/history");
  revalidatePath("/analytics");
  revalidatePath("/study");
  revalidatePath("/profile");
}

export async function startSessionAction(input: {
  plannedSeconds: number;
  clientToken: string;
  subjectId?: string | null;
  topicId?: string | null;
  isRevision?: boolean;
  note?: string;
}): Promise<ActionResult<StudySession>> {
  const parsed = startSessionSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "That session setup is not valid.");
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("start_study_session", {
    p_planned_seconds: parsed.data.plannedSeconds,
    p_client_token: parsed.data.clientToken,
    p_subject_id: parsed.data.subjectId ?? null,
    p_topic_id: parsed.data.topicId ?? null,
    p_is_revision: parsed.data.isRevision ?? false,
    p_note: parsed.data.note ?? null,
  });

  if (error) return fail(describeDatabaseError(error.message));

  const session = (data as { session: StudySession }).session;
  revalidatePath("/study");
  return { ok: true, data: session };
}

export async function heartbeatSessionAction(
  sessionId: string,
): Promise<ActionResult<{ status: string; live: boolean; creditedSeconds: number }>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("heartbeat_study_session", { p_session: sessionId });
  if (error) return fail(describeDatabaseError(error.message));

  const payload = data as { status: string; live: boolean; credited_seconds?: number };
  return {
    ok: true,
    data: {
      status: payload.status,
      live: payload.live,
      creditedSeconds: payload.credited_seconds ?? 0,
    },
  };
}

export async function pauseSessionAction(sessionId: string): Promise<ActionResult<{ creditedSeconds: number }>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("pause_study_session", { p_session: sessionId });
  if (error) return fail(describeDatabaseError(error.message));
  const payload = data as { credited_seconds?: number };
  return { ok: true, data: { creditedSeconds: payload.credited_seconds ?? 0 } };
}

export async function resumeSessionAction(sessionId: string): Promise<ActionResult<{ creditedSeconds: number }>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("resume_study_session", { p_session: sessionId });
  if (error) return fail(describeDatabaseError(error.message));
  const payload = data as { credited_seconds?: number };
  return { ok: true, data: { creditedSeconds: payload.credited_seconds ?? 0 } };
}

export async function cancelSessionAction(sessionId: string): Promise<ActionResult<null>> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("cancel_study_session", { p_session: sessionId });
  if (error) return fail(describeDatabaseError(error.message));
  revalidatePath("/study");
  return { ok: true, data: null };
}

export async function completeSessionAction(sessionId: string): Promise<ActionResult<SessionCompletion>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("complete_study_session", { p_session: sessionId });
  if (error) return fail(describeDatabaseError(error.message));

  revalidateHunterSurfaces();
  return { ok: true, data: data as SessionCompletion };
}

export async function refreshQuestsAction(): Promise<ActionResult<QuestRefreshResult>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("refresh_quests");
  if (error) return fail(describeDatabaseError(error.message));

  revalidatePath("/quests");
  revalidatePath("/achievements");
  revalidatePath("/dashboard");
  return { ok: true, data: data as QuestRefreshResult };
}
