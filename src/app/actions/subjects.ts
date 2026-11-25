"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { describeDatabaseError, subjectSchema, topicSchema, topicStatusSchema } from "@/lib/validation";

export type SubjectState = {
  status: "idle" | "error" | "success";
  message?: string;
  fields?: Record<string, string>;
};

function revalidateSubjectSurfaces() {
  revalidatePath("/subjects");
  revalidatePath("/study");
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
}

const DUPLICATE_TITLE = "You already have an item with that name.";

export async function createSubjectAction(_prev: SubjectState, formData: FormData): Promise<SubjectState> {
  const parsed = subjectSchema.safeParse({
    title: formData.get("title"),
    color: formData.get("color") ?? "#38bdf8",
    targetMinutesPerWeek: formData.get("targetMinutesPerWeek") || undefined,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join(".") || "form", i.message])),
    };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("subjects").insert({
    title: parsed.data.title,
    color: parsed.data.color,
    target_minutes_per_week: parsed.data.targetMinutesPerWeek ?? null,
  });

  if (error) {
    const message = error.code === "23505" ? DUPLICATE_TITLE : describeDatabaseError(error.message);
    return { status: "error", message, fields: { title: message } };
  }

  revalidateSubjectSurfaces();
  return { status: "success", message: "Subject registered." };
}

export async function renameSubjectAction(subjectId: string, title: string): Promise<SubjectState> {
  const parsed = subjectSchema.pick({ title: true }).safeParse({ title });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid name." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("subjects").update({ title: parsed.data.title }).eq("id", subjectId);

  if (error) {
    const message = error.code === "23505" ? DUPLICATE_TITLE : describeDatabaseError(error.message);
    return { status: "error", message };
  }

  revalidateSubjectSurfaces();
  return { status: "success", message: "Subject renamed." };
}

export async function setSubjectColorAction(subjectId: string, color: string): Promise<SubjectState> {
  const parsed = subjectSchema.pick({ color: true }).safeParse({ color });
  if (!parsed.success) return { status: "error", message: "Pick a valid colour." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("subjects").update({ color: parsed.data.color }).eq("id", subjectId);
  if (error) return { status: "error", message: describeDatabaseError(error.message) };

  revalidateSubjectSurfaces();
  return { status: "success", message: "Colour updated." };
}

export async function deleteSubjectAction(subjectId: string): Promise<SubjectState> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("subjects").delete().eq("id", subjectId);
  if (error) return { status: "error", message: describeDatabaseError(error.message) };

  revalidateSubjectSurfaces();
  return { status: "success", message: "Subject removed. Past sessions keep their credited time." };
}

export async function createTopicAction(_prev: SubjectState, formData: FormData): Promise<SubjectState> {
  const parsed = topicSchema.safeParse({
    subjectId: formData.get("subjectId"),
    title: formData.get("title"),
    status: formData.get("status") ?? "not_started",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join(".") || "form", i.message])),
    };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("topics").insert({
    subject_id: parsed.data.subjectId,
    title: parsed.data.title,
    status: parsed.data.status,
  });

  if (error) {
    const message = error.code === "23505" ? DUPLICATE_TITLE : describeDatabaseError(error.message);
    return { status: "error", message, fields: { title: message } };
  }

  revalidateSubjectSurfaces();
  return { status: "success", message: "Topic added." };
}

export async function setTopicStatusAction(topicId: string, status: string): Promise<SubjectState> {
  const parsed = topicStatusSchema.safeParse(status);
  if (!parsed.success) return { status: "error", message: "Unknown topic state." };

  const supabase = await createServerSupabase();
  const patch: Record<string, unknown> = { status: parsed.data };
  if (parsed.data === "revised" || parsed.data === "mastered") {
    patch.last_revised_at = new Date().toISOString();
  }

  const { error } = await supabase.from("topics").update(patch).eq("id", topicId);
  if (error) return { status: "error", message: describeDatabaseError(error.message) };

  revalidateSubjectSurfaces();
  revalidatePath("/quests");
  return { status: "success", message: "Topic updated." };
}

export async function deleteTopicAction(topicId: string): Promise<SubjectState> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("topics").delete().eq("id", topicId);
  if (error) return { status: "error", message: describeDatabaseError(error.message) };

  revalidateSubjectSurfaces();
  return { status: "success", message: "Topic removed." };
}
