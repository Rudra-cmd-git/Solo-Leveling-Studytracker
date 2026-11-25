"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Award,
  ChevronUp,
  Crown,
  Flame,
  Hourglass,
  Moon,
  ScrollText,
  Shield,
  ShieldCheck,
  Sparkles,
  Sunrise,
  Swords,
  Timer,
  TrendingUp,
  TriangleAlert,
  Zap,
  Radio,
  type LucideIcon,
} from "lucide-react";
import type { SessionCompletion } from "@/lib/types";
import { cn } from "@/lib/utils";

export type SystemEventKind = "session" | "level" | "rank" | "quest" | "achievement" | "error" | "info";

export interface SystemEvent {
  id: string;
  kind: SystemEventKind;
  title: string;
  message: string;
  detail?: string;
  xp?: number;
  rarity?: string;
  icon?: string;
}

const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  sunrise: Sunrise,
  medal: Award,
  "trending-up": TrendingUp,
  "calendar-check": ShieldCheck,
  moon: Moon,
  swords: Swords,
  timer: Timer,
  flame: Flame,
  shield: Shield,
  zap: Zap,
  "shield-check": ShieldCheck,
  crown: Crown,
  "scroll-text": ScrollText,
  hourglass: Hourglass,
};

const KIND_STYLE: Record<SystemEventKind, { accent: string; tag: string; icon: LucideIcon; glow: string }> = {
  session: {
    accent: "var(--color-cyan)",
    tag: "SYSTEM",
    icon: Radio,
    glow: "rgba(56,225,255,0.45)",
  },
  level: {
    accent: "var(--color-cyan)",
    tag: "LEVEL",
    icon: ChevronUp,
    glow: "rgba(56,225,255,0.6)",
  },
  rank: {
    accent: "var(--color-gold)",
    tag: "RANK",
    icon: Crown,
    glow: "rgba(245,196,81,0.55)",
  },
  quest: {
    accent: "var(--color-violet)",
    tag: "QUEST",
    icon: ScrollText,
    glow: "rgba(160,107,255,0.5)",
  },
  achievement: {
    accent: "var(--color-violet)",
    tag: "ACHIEVEMENT",
    icon: Award,
    glow: "rgba(160,107,255,0.5)",
  },
  error: {
    accent: "var(--color-ember)",
    tag: "WARNING",
    icon: TriangleAlert,
    glow: "rgba(255,107,107,0.45)",
  },
  info: {
    accent: "var(--color-azure)",
    tag: "SYSTEM",
    icon: Sparkles,
    glow: "rgba(59,125,255,0.45)",
  },
};

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Turn a completed session payload into the queue of System notifications the
 * hunter should see, in narrative order: time credited, then quests, then
 * achievements, then level, then rank.
 */
export function eventsFromCompletion(completion: SessionCompletion): SystemEvent[] {
  const events: SystemEvent[] = [];
  const minutes = completion.credited_minutes;

  if (completion.voided) {
    events.push({
      id: newId(),
      kind: "info",
      title: "SESSION TOO SHORT",
      message: "Less than one minute of focus was credited, so nothing was recorded.",
    });
  } else {
    events.push({
      id: newId(),
      kind: "session",
      title: "SESSION RECORDED",
      message: `${minutes} minute${minutes === 1 ? "" : "s"} of focused study credited.`,
      detail: completion.capped ? "Daily XP cap reached — time still recorded." : undefined,
      xp: completion.xp_awarded,
    });
  }

  for (const quest of completion.completed_quests ?? []) {
    events.push({
      id: newId(),
      kind: "quest",
      title: "QUEST COMPLETED",
      message: quest.title,
      detail: "Your dedication has been recorded.",
      xp: quest.reward_xp,
    });
  }

  for (const achievement of completion.unlocked_achievements ?? []) {
    events.push({
      id: newId(),
      kind: "achievement",
      title: "ACHIEVEMENT UNLOCKED",
      message: achievement.name,
      detail: achievement.description,
      xp: achievement.reward_xp,
      rarity: achievement.rarity,
      icon: achievement.icon,
    });
  }

  if (completion.level_up) {
    events.push({
      id: newId(),
      kind: "level",
      title: "LEVEL PROGRESSION AVAILABLE",
      message: `You have reached Level ${completion.level}.`,
      detail: "The System has recorded your growth.",
    });
  }

  if (completion.rank_up && completion.rank_before) {
    events.push({
      id: newId(),
      kind: "rank",
      title: "RANK ADVANCEMENT DETECTED",
      message: `${completion.rank_before}-Rank → ${completion.rank}-Rank`,
      detail: "Congratulations, Hunter.",
    });
  }

  return events;
}

interface SystemEventsApi {
  push: (event: Omit<SystemEvent, "id"> & { id?: string }) => void;
  pushAll: (events: SystemEvent[]) => void;
  dismiss: (id: string) => void;
}

const SystemEventsContext = createContext<SystemEventsApi | null>(null);

export function SystemEventsProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setEvents((current) => current.filter((event) => event.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const schedule = useCallback(
    (event: SystemEvent) => {
      const life = event.kind === "rank" || event.kind === "level" ? 8500 : 6200;
      const timer = setTimeout(() => dismiss(event.id), life);
      timers.current.set(event.id, timer);
    },
    [dismiss],
  );

  const push = useCallback(
    (input: Omit<SystemEvent, "id"> & { id?: string }) => {
      const event: SystemEvent = { ...input, id: input.id ?? newId() };
      setEvents((current) => [...current.slice(-3), event]);
      schedule(event);
    },
    [schedule],
  );

  const pushAll = useCallback(
    (incoming: SystemEvent[]) => {
      if (incoming.length === 0) return;
      // Stagger so a five-event streak stays readable instead of a wall.
      incoming.slice(0, 5).forEach((event, index) => {
        setTimeout(() => push(event), index * 420);
      });
    },
    [push],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => clearTimeout(timer));
      map.clear();
    };
  }, []);

  const api = useMemo<SystemEventsApi>(() => ({ push, pushAll, dismiss }), [push, pushAll, dismiss]);

  return (
    <SystemEventsContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-3 top-3 z-[80] flex flex-col items-center gap-2.5 sm:inset-x-auto sm:right-5 sm:top-5 sm:items-end"
        role="status"
        aria-live="polite"
      >
        {events.map((event) => (
          <SystemNotification key={event.id} event={event} onDismiss={() => dismiss(event.id)} />
        ))}
      </div>
    </SystemEventsContext.Provider>
  );
}

export function useSystemEvents(): SystemEventsApi {
  const context = useContext(SystemEventsContext);
  if (!context) {
    throw new Error("useSystemEvents must be used inside SystemEventsProvider");
  }
  return context;
}

function SystemNotification({ event, onDismiss }: { event: SystemEvent; onDismiss: () => void }) {
  const style = KIND_STYLE[event.kind];
  const Icon = (event.icon && ICONS[event.icon]) || style.icon;

  return (
    <div
      className="notif-enter pointer-events-auto w-full max-w-[26rem] overflow-hidden rounded-xl border text-left sm:w-[24rem]"
      style={{
        borderColor: `color-mix(in oklab, ${style.accent} 45%, transparent)`,
        background:
          "linear-gradient(150deg, rgba(12,22,38,0.97) 0%, rgba(6,11,20,0.98) 60%, rgba(9,16,29,0.97) 100%)",
        boxShadow: `0 0 0 1px rgba(4,8,16,0.9), 0 24px 60px -28px ${style.glow}, inset 0 0 40px -28px ${style.accent}`,
      }}
    >
      <div className="relative flex gap-3 p-3.5">
        <span
          className="absolute inset-y-0 left-0 w-[2px]"
          style={{ background: `linear-gradient(180deg, ${style.accent}, transparent)` }}
          aria-hidden
        />
        <div
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          style={{
            background: `color-mix(in oklab, ${style.accent} 16%, transparent)`,
            boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${style.accent} 40%, transparent)`,
            color: event.rarity === "legendary" ? "var(--color-gold)" : style.accent,
          }}
        >
          <Icon size={15} strokeWidth={2.2} aria-hidden />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="hud-label" style={{ color: style.accent, fontSize: "0.55rem" }}>
              [SYSTEM] {style.tag}
            </span>
            {event.rarity ? (
              <span className="text-[0.55rem] uppercase tracking-[0.18em] text-faint">{event.rarity}</span>
            ) : null}
          </div>

          <p className="font-hud mt-1 text-[0.74rem]" style={{ color: style.accent }}>
            {event.title}
          </p>
          <p className="mt-0.5 text-sm text-text">{event.message}</p>
          {event.detail ? <p className="mt-0.5 text-xs text-faint">{event.detail}</p> : null}
        </div>

        <div className="flex flex-col items-end justify-between gap-2">
          {typeof event.xp === "number" && event.xp > 0 ? (
            <span
              className={cn("numeric rounded-md px-1.5 py-0.5 text-[0.68rem] font-semibold")}
              style={{
                color: style.accent,
                background: `color-mix(in oklab, ${style.accent} 14%, transparent)`,
                boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${style.accent} 32%, transparent)`,
              }}
            >
              +{event.xp} XP
            </span>
          ) : null}
          <button
            type="button"
            onClick={onDismiss}
            className="text-[0.6rem] uppercase tracking-[0.18em] text-faint transition-colors hover:text-text"
            aria-label="Dismiss notification"
          >
            close
          </button>
        </div>
      </div>

      <div className="h-[2px] w-full bg-white/5">
        <div
          className="h-full"
          style={{
            background: `linear-gradient(90deg, ${style.accent}, transparent)`,
            animation: "shimmer 6.2s linear forwards",
            width: "100%",
            transformOrigin: "left",
          }}
        />
      </div>
    </div>
  );
}
