import { cn, hueOf, initialsOf } from "@/lib/utils";
import { RANK_BY_CODE, type RankCode } from "@/lib/progression";

interface HunterAvatarProps {
  username: string;
  avatarUrl?: string | null;
  rank?: RankCode;
  size?: number;
  className?: string;
  ring?: boolean;
}

/**
 * A hunter's avatar. Falls back to a generated glyph in the hunter's own hue,
 * so profiles stay distinguishable without any upload service.
 */
export function HunterAvatar({
  username,
  avatarUrl,
  rank = "F",
  size = 44,
  className,
  ring = true,
}: HunterAvatarProps) {
  const hue = hueOf(username);
  const initials = initialsOf(username);
  const rankColor = RANK_BY_CODE[rank]?.color ?? "var(--rank-f)";

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg", className)}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(150deg, hsl(${hue} 70% 26%), hsl(${(hue + 48) % 360} 72% 14%))`,
        boxShadow: ring
          ? `inset 0 0 0 1px color-mix(in oklab, ${rankColor} 55%, transparent), 0 8px 24px -14px ${rankColor}`
          : undefined,
      }}
      aria-hidden
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote avatar URLs are user supplied
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span
          className="font-hud tracking-[0.08em]"
          style={{ fontSize: Math.max(10, size * 0.36), color: "rgba(226,242,255,0.92)" }}
        >
          {initials}
        </span>
      )}
    </span>
  );
}
