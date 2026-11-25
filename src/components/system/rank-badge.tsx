import { RANK_BY_CODE, type RankCode } from "@/lib/progression";
import { cn } from "@/lib/utils";

interface RankBadgeProps {
  rank: RankCode | string;
  size?: "sm" | "md" | "lg" | "xl";
  showName?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<RankBadgeProps["size"]>, string> = {
  sm: "h-5 min-w-5 px-1.5 text-[0.6rem]",
  md: "h-7 min-w-7 px-2 text-xs",
  lg: "h-9 min-w-9 px-2.5 text-sm",
  xl: "h-12 min-w-12 px-3.5 text-lg",
};

export function RankBadge({ rank, size = "md", showName = false, className }: RankBadgeProps) {
  const definition = RANK_BY_CODE[rank as RankCode];
  const label = definition?.code ?? "F";

  return (
    <span
      className={cn("rank-badge", `rank-${label}`, SIZE_CLASSES[size], className)}
      title={definition ? `${definition.name} — ${definition.blurb}` : `Rank ${label}`}
    >
      <span aria-hidden>{label}</span>
      {showName ? <span className="text-[0.65em] tracking-[0.18em] opacity-80">{definition?.name ?? "Rank"}</span> : null}
      <span className="sr-only">{definition ? `Rank ${definition.name}` : `Rank ${label}`}</span>
    </span>
  );
}
