/**
 * Progression configuration.
 *
 * Single source of truth for the level curve and rank ladder on the client and
 * server. The database holds the same numbers in `progression_config` and
 * `rank_thresholds`; this module is the mirror used to render bars and to
 * preview rewards. Actual XP and ranks are always computed by PostgreSQL.
 */

export const PROGRESSION = {
  /** XP awarded per credited minute of focused study. */
  xpPerMinute: 1,
  /** XP required for level 1 -> 2. */
  baseLevelXp: 100,
  /** Additional XP required per level: need = base + (level - 1) * growth. */
  levelGrowthXp: 25,
  /** Soft cap on session XP per local day. Study time beyond it is still recorded. */
  dailyXpCap: 720,
  /** A session shorter than this earns nothing. */
  minSessionSeconds: 60,
  /** Longest single session the System will credit. */
  maxSessionSeconds: 6 * 60 * 60,
} as const;

export type RankCode = "F" | "E" | "D" | "C" | "B" | "A" | "S";

export interface RankDefinition {
  code: RankCode;
  name: string;
  minXp: number;
  /** CSS custom property name holding this rank's accent colour. */
  color: string;
  blurb: string;
}

export const RANKS: RankDefinition[] = [
  { code: "F", name: "F-Rank", minXp: 0, color: "var(--rank-f)", blurb: "Awakened" },
  { code: "E", name: "E-Rank", minXp: 500, color: "var(--rank-e)", blurb: "Apprentice" },
  { code: "D", name: "D-Rank", minXp: 1_500, color: "var(--rank-d)", blurb: "Field Hunter" },
  { code: "C", name: "C-Rank", minXp: 3_000, color: "var(--rank-c)", blurb: "Veteran" },
  { code: "B", name: "B-Rank", minXp: 6_000, color: "var(--rank-b)", blurb: "Elite" },
  { code: "A", name: "A-Rank", minXp: 10_000, color: "var(--rank-a)", blurb: "National Level" },
  { code: "S", name: "S-Rank", minXp: 15_000, color: "var(--rank-s)", blurb: "Monarch" },
];

export const RANK_BY_CODE: Record<RankCode, RankDefinition> = RANKS.reduce(
  (acc, rank) => ({ ...acc, [rank.code]: rank }),
  {} as Record<RankCode, RankDefinition>,
);

/** XP required to advance from `level` to `level + 1`. */
export function levelStepXp(level: number): number {
  return Math.max(1, PROGRESSION.baseLevelXp + (Math.max(level, 1) - 1) * PROGRESSION.levelGrowthXp);
}

/** Cumulative XP required to *be* at `level`. */
export function xpToReachLevel(level: number): number {
  if (level <= 1) return 0;
  return (
    PROGRESSION.baseLevelXp * (level - 1) +
    (PROGRESSION.levelGrowthXp * (level - 1) * (level - 2)) / 2
  );
}

/** Level implied by a lifetime XP total. */
export function levelForXp(xp: number): number {
  const value = Math.max(0, Math.floor(xp ?? 0));
  const { baseLevelXp, levelGrowthXp } = PROGRESSION;
  if (levelGrowthXp <= 0) return Math.floor(value / Math.max(baseLevelXp, 1)) + 1;

  const a = levelGrowthXp;
  const b = 2 * baseLevelXp - levelGrowthXp;
  const c = -2 * value;
  const guess = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  let level = Math.max(1, Math.floor(guess) + 1);

  while (level > 1 && xpToReachLevel(level) > value) level -= 1;
  while (xpToReachLevel(level + 1) <= value) level += 1;
  return level;
}

export interface LevelProgress {
  level: number;
  levelXpStart: number;
  levelXpNext: number;
  intoLevel: number;
  needed: number;
  percent: number;
}

export function levelProgress(xp: number): LevelProgress {
  const value = Math.max(0, Math.floor(xp ?? 0));
  const level = levelForXp(value);
  const levelXpStart = xpToReachLevel(level);
  const levelXpNext = xpToReachLevel(level + 1);
  const intoLevel = Math.max(0, value - levelXpStart);
  const needed = Math.max(1, levelXpNext - levelXpStart);
  return {
    level,
    levelXpStart,
    levelXpNext,
    intoLevel,
    needed,
    percent: Math.min(100, Math.round((intoLevel / needed) * 10000) / 100),
  };
}

export function rankForXp(xp: number): RankCode {
  const value = Math.max(0, xp ?? 0);
  let current: RankCode = "F";
  for (const rank of RANKS) {
    if (value >= rank.minXp) current = rank.code;
  }
  return current;
}

export function rankIndex(code: string): number {
  return RANKS.findIndex((rank) => rank.code === code);
}

export function nextRank(code: string): RankDefinition | null {
  const index = rankIndex(code);
  if (index < 0 || index >= RANKS.length - 1) return null;
  return RANKS[index + 1];
}

/** Progress towards the next rank, as a 0-100 percentage. */
export function rankProgress(xp: number): { current: RankDefinition; next: RankDefinition | null; percent: number; remaining: number } {
  const code = rankForXp(xp);
  const current = RANK_BY_CODE[code];
  const next = nextRank(code);
  if (!next) return { current, next: null, percent: 100, remaining: 0 };

  const span = next.minXp - current.minXp;
  const into = Math.max(0, xp - current.minXp);
  return {
    current,
    next,
    percent: Math.min(100, Math.round((into / span) * 10000) / 100),
    remaining: Math.max(0, next.minXp - Math.max(0, xp)),
  };
}
