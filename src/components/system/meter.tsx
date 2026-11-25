import { cn, percentOf } from "@/lib/utils";
import { RANK_BY_CODE, type RankCode } from "@/lib/progression";

interface StatBarProps {
  value: number;
  max: number;
  variant?: "cyan" | "violet" | "gold" | "mint";
  height?: "sm" | "md" | "lg";
  label?: string;
  rightLabel?: string;
  className?: string;
  ariaLabel?: string;
}

const HEIGHTS = { sm: "h-1", md: "h-[6px]", lg: "h-2.5" } as const;

const VARIANTS = {
  cyan: "stat-fill",
  violet: "stat-fill stat-fill-violet",
  gold: "stat-fill stat-fill-gold",
  mint: "stat-fill stat-fill-mint",
} as const;

export function StatBar({
  value,
  max,
  variant = "cyan",
  height = "md",
  label,
  rightLabel,
  className,
  ariaLabel,
}: StatBarProps) {
  const percent = percentOf(value, max);

  return (
    <div className={cn("w-full", className)}>
      {label || rightLabel ? (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          {label ? <span className="hud-label">{label}</span> : <span />}
          {rightLabel ? <span className="numeric text-xs text-muted">{rightLabel}</span> : null}
        </div>
      ) : null}
      <div
        className={cn("stat-track", HEIGHTS[height])}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-label={ariaLabel ?? label ?? "Progress"}
      >
        <div className={VARIANTS[variant]} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** Segmented HUD meter — used for the descriptive hunter attributes. */
export function SegmentMeter({
  value,
  segments = 10,
  tone = "cyan",
  className,
}: {
  value: number;
  segments?: number;
  tone?: "cyan" | "violet" | "gold";
  className?: string;
}) {
  const filled = Math.round((percentOf(value, 100) / 100) * segments);
  const toneClass =
    tone === "violet"
      ? "bg-[linear-gradient(90deg,#6d3bd8,#a06bff)] shadow-[0_0_10px_-2px_rgba(160,107,255,0.8)]"
      : tone === "gold"
        ? "bg-[linear-gradient(90deg,#b8860b,#f5c451)] shadow-[0_0_10px_-2px_rgba(245,196,81,0.8)]"
        : "";

  return (
    <div className={cn("hud-segments", className)} aria-hidden>
      {Array.from({ length: segments }).map((_, index) => (
        <span
          key={index}
          className={cn("hud-segment", index < filled && "hud-segment-on", index < filled && toneClass)}
        />
      ))}
    </div>
  );
}

/** Circular level indicator. */
export function LevelRing({
  level,
  percent,
  rank,
  size = 132,
  label = "LEVEL",
}: {
  level: number;
  percent: number;
  rank: RankCode;
  size?: number;
  label?: string;
}) {
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(Math.max(percent, 0), 100) / 100) * circumference;
  const rankColor = RANK_BY_CODE[rank]?.color ?? "var(--rank-f)";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={`ring-${rank}-${level}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b7dff" />
            <stop offset="55%" stopColor="#38e1ff" />
            <stop offset="100%" stopColor={rankColor} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(120,170,230,0.14)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#ring-${rank}-${level})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="hud-label text-[0.55rem]">{label}</span>
        <span className="numeric text-3xl font-semibold text-text glow-text">
          {String(level).padStart(2, "0")}
        </span>
        <span className="numeric text-[0.62rem] text-faint">{Math.round(percent)}%</span>
      </div>
    </div>
  );
}
