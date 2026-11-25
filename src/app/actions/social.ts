"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireHunterAction } from "@/lib/auth";
import { describeDatabaseError, guildSchema, guildSettingsSchema } from "@/lib/validation";

export type SocialState = {
  status: "idle" | "error" | "success";
  message?: string;
  fields?: Record<string, string>;
};

const FRIEND_SURFACES = ["/friends", "/leaderboard", "/dashboard", "/profile"];

function revalidateFriends() {
  for (const path of FRIEND_SURFACES) revalidatePath(path);
}

function revalidateGuilds(slug?: string | null) {
  revalidatePath("/guilds");
  revalidatePath("/dashboard");
  revalidatePath("/leaderboard");
  if (slug) revalidatePath(`/guilds/${slug}`);
}

/* ----------------------------------------------------------------- friends -- */

export async function requestHunterAction(username: string): Promise<SocialState> {
  const handle = String(username ?? "").trim();
  if (handle.length < 3) return { status: "error", message: "Enter a hunter handle." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("send_friend_request", { p_username: handle });

  if (error) return { status: "error", message: describeDatabaseError(error.message) };

  revalidateFriends();

  const status = (data as { status?: string } | null)?.status;
  return {
    status: "success",
    message: status === "accepted" ? `${handle} was added to your roster.` : `Request sent to ${handle}.`,
  };
}

export async function sendFriendRequestAction(_prev: SocialState, formData: FormData): Promise<SocialState> {
  return requestHunterAction(String(formData.get("username") ?? ""));
}

export async function respondFriendRequestAction(requesterId: string, accept: boolean): Promise<SocialState> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("respond_friend_request", {
    p_requester: requesterId,
    p_accept: accept,
  });

  if (error) return { status: "error", message: describeDatabaseError(error.message) };

  revalidateFriends();
  return { status: "success", message: accept ? "Hunter added to your roster." : "Request declined." };
}

export async function removeFriendAction(friendId: string): Promise<SocialState> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("remove_friend", { p_other: friendId });

  if (error) return { status: "error", message: describeDatabaseError(error.message) };

  revalidateFriends();
  return { status: "success", message: "Removed from your roster." };
}

/* ------------------------------------------------------------------ guilds -- */

export async function createGuildAction(_prev: SocialState, formData: FormData): Promise<SocialState> {
  const parsed = guildSchema.safeParse({
    name: formData.get("name"),
    tag: formData.get("tag"),
    description: formData.get("description") ?? undefined,
    color: formData.get("color") ?? "#38e1ff",
    isOpen: formData.get("isOpen") === "on" || formData.get("isOpen") === "true",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join(".") || "form", i.message])),
    };
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("create_guild", {
    p_name: parsed.data.name,
    p_tag: parsed.data.tag,
    p_description: parsed.data.description ?? null,
    p_is_open: parsed.data.isOpen,
    p_color: parsed.data.color,
  });

  if (error) {
    const message = describeDatabaseError(error.message);
    return {
      status: "error",
      message,
      fields: message.toLowerCase().includes("name") ? { name: message } : { tag: message },
    };
  }

  revalidateGuilds((data as { slug?: string } | null)?.slug);
  return { status: "success", message: "Guild founded. The Association has registered it." };
}

export async function joinGuildAction(guildId: string): Promise<SocialState> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("join_guild", { p_guild_id: guildId });

  if (error) return { status: "error", message: describeDatabaseError(error.message) };

  revalidateGuilds((data as { slug?: string } | null)?.slug);
  return { status: "success", message: "You joined the guild." };
}

export async function leaveGuildAction(): Promise<SocialState> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("leave_guild");

  if (error) return { status: "error", message: describeDatabaseError(error.message) };

  revalidateGuilds();
  return {
    status: "success",
    message: (data as { dissolved?: boolean } | null)?.dissolved
      ? "You left and the guild was dissolved."
      : "You left the guild.",
  };
}

export async function updateGuildAction(_prev: SocialState, formData: FormData): Promise<SocialState> {
  const parsed = guildSettingsSchema.safeParse({
    description: formData.get("description") ?? undefined,
    color: formData.get("color") ?? "#38e1ff",
    isOpen: formData.get("isOpen") === "on" || formData.get("isOpen") === "true",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join(".") || "form", i.message])),
    };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("update_my_guild", {
    p_description: parsed.data.description ?? null,
    p_is_open: parsed.data.isOpen,
    p_color: parsed.data.color,
  });

  if (error) return { status: "error", message: describeDatabaseError(error.message) };

  revalidateGuilds();
  return { status: "success", message: "Guild record updated." };
}

export async function removeGuildMemberAction(userId: string): Promise<SocialState> {
  const { supabase } = await requireHunterAction();
  const { error } = await supabase.rpc("remove_guild_member", { p_user: userId });

  if (error) return { status: "error", message: describeDatabaseError(error.message) };

  revalidateGuilds();
  return { status: "success", message: "Hunter removed from the guild." };
}

export async function setGuildRoleAction(userId: string, role: "officer" | "member"): Promise<SocialState> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("set_guild_member_role", { p_user: userId, p_role: role });

  if (error) return { status: "error", message: describeDatabaseError(error.message) };

  revalidateGuilds();
  return { status: "success", message: role === "officer" ? "Hunter promoted to officer." : "Hunter demoted." };
}
