"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireHunterAction } from "@/lib/auth";
import { describeDatabaseError } from "@/lib/validation";
import type { HunterRole } from "@/lib/types";

export type AdminState = {
  status: "idle" | "error" | "success";
  message?: string;
};

const ROLES: HunterRole[] = ["hunter", "moderator"];

export async function setHunterRoleAction(userId: string, role: HunterRole): Promise<AdminState> {
  await requireHunterAction();

  if (!userId || !ROLES.includes(role)) {
    return { status: "error", message: "That role cannot be assigned here." };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("admin_set_role", { p_user: userId, p_role: role });

  if (error) return { status: "error", message: describeDatabaseError(error.message) };

  revalidatePath("/admin");
  return { status: "success", message: `Role set to ${role}.` };
}
