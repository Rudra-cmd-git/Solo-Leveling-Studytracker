import { z } from "zod";

/**
 * Every schema here is used on the server. The client repeats a subset for
 * instant feedback, but server validation is the authority.
 */

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "At least 3 characters.")
  .max(20, "At most 20 characters.")
  .regex(USERNAME_PATTERN, "Letters, numbers and underscores only.");

export const emailSchema = z
  .string()
  .trim()
  .min(5, "Enter your email.")
  .max(254, "That email is too long.")
  .regex(EMAIL_PATTERN, "Enter a valid email address.");

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "At most 72 characters.");

export const signUpSchema = z
  .object({
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    timezone: z.string().trim().max(64).optional(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const subjectSchema = z.object({
  title: z.string().trim().min(1, "Name your subject.").max(60, "Keep it under 60 characters."),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Pick a hex colour.")
    .default("#38bdf8"),
  targetMinutesPerWeek: z.coerce.number().int().min(0).max(10080).optional(),
});

export const topicSchema = z.object({
  subjectId: z.uuid("Choose a subject."),
  title: z.string().trim().min(1, "Name your topic.").max(120, "Keep it under 120 characters."),
  status: z.enum(["not_started", "learning", "revised", "mastered"]).default("not_started"),
});

export const topicStatusSchema = z.enum(["not_started", "learning", "revised", "mastered"]);

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export const guildSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "At least 3 characters.")
    .max(32, "At most 32 characters."),
  tag: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,5}$/, "2-5 capital letters or digits."),
  description: z.string().trim().max(280, "Keep the creed under 280 characters.").optional(),
  color: z.string().trim().regex(HEX_COLOR, "Pick a hex colour.").default("#38e1ff"),
  isOpen: z.boolean().default(true),
});

export const guildSettingsSchema = z.object({
  description: z.string().trim().max(280, "Keep the creed under 280 characters.").optional(),
  color: z.string().trim().regex(HEX_COLOR, "Pick a hex colour.").default("#38e1ff"),
  isOpen: z.boolean().default(true),
});

export const startSessionSchema = z.object({
  plannedSeconds: z.coerce
    .number()
    .int()
    .min(60, "Pick at least one minute.")
    .max(6 * 60 * 60, "Sessions are capped at six hours."),
  clientToken: z.uuid(),
  subjectId: z.uuid().nullable().optional(),
  topicId: z.uuid().nullable().optional(),
  isRevision: z.boolean().default(false),
  note: z.string().trim().max(280).optional(),
});

export const profileSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().max(40).optional(),
  bio: z.string().trim().max(500, "Keep your bio under 500 characters.").optional(),
  timezone: z.string().trim().max(64).optional(),
  dailyGoalMinutes: z.coerce.number().int().min(15, "At least 15 minutes.").max(1440, "At most 24 hours."),
  isPublic: z.boolean().default(true),
  showOnLeaderboard: z.boolean().default(true),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SubjectInput = z.infer<typeof subjectSchema>;
export type TopicInput = z.infer<typeof topicSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;

/** Collapse a ZodError into a field -> message map for form rendering. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

/** Human-readable message for any thrown Supabase / Postgres error. */
export function describeDatabaseError(message: string | undefined): string {
  if (!message) return "The System rejected that request.";
  if (message.includes("NOT_AUTHENTICATED")) return "Your session expired. Sign in again.";
  if (message.includes("SESSION_ALREADY_ACTIVE")) return "You already have a session running.";
  if (message.includes("RATE_LIMITED")) return "Too many requests. Wait a moment and retry.";
  if (message.includes("INVALID_SUBJECT")) return "That subject is not yours.";
  if (message.includes("INVALID_TOPIC")) return "That topic is not yours.";
  if (message.includes("INVALID_PLANNED_DURATION")) return "That session length is not allowed.";
  if (message.includes("SESSION_CANCELLED")) return "That session was cancelled.";
  if (message.includes("SESSION_NOT_FOUND")) return "That session no longer exists.";
  if (message.includes("USERNAME_TAKEN")) return "That username is already taken.";
  if (message.includes("INVALID_USERNAME")) return "Usernames need 3-20 letters, numbers or underscores.";
  if (message.includes("INVALID_DAILY_GOAL")) return "Daily goal must be between 15 and 1440 minutes.";

  // Social (friends)
  if (message.includes("HUNTER_NOT_FOUND")) return "No public hunter uses that handle.";
  if (message.includes("CANNOT_FRIEND_SELF")) return "You cannot add yourself.";
  if (message.includes("ALREADY_FRIENDS")) return "You are already in that hunter's roster.";
  if (message.includes("REQUEST_ALREADY_SENT")) return "A request is already waiting for them.";
  if (message.includes("REQUEST_NOT_FOUND")) return "That request is no longer pending.";

  // Guilds
  if (message.includes("INVALID_GUILD_NAME")) return "Guild names need 3-32 characters.";
  if (message.includes("INVALID_GUILD_TAG")) return "Guild tags are 2-5 capital letters or digits.";
  if (message.includes("INVALID_GUILD_COLOR")) return "Pick a valid hex colour.";
  if (message.includes("INVALID_GUILD_ROLE")) return "That guild role does not exist.";
  if (message.includes("ALREADY_IN_GUILD")) return "You already belong to a guild.";
  if (message.includes("GUILD_NAME_TAKEN")) return "A guild already uses that name.";
  if (message.includes("GUILD_NOT_FOUND")) return "That guild no longer exists.";
  if (message.includes("GUILD_CLOSED")) return "That guild is closed to new members.";
  if (message.includes("GUILD_FULL")) return "That guild is full.";
  if (message.includes("NOT_IN_GUILD")) return "You are not in a guild.";
  if (message.includes("GUILD_LEADER_ONLY")) return "Only the guild leader can do that.";
  if (message.includes("CANNOT_REMOVE_LEADER")) return "The leader cannot be removed from the roster.";
  if (message.includes("USE_LEAVE_GUILD")) return "Use Leave guild to remove yourself.";
  if (message.includes("CANNOT_DEMOTE_LEADER")) return "The leader cannot be demoted.";
  if (message.includes("duplicate key")) return "That already exists.";
  if (message.includes("row-level security")) return "You are not allowed to do that.";
  return message;
}
