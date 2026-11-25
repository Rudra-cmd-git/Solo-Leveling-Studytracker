import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ChartNoAxesColumn,
  ChevronRight,
  Crown,
  Flame,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Timer,
  Trophy,
  Users,
} from "lucide-react";
import { Panel } from "@/components/system/panel";
import { RankBadge } from "@/components/system/rank-badge";
import { StatBar } from "@/components/system/meter";
import { HunterAvatar } from "@/components/system/hunter-avatar";
import { RANKS } from "@/lib/progression";
import { formatNumber } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getLeaderboard } from "@/lib/data/leaderboard";
import { getOptionalHunter } from "@/lib/auth";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: Timer,
    title: "Server-verified focus timer",
    body: "Start, pause, resume and complete sessions. Credited time is derived from server timestamps, so your progress is real.",
  },
  {
    icon: ScrollText,
    title: "Daily, weekly, special quests",
    body: "Deterministic quest rules generate fresh objectives each period. Progress updates from the study you actually do.",
  },
  {
    icon: Crown,
    title: "Seven hunter ranks",
    body: "F through S rank is earned on lifetime XP — never bought, never randomly assigned, never editable.",
  },
  {
    icon: BookOpen,
    title: "Any syllabus",
    body: "Create your own subjects, chapters and topics. Nothing is hardcoded to a single exam or board.",
  },
  {
    icon: ChartNoAxesColumn,
    title: "Analytics that mean something",
    body: "Daily consistency, subject distribution and XP curves computed in the database from your own records.",
  },
  {
    icon: ShieldCheck,
    title: "Private by default choices",
    body: "Control whether your profile is public and whether you appear on the leaderboard. Your email is never exposed.",
  },
];

const STEPS = [
  { step: "01", title: "Awaken", body: "Register and receive a Hunter ID. You begin at Level 1, F-Rank." },
  { step: "02", title: "Build your field", body: "Add the subjects and topics you actually study." },
  { step: "03", title: "Clear sessions", body: "Run the focus timer. Every credited minute is one XP." },
  { step: "04", title: "Ascend", body: "Complete quests, unlock achievements, climb the global board." },
];

export default async function LandingPage() {
  const { user } = await getOptionalHunter();

  let topHunters: Awaited<ReturnType<typeof getLeaderboard>>["rows"] = [];
  if (isSupabaseConfigured) {
    try {
      const board = await getLeaderboard({ period: "all", pageSize: 5 });
      topHunters = board.rows;
    } catch {
      topHunters = [];
    }
  }

  return (
    <div className="relative">
      <header className="mx-auto flex w-full max-w-[86rem] items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-cyan/30 bg-[radial-gradient(circle_at_30%_20%,rgba(56,225,255,0.35),transparent_60%)]"
            aria-hidden
          >
            <Sparkles size={15} className="text-cyan" />
          </span>
          <span className="leading-tight">
            <span className="font-hud block text-[0.84rem] text-text">Hunter System</span>
            <span className="block text-[0.55rem] uppercase tracking-[0.3em] text-faint">Study Protocol</span>
          </span>
        </Link>

        <nav className="flex items-center gap-2">
          <Link href="/leaderboard" className="hidden px-2 text-sm text-muted transition-colors hover:text-text sm:block">
            Leaderboard
          </Link>
          {user ? (
            <Link href="/dashboard" className="btn btn-primary px-4 py-2 text-sm">
              Enter the System <ArrowRight size={14} aria-hidden />
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost px-3.5 py-2 text-sm">
                Sign in
              </Link>
              <Link href="/signup" className="btn btn-primary px-4 py-2 text-sm">
                Awaken <ArrowRight size={14} aria-hidden />
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto grid w-full max-w-[86rem] items-center gap-8 px-4 pb-10 pt-6 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:pb-16 lg:pt-12">
        <div className="animate-rise-slow">
          <p className="inline-flex items-center gap-2 rounded-full border border-cyan/25 bg-cyan/8 px-3 py-1 text-[0.6rem] uppercase tracking-[0.24em] text-cyan">
            <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-cyan" aria-hidden />
            Awakening protocol available
          </p>

          <h1 className="hero-title mt-5 text-[2.6rem] text-text sm:text-6xl lg:text-[4.2rem]">
            Every hour you
            <br />
            study is a <span className="glow-text">raid.</span>
          </h1>

          <p className="mt-5 max-w-xl text-[0.95rem] leading-relaxed text-muted">
            Hunter System turns focused study into progression. Run verified focus sessions, clear daily quests,
            earn experience, and climb from F-Rank to S-Rank on a global leaderboard of real hunters.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href={user ? "/dashboard" : "/signup"} className="btn btn-primary px-5 py-3">
              {user ? "Return to your status window" : "Begin your awakening"}
              <ChevronRight size={15} aria-hidden />
            </Link>
            <Link href="/leaderboard" className="btn btn-ghost px-4 py-3">
              <Trophy size={15} aria-hidden /> View rankings
            </Link>
          </div>

          <dl className="mt-9 grid max-w-lg grid-cols-3 gap-3">
            {[
              { label: "Ranks", value: "7" },
              { label: "XP per minute", value: "1" },
              { label: "Cost to start", value: "₹0" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-line/60 bg-white/[0.02] px-3 py-2.5">
                <dt className="hud-label">{item.label}</dt>
                <dd className="numeric mt-1 text-lg text-text">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Decorative System window */}
        <div className="relative">
          <div className="pointer-events-none absolute inset-0 rounded-[2rem] bg-[radial-gradient(circle_at_60%_40%,rgba(56,225,255,0.12),transparent_65%)] sm:-inset-6" aria-hidden />
          <Panel glow className="animate-float overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-line/60 px-4 py-2.5">
              <span className="hud-label" style={{ color: "var(--color-cyan)" }}>
                [SYSTEM] STATUS WINDOW
              </span>
              <span className="flex gap-1" aria-hidden>
                <span className="h-1.5 w-1.5 rounded-full bg-cyan/70" />
                <span className="h-1.5 w-1.5 rounded-full bg-violet/70" />
                <span className="h-1.5 w-1.5 rounded-full bg-gold/70" />
              </span>
            </div>

            <div className="space-y-3 p-4">
              <div className="flex items-center gap-3">
                <HunterAvatar username="Hunter" rank="C" size={46} />
                <div className="min-w-0 flex-1">
                  <p className="font-hud text-sm text-text">Hunter Record</p>
                  <p className="text-[0.62rem] uppercase tracking-[0.2em] text-faint">ID · H-XXXXXXXX</p>
                </div>
                <RankBadge rank="C" size="md" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-line/60 bg-black/25 p-2.5">
                  <p className="hud-label">Level</p>
                  <p className="numeric mt-1 text-lg text-text glow-text">12</p>
                </div>
                <div className="rounded-lg border border-line/60 bg-black/25 p-2.5">
                  <p className="hud-label">Study hours</p>
                  <p className="numeric mt-1 text-lg text-text">34.5</p>
                </div>
              </div>

              <StatBar value={620} max={1000} label="XP to next level" rightLabel="620 / 1000" />

              <div className="space-y-1.5 rounded-lg border border-line/50 bg-black/25 p-2.5">
                {[
                  { text: "SESSION RECORDED · 45 minutes", tone: "text-cyan" },
                  { text: "QUEST COMPLETED · One Hour Forged", tone: "text-violet" },
                  { text: "LEVEL PROGRESSION AVAILABLE", tone: "text-mint" },
                ].map((line) => (
                  <p key={line.text} className={`font-mono text-[0.62rem] tracking-[0.06em] ${line.tone}`}>
                    <span className="text-faint">›</span> {line.text}
                  </p>
                ))}
              </div>
            </div>
          </Panel>
        </div>
      </section>

      {/* Live board */}
      {topHunters.length > 0 ? (
        <section className="mx-auto w-full max-w-[86rem] px-4 pb-12 sm:px-6">
          <Panel quiet className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="hud-label flex items-center gap-1.5">
                <Trophy size={12} aria-hidden /> Live top hunters
              </p>
              <Link href="/leaderboard" className="text-[0.62rem] uppercase tracking-[0.18em] text-cyan/80 hover:text-cyan">
                Full board
              </Link>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {topHunters.map((hunter) => (
                <li key={hunter.user_id}>
                  <Link
                    href={`/hunters/${hunter.username}`}
                    className="flex items-center gap-2.5 rounded-lg border border-line/50 bg-white/[0.02] px-2.5 py-2 transition-colors hover:border-cyan/35"
                  >
                    <span className="numeric w-5 text-center text-xs text-faint">{hunter.rank_position}</span>
                    <HunterAvatar
                      username={hunter.username}
                      avatarUrl={hunter.avatar_url}
                      rank={hunter.hunter_rank}
                      size={30}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-text">{hunter.username}</span>
                      <span className="numeric block text-[0.6rem] text-faint">{formatNumber(hunter.period_xp)} XP</span>
                    </span>
                    <RankBadge rank={hunter.hunter_rank} size="sm" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </section>
      ) : null}

      {/* How it works */}
      <section className="mx-auto w-full max-w-[86rem] px-4 pb-14 sm:px-6">
        <h2 className="font-hud text-sm text-cyan/90">The cycle</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <div key={step.step} className="rounded-xl border border-line/60 bg-white/[0.02] p-4">
              <p className="numeric text-[0.62rem] text-cyan/70">{step.step}</p>
              <p className="font-hud mt-2 text-[0.8rem] text-text">{step.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Rank ladder */}
      <section className="mx-auto w-full max-w-[86rem] px-4 pb-14 sm:px-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-hud text-sm text-cyan/90">The rank ladder</h2>
            <p className="mt-1 text-xs text-faint">Rank follows lifetime XP only. Thresholds are configurable in the database.</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {RANKS.map((rank) => (
            <div
              key={rank.code}
              className="rounded-xl border border-line/60 bg-white/[0.02] p-3.5 transition-colors hover:border-cyan/25"
            >
              <div className="flex items-center justify-between">
                <RankBadge rank={rank.code} size="md" />
                <span className="numeric text-[0.62rem] text-faint">{formatNumber(rank.minXp)}</span>
              </div>
              <p className="mt-2 text-[0.72rem] text-text">{rank.blurb}</p>
              <p className="text-[0.62rem] uppercase tracking-[0.16em] text-faint">{rank.name}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-[86rem] px-4 pb-14 sm:px-6">
        <h2 className="font-hud text-sm text-cyan/90">Built like a system, not a spreadsheet</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <Panel key={feature.title} quiet className="p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-md border border-cyan/25 bg-cyan/8 text-cyan">
                  <Icon size={15} aria-hidden />
                </span>
                <p className="font-hud mt-3 text-[0.78rem] text-text">{feature.title}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">{feature.body}</p>
              </Panel>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-[86rem] px-4 pb-16 sm:px-6">
        <Panel glow className="relative overflow-hidden p-6 text-center sm:p-10">
          <span
            className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(ellipse_at_top,rgba(56,225,255,0.20),transparent_70%)]"
            aria-hidden
          />
          <p className="hud-label" style={{ color: "var(--color-cyan)" }}>
            [SYSTEM]
          </p>
          <h2 className="hero-title mt-3 text-3xl text-text sm:text-4xl">The System is waiting.</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted">
            Free to join. No paid tiers, no ads, no streak shaming. Just your focus, measured honestly, turned into
            progression.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href={user ? "/study" : "/signup"} className="btn btn-primary px-6 py-3">
              {user ? "Start a session" : "Awaken now"} <ArrowRight size={15} aria-hidden />
            </Link>
            <Link href="/leaderboard" className="btn btn-ghost px-5 py-3">
              <Users size={15} aria-hidden /> Meet the hunters
            </Link>
          </div>
        </Panel>
      </section>

      <footer className="border-t border-line/50 px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-[86rem] flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-[0.68rem] text-faint">
            Hunter System · original design inspired by progression-RPG interfaces. Not affiliated with any published work.
          </p>
          <div className="flex items-center gap-4 text-[0.68rem] text-faint">
            <Link href="/leaderboard" className="hover:text-text">
              Leaderboard
            </Link>
            <Link href="/login" className="hover:text-text">
              Sign in
            </Link>
            <Link href="/signup" className="hover:text-text">
              Awaken
            </Link>
            <span className="inline-flex items-center gap-1">
              <Flame size={11} className="text-gold" aria-hidden /> Free forever tier
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
