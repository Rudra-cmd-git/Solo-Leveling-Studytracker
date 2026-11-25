import Link from "next/link";
import { ArrowRight, Sparkles, Trophy } from "lucide-react";
import { getOptionalHunter } from "@/lib/auth";

export async function PublicHeader() {
  const { user } = await getOptionalHunter();

  return (
    <header className="border-b border-line/50 bg-[#050a12]/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[86rem] items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan/30 bg-[radial-gradient(circle_at_30%_20%,rgba(56,225,255,0.35),transparent_60%)]"
            aria-hidden
          >
            <Sparkles size={14} className="text-cyan" />
          </span>
          <span className="leading-tight">
            <span className="font-hud block text-[0.78rem] text-text">Hunter System</span>
            <span className="block text-[0.52rem] uppercase tracking-[0.3em] text-faint">Study Protocol</span>
          </span>
        </Link>

        <nav className="flex items-center gap-2">
          <Link
            href="/leaderboard"
            className="hidden items-center gap-1.5 px-2 text-xs text-muted transition-colors hover:text-text sm:inline-flex"
          >
            <Trophy size={12} aria-hidden /> Leaderboard
          </Link>
          {user ? (
            <Link href="/dashboard" className="btn btn-primary px-3.5 py-1.5 text-xs">
              Status window <ArrowRight size={12} aria-hidden />
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost px-3 py-1.5 text-xs">
                Sign in
              </Link>
              <Link href="/signup" className="btn btn-primary px-3.5 py-1.5 text-xs">
                Awaken
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
