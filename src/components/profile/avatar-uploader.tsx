"use client";

import { useRef, useState } from "react";
import { Check, ImageUp, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { setAvatarAction } from "@/app/actions/profile";
import { HunterAvatar } from "@/components/system/hunter-avatar";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  AVATAR_ACCEPT,
  AVATAR_BUCKET,
  AVATAR_MAX_BYTES,
  avatarObjectPath,
  checkAvatarFile,
  describeAvatarUploadError,
  isValidAvatarUrl,
} from "@/lib/avatars";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

type Busy = "upload" | "remove" | null;

/**
 * Avatar control for the settings page.
 *
 * The browser uploads the file straight to Supabase Storage (RLS pins it to
 * `avatars/<own id>/`), then the server action persists the resulting URL. The
 * stored URL never leaves the project's own bucket, so public profiles cannot
 * be used to phone home to a third-party tracker.
 */
export function AvatarUploader({
  profile,
  className,
  onChange,
}: {
  profile: Profile;
  className?: string;
  /** Lets a parent that renders its own HunterAvatar stay in sync. */
  onChange?: (avatarUrl: string | null) => void;
}) {
  const [current, setCurrent] = useState(profile.avatar_url ?? "");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setNotice(null);

    const check = checkAvatarFile(file);
    if (!check.ok) {
      setError(check.message);
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setBusy("upload");

    try {
      const supabase = createBrowserSupabase();
      const path = avatarObjectPath(profile.id, file);

      const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });

      if (uploadError) {
        setError(describeAvatarUploadError(uploadError.message));
        return;
      }

      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const publicUrl = data.publicUrl;

      if (!isValidAvatarUrl(publicUrl, profile.id)) {
        setError("The uploaded image landed outside your folder. Apply migration 0008 and retry.");
        return;
      }

      const result = await setAvatarAction(publicUrl);
      if (result.status === "error") {
        setError(result.message ?? "The System rejected that avatar.");
        return;
      }

      setCurrent(publicUrl);
      setNotice(result.message ?? "Avatar updated.");
      onChange?.(publicUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The upload failed. Try again.");
    } finally {
      setBusy(null);
      setPreview(null);
      URL.revokeObjectURL(localUrl);
    }
  }

  async function handleRemove() {
    setError(null);
    setNotice(null);
    setBusy("remove");
    try {
      const result = await setAvatarAction(null);
      if (result.status === "error") {
        setError(result.message ?? "The System rejected that request.");
        return;
      }
      setCurrent("");
      setNotice(result.message ?? "Avatar removed.");
      onChange?.(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The request failed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const working = busy !== null;

  return (
    <div className={cn("flex items-start gap-3 rounded-lg border border-line/60 bg-black/25 p-3", className)}>
      <div className="relative">
        <HunterAvatar
          username={profile.username}
          avatarUrl={preview ?? current}
          rank={profile.rank}
          size={56}
        />
        {busy === "upload" ? (
          <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60">
            <Loader2 size={16} className="animate-spin text-cyan" aria-hidden />
          </span>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="hud-label mb-1.5 block">Hunter avatar</p>

        <input
          ref={inputRef}
          type="file"
          accept={AVATAR_ACCEPT}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void handleFile(file);
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn px-3 py-1.5 text-xs"
            onClick={() => inputRef.current?.click()}
            disabled={working}
          >
            {busy === "upload" ? (
              <Loader2 size={12} className="animate-spin" aria-hidden />
            ) : (
              <ImageUp size={12} aria-hidden />
            )}
            {current ? "Replace image" : "Upload image"}
          </button>

          {current ? (
            <button
              type="button"
              className="btn btn-ghost px-3 py-1.5 text-xs"
              onClick={() => void handleRemove()}
              disabled={working}
            >
              {busy === "remove" ? (
                <Loader2 size={12} className="animate-spin" aria-hidden />
              ) : (
                <Trash2 size={12} aria-hidden />
              )}
              Remove
            </button>
          ) : null}
        </div>

        <p className="mt-1.5 text-[0.62rem] leading-relaxed text-faint">
          PNG, JPEG or WebP, up to {AVATAR_MAX_BYTES / (1024 * 1024)} MB. Stored in this project&apos;s own Supabase
          bucket and shown on your profile and the leaderboard. Without one, a glyph is generated from your handle.
        </p>

        {error ? (
          <p className="mt-1.5 flex items-start gap-1.5 text-[0.68rem] text-ember">
            <TriangleAlert size={12} className="mt-0.5 shrink-0" aria-hidden /> {error}
          </p>
        ) : null}
        {notice ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-[0.68rem] text-mint">
            <Check size={12} aria-hidden /> {notice}
          </p>
        ) : null}
      </div>
    </div>
  );
}
