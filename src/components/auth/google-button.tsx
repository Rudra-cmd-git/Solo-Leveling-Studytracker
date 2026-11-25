"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { signInWithGoogleAction } from "@/app/actions/auth";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2a7 7 0 0 1-6.6-4.8h-4v3.1A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.4 14.5a7.2 7.2 0 0 1 0-4.6V6.8h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.8l4 3.1A7 7 0 0 1 12 4.8Z"
      />
    </svg>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-ghost w-full py-2.5" disabled={pending}>
      {pending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <GoogleMark />}
      {pending ? "Opening Google…" : label}
    </button>
  );
}

export function GoogleButton({ next, label }: { next?: string; label?: string }) {
  return (
    <form action={signInWithGoogleAction}>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <SubmitButton label={label ?? "Continue with Google"} />
    </form>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-line/60" />
      <span className="hud-label text-[0.55rem] text-faint">or</span>
      <span className="h-px flex-1 bg-line/60" />
    </div>
  );
}
