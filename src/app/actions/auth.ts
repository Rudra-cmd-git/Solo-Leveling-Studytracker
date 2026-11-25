"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { describeDatabaseError, fieldErrors, loginSchema, signUpSchema } from "@/lib/validation";

export type AuthState = {
  status: "idle" | "error" | "success";
  message?: string;
  fields?: Record<string, string>;
};

async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured) {
    return { status: "error", message: "The System is not configured yet. Add your Supabase keys to .env.local." };
  }

  const parsed = signUpSchema.safeParse({
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    timezone: formData.get("timezone") ?? undefined,
  });

  if (!parsed.success) {
    return { status: "error", message: "Check the highlighted fields.", fields: fieldErrors(parsed.error) };
  }

  const { username, email, password, timezone } = parsed.data;
  const supabase = await createServerSupabase();

  // Check the handle before creating an auth user, so the visitor gets a
  // clean error instead of a half-created account.
  const availability = await supabase.rpc("username_available", { p_username: username });
  if (availability.error) {
    return { status: "error", message: describeDatabaseError(availability.error.message) };
  }
  if (availability.data === false) {
    return { status: "error", message: "That username is taken.", fields: { username: "That username is taken." } };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        timezone: timezone || "UTC",
      },
      emailRedirectTo: `${await siteOrigin()}/auth/callback`,
    },
  });

  if (error) {
    return { status: "error", message: describeDatabaseError(error.message) };
  }

  if (data.session) {
    redirect("/awakening");
  }

  return {
    status: "success",
    message:
      "Awakening registered. Confirm your email address to activate the System, then sign in.",
  };
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured) {
    return { status: "error", message: "The System is not configured yet. Add your Supabase keys to .env.local." };
  }

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { status: "error", message: "Check the highlighted fields.", fields: fieldErrors(parsed.error) };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    const message = error.message.toLowerCase().includes("invalid")
      ? "Those credentials were rejected."
      : describeDatabaseError(error.message);
    return { status: "error", message };
  }

  const next = String(formData.get("next") ?? "").trim();
  const destination = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  redirect(destination);
}

/**
 * Google (or any other enabled OAuth provider) sign-in.
 *
 * The verifier cookie is written by this Server Action, which can set cookies -
 * unlike a Server Component - and read back by /auth/callback when Google
 * redirects the hunter to us with a one-time code.
 */
export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  if (!isSupabaseConfigured) redirect("/login?error=not_configured");

  const requested = String(formData.get("next") ?? "").trim();
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/awakening";

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data?.url) redirect("/login?error=oauth_unavailable");

  redirect(data.url);
}

export async function logoutAction(): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
  }
  redirect("/");
}

export async function requestPasswordResetAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured) {
    return { status: "error", message: "The System is not configured yet." };
  }
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { status: "error", message: "Enter your email." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/callback?next=/settings`,
  });

  if (error) return { status: "error", message: describeDatabaseError(error.message) };
  return { status: "success", message: "If that email exists, a reset link is on its way." };
}
