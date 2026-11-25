"use client";

import { useState, useTransition } from "react";
import { setHunterRoleAction } from "@/app/actions/admin";
import type { HunterRole } from "@/lib/types";
import { cn } from "@/lib/utils";

const OPTIONS: { value: HunterRole; label: string }[] = [
  { value: "hunter", label: "Hunter" },
  { value: "moderator", label: "Moderator" },
];

export function RoleControl({ userId, role, isSelf }: { userId: string; role: HunterRole; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (isSelf || role === "admin") {
    return (
      <span className="hud-label text-[0.55rem] text-faint">
        {role === "admin" ? "admin · owner-managed" : "you"}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={pending || role === option.value}
            onClick={() =>
              startTransition(async () => {
                const result = await setHunterRoleAction(userId, option.value);
                setMessage(result.message ?? null);
              })
            }
            className={cn(
              "rounded border px-1.5 py-0.5 text-[0.55rem] uppercase tracking-wide transition",
              role === option.value
                ? "border-cyan/50 bg-cyan/10 text-cyan"
                : "border-line/60 text-muted hover:border-cyan/40 hover:text-cyan",
              pending && "opacity-50",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {message ? <span className="max-w-[10rem] text-right text-[0.55rem] text-faint">{message}</span> : null}
    </div>
  );
}
