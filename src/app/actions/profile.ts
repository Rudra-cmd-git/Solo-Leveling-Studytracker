"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireHunterAction } from "@/lib/auth";
import { describeDatabaseError, profileSchema } from "@/lib/validation";
import { AVATAR_BUCKET, describeAvatarUploadError, isValidAvatarUrl } from "@/lib/avatars";
import type { Profile } from "@/lib/types";

export type ProfileState = {
  status: "idle" | "error" | "success";
  message?: string;
  fields?: Record<string, string>;
};

export type AvatarState = {
  status: "idle" | "error" | "success";
  message?: string;
  avatarUrl?: string | null;
};

export async function updateProfileAction(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const parsed = profileSchema.safeParse({
    username: formData.get("username"),
    displayName: formData.get("displayName") ?? undefined,
    bio: formData.get("bio") ?? undefined,
    timezone: formData.get("timezone") ?? undefined,
    dailyGoalMinutes: formData.get("dailyGoalMinutes") ?? 60,
    isPublic: formData.get("isPublic") === "on" || formData.get("isPublic") === "true",
    showOnLeaderboard: formData.get("showOnLeaderboard") === "on" || formData.get("showOnLeaderboard") === "true",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join(".") || "form", i.message])),
    };
  }

  const { supabase, user } = await requireHunterAction();
  const { error } = await supabase.rpc("update_my_profile", {
    p_username: parsed.data.username,
    p_display_name: parsed.data.displayName ?? null,
    p_bio: parsed.data.bio ?? null,
    p_avatar_url: null,
    p_timezone: parsed.data.timezone ?? null,
    p_is_public: parsed.data.isPublic,
    p_show_on_leaderboard: parsed.data.showOnLeaderboard,
    p_daily_goal_minutes: parsed.data.dailyGoalMinutes,
  });

  if (error) {
    const message = describeDatabaseError(error.message);
    return {
      status: "error",
      message,
      fields: message.toLowerCase().includes("username") ? { username: message } : undefined,
    };
  }

  revalidatePath("/profile");
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath(`/hunters/${parsed.data.username}`);
  revalidatePath("/leaderboard");

  // Keep the public hunter page for a renamed hunter reachable.
  if (user) revalidatePath("/hunters", "layout");

  return { status: "success", message: "Hunter record updated." };
}

/**
 * Deletes the stored object behind an avatar URL, but only when it lives in the
 * hunter's own folder. Storage RLS refuses anything else, so this is a second
 * lock rather than the only one.
 */
async function removeAvatarObject(supabase: SupabaseClient, userId: string, url: string | null): Promise<void> {
  if (!url) return;
  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index < 0) return;
  const path = url.slice(index + marker.length);
  if (!path.startsWith(`${userId}/`)) return;
  try {
    await supabase.storage.from(AVATAR_BUCKET).remove([path]);
  } catch {
    // A leftover object costs a few kilobytes; never fail the user's save for it.
  }
}

/**
 * Persists an avatar after the browser has uploaded it to Storage. Passing null
 * clears the avatar and restores the generated glyph.
 *
 * The URL is re-checked here and again inside the database trigger, because a
 * client can post anything to a Server Action.
 */
export async function setAvatarAction(avatarUrl: string | null): Promise<AvatarState> {
  const { supabase, user, profile } = await requireHunterAction();
  const next = avatarUrl?.trim() || null;

  if (next !== null && !isValidAvatarUrl(next, user.id)) {
    return { status: "error", message: "That image is not an uploaded avatar. Try uploading again." };
  }

  const previous = profile.avatar_url;
  const { error } = await supabase.rpc("set_my_avatar", { p_avatar_url: next });

  if (error) {
    if (next !== null) await removeAvatarObject(supabase, user.id, next);
    const message = /RATE_LIMITED|NOT_AUTHENTICATED|AVATAR_URL_NOT_ALLOWED/.test(error.message)
      ? describeDatabaseError(error.message)
      : error.message?.includes("INVALID_AVATAR_URL")
        ? "That image is not an uploaded avatar."
        : describeAvatarUploadError(error.message);
    return { status: "error", message };
  }

  if (previous && previous !== next) await removeAvatarObject(supabase, user.id, previous);

  revalidatePath("/profile");
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/leaderboard");
  revalidatePath(`/hunters/${profile.username}`);

  return {
    status: "success",
    message: next ? "Avatar updated." : "Avatar removed.",
    avatarUrl: next,
  };
}

export async function markAwakenedAction(): Promise<Profile | null> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("mark_awakened");
  if (error) return null;
  revalidatePath("/dashboard");
  revalidatePath("/awakening");
  return null;
}

export async function markNotificationsReadAction(ids?: string[]): Promise<{ ok: boolean }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("mark_notifications_read", { p_ids: ids && ids.length > 0 ? ids : null });
  if (error) return { ok: false };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteAccountAction(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const confirmation = String(formData.get("confirmation") ?? "").trim().toUpperCase();
  if (confirmation !== "DELETE") {
    return {
      status: "error",
      message: 'Type DELETE in capitals to confirm. This cannot be undone.',
      fields: { confirmation: "Type DELETE to confirm." },
    };
  }

  const { supabase, user, profile } = await requireHunterAction();

  // Delete the stored avatar before the profile row disappears, otherwise the
  // object stays publicly reachable in the avatars bucket forever.
  await removeAvatarObject(supabase, user.id, profile.avatar_url);

  const { error } = await supabase.rpc("delete_my_account");
  if (error) return { status: "error", message: describeDatabaseError(error.message) };

  await supabase.auth.signOut();
  redirect("/?deleted=1");
}
