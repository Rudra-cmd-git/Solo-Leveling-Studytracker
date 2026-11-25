/**
 * Avatar upload rules shared by the browser uploader and the server action.
 *
 * The database is the final authority (`public.avatar_url_allowed` +
 * `set_my_avatar`). Everything here exists so the UI can fail fast with a
 * readable message instead of a PostgREST error.
 */

export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MAX_EDGE = 1024;

export const AVATAR_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const AVATAR_ACCEPT = AVATAR_MIME_TYPES.join(",");

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * `https://<project>.supabase.co/storage/v1/object/public/avatars/<uid>/<file>`
 * Mirrors the SQL rule in `supabase/migrations/0008_avatar_storage.sql`.
 */
const AVATAR_URL_PATTERN =
  /^https:\/\/[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?\/storage\/v1\/object\/public\/avatars\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/;

/** The storage folder (the owner's user id) of an avatar URL, if it is valid. */
export function avatarFolderOf(url: string): string | null {
  const match = AVATAR_URL_PATTERN.exec(url.trim());
  return match ? match[2] : null;
}

/** True when the URL is a public object inside the hunter's own avatar folder. */
export function isValidAvatarUrl(url: string, userId: string): boolean {
  return avatarFolderOf(url) === userId;
}

export function avatarExtension(file: File): string {
  return EXTENSION_BY_MIME[file.type] ?? "png";
}

export function avatarObjectPath(userId: string, file: File, stamp = Date.now()): string {
  return `${userId}/avatar-${stamp}.${avatarExtension(file)}`;
}

export type AvatarIssue = { ok: false; message: string } | { ok: true };

/** Client-side pre-flight so an obviously bad file never reaches the network. */
export function checkAvatarFile(file: File): AvatarIssue {
  if (!AVATAR_MIME_TYPES.includes(file.type as (typeof AVATAR_MIME_TYPES)[number])) {
    return { ok: false, message: "Use a PNG, JPEG or WebP image." };
  }
  if (file.size === 0) {
    return { ok: false, message: "That file is empty." };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return { ok: false, message: `Keep the image under ${AVATAR_MAX_BYTES / (1024 * 1024)} MB.` };
  }
  return { ok: true };
}

/** Readable message for a Supabase Storage upload failure. */
export function describeAvatarUploadError(message: string | undefined): string {
  if (!message) return "The upload failed. Try again.";
  if (/exceeded the maximum allowed size/i.test(message)) return "That image is too large (2 MB max).";
  if (/mime type .* is not supported/i.test(message)) return "Use a PNG, JPEG or WebP image.";
  if (/row-level security|not authorized|new row violates/i.test(message)) {
    return "The System refused the upload. Sign out and back in, then retry.";
  }
  if (/bucket not found/i.test(message)) {
    return "The avatar bucket is missing. Apply migration 0008 in Supabase.";
  }
  return message;
}
