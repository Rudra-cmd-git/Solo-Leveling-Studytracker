"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Search, UserMinus, UserPlus, X } from "lucide-react";
import { removeFriendAction, requestHunterAction, respondFriendRequestAction } from "@/app/actions/social";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { HunterAvatar } from "@/components/system/hunter-avatar";
import { RankBadge } from "@/components/system/rank-badge";
import { Panel, PanelHeader } from "@/components/system/panel";
import { formatNumber } from "@/lib/format";
import type { FriendRequests, FriendRow, HunterSearchRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const RELATIONSHIP_LABEL: Record<string, string> = {
  self: "You",
  friend: "In your roster",
  outgoing: "Request sent",
  incoming: "Wants to join",
  none: "",
};

export function FriendsManager({
  friends,
  requests,
}: {
  friends: FriendRow[];
  requests: FriendRequests;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [term, setTerm] = useState("");
  const [results, setResults] = useState<HunterSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const query = term.trim();
    if (query.length < 2) return;

    const ticket = ++requestId.current;

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const supabase = createBrowserSupabase();
        const { data, error: searchError } = await supabase.rpc("search_hunters", {
          p_query: query,
          p_limit: 8,
        });
        if (ticket !== requestId.current) return;
        setResults(searchError ? [] : ((data ?? []) as HunterSearchRow[]));
      } catch {
        if (ticket === requestId.current) setResults([]);
      } finally {
        if (ticket === requestId.current) setSearching(false);
      }
    }, 320);

    return () => clearTimeout(timer);
  }, [term]);

  function onTermChange(value: string) {
    setTerm(value);
    if (value.trim().length < 2) {
      setResults([]);
      setSearching(false);
    }
  }

  function reset() {
    setNotice(null);
    setError(null);
  }

  async function add(handle: string) {
    reset();
    setBusyId(handle);
    try {
      const result = await requestHunterAction(handle);
      if (result.status === "error") setError(result.message ?? "The System refused that request.");
      else setNotice(result.message ?? "Request sent.");
      startTransition(() => router.refresh());
    } finally {
      setBusyId(null);
    }
  }

  async function respond(userId: string, accept: boolean) {
    reset();
    setBusyId(userId);
    try {
      const result = await respondFriendRequestAction(userId, accept);
      if (result.status === "error") setError(result.message ?? "The System refused that request.");
      else setNotice(result.message ?? "Done.");
      startTransition(() => router.refresh());
    } finally {
      setBusyId(null);
    }
  }

  async function unfriend(userId: string) {
    reset();
    setBusyId(userId);
    try {
      const result = await removeFriendAction(userId);
      if (result.status === "error") setError(result.message ?? "The System refused that request.");
      else setNotice(result.message ?? "Removed.");
      startTransition(() => router.refresh());
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {notice ? (
        <p className="flex items-center gap-2 rounded-lg border border-mint/35 bg-mint/10 px-3 py-2 text-xs text-mint">
          <Check size={13} aria-hidden /> {notice}
        </p>
      ) : null}
      {error ? (
        <p className="flex items-center gap-2 rounded-lg border border-ember/35 bg-ember/10 px-3 py-2 text-xs text-ember">
          <X size={13} aria-hidden /> {error}
        </p>
      ) : null}

      <Panel className="p-4 sm:p-5">
        <PanelHeader
          title="Recruit a hunter"
          subtitle="Search the registry by handle. Requests become mutual once accepted."
          icon={<Search size={14} />}
        />

        <div className="relative mt-3">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
          <input
            value={term}
            onChange={(event) => onTermChange(event.target.value)}
            placeholder="Search hunter handle…"
            aria-label="Search hunters"
            className="field !pl-8"
            maxLength={20}
            autoComplete="off"
          />
          {searching ? (
            <Loader2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-faint" aria-hidden />
          ) : null}
        </div>

        {term.trim().length >= 2 ? (
          <ul className="mt-2 divide-y divide-line/30 overflow-hidden rounded-lg border border-line/50">
            {results.length === 0 && !searching ? (
              <li className="px-3 py-3 text-xs text-faint">No public hunter matches that handle.</li>
            ) : null}
            {results.map((hunter) => (
              <li key={hunter.user_id} className="flex items-center gap-2.5 bg-black/20 px-3 py-2">
                <HunterAvatar username={hunter.username} avatarUrl={hunter.avatar_url} rank={hunter.hunter_rank} size={28} ring={false} />
                <div className="min-w-0 flex-1">
                  <Link href={`/hunters/${hunter.username}`} className="truncate text-xs text-text hover:text-cyan">
                    {hunter.username}
                  </Link>
                  <p className="numeric text-[0.6rem] text-faint">
                    LV {hunter.level} · {formatNumber(hunter.xp_total)} XP
                  </p>
                </div>
                <RankBadge rank={hunter.hunter_rank} size="sm" />
                {hunter.relationship === "none" ? (
                  <button
                    type="button"
                    onClick={() => void add(hunter.username)}
                    disabled={busyId === hunter.username}
                    className="btn px-2.5 py-1 text-[0.62rem]"
                  >
                    {busyId === hunter.username ? (
                      <Loader2 size={11} className="animate-spin" aria-hidden />
                    ) : (
                      <UserPlus size={11} aria-hidden />
                    )}
                    Add
                  </button>
                ) : (
                  <span className="text-[0.6rem] uppercase tracking-[0.14em] text-faint">
                    {RELATIONSHIP_LABEL[hunter.relationship]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      {requests.incoming.length > 0 ? (
        <Panel glow className="p-4 sm:p-5">
          <PanelHeader
            title="Incoming requests"
            subtitle={`${requests.incoming.length} hunter${requests.incoming.length === 1 ? "" : "s"} waiting`}
            icon={<UserPlus size={14} />}
          />
          <ul className="mt-3 space-y-2">
            {requests.incoming.map((hunter) => (
              <li
                key={hunter.user_id}
                className="flex flex-wrap items-center gap-2.5 rounded-lg border border-line/50 bg-black/25 px-3 py-2"
              >
                <HunterAvatar username={hunter.username} avatarUrl={hunter.avatar_url} rank={hunter.hunter_rank} size={30} />
                <div className="min-w-0 flex-1">
                  <Link href={`/hunters/${hunter.username}`} className="truncate text-xs text-text hover:text-cyan">
                    {hunter.username}
                  </Link>
                  <p className="numeric text-[0.6rem] text-faint">
                    LV {hunter.level} · {formatNumber(hunter.xp_total)} XP
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => void respond(hunter.user_id, true)}
                    disabled={busyId === hunter.user_id}
                    className="btn px-2.5 py-1 text-[0.62rem]"
                  >
                    {busyId === hunter.user_id ? (
                      <Loader2 size={11} className="animate-spin" aria-hidden />
                    ) : (
                      <Check size={11} aria-hidden />
                    )}
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => void respond(hunter.user_id, false)}
                    disabled={busyId === hunter.user_id}
                    className="btn btn-ghost px-2.5 py-1 text-[0.62rem]"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel className="p-4 sm:p-5">
        <PanelHeader
          title="Your roster"
          subtitle={friends.length === 0 ? "No hunters yet" : `${friends.length} hunter${friends.length === 1 ? "" : "s"}`}
          icon={<UserPlus size={14} />}
        />

        {friends.length === 0 ? (
          <p className="mt-3 rounded-lg border border-line/50 bg-black/20 px-3 py-6 text-center text-xs text-faint">
            Search for a hunter above to build your roster.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {friends.map((friend) => (
              <li
                key={friend.user_id}
                className="flex flex-wrap items-center gap-2.5 rounded-lg border border-line/50 bg-black/20 px-3 py-2"
              >
                <HunterAvatar username={friend.username} avatarUrl={friend.avatar_url} rank={friend.hunter_rank} size={30} />
                <div className="min-w-0 flex-1">
                  <Link href={`/hunters/${friend.username}`} className="truncate text-xs text-text hover:text-cyan">
                    {friend.username}
                  </Link>
                  <p className="numeric text-[0.6rem] text-faint">
                    LV {friend.level} · {formatNumber(friend.xp_total)} XP · {friend.current_streak}d streak
                  </p>
                </div>
                <RankBadge rank={friend.hunter_rank} size="sm" />
                <button
                  type="button"
                  onClick={() => void unfriend(friend.user_id)}
                  disabled={busyId === friend.user_id}
                  className="btn btn-ghost px-2.5 py-1 text-[0.62rem] text-ember"
                >
                  {busyId === friend.user_id ? (
                    <Loader2 size={11} className="animate-spin" aria-hidden />
                  ) : (
                    <UserMinus size={11} aria-hidden />
                  )}
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {requests.outgoing.length > 0 ? (
          <div className="mt-4 rounded-lg border border-line/40 bg-black/15 p-3">
            <p className="hud-label">Pending · {requests.outgoing.length}</p>
            <ul className="mt-1.5 space-y-1">
              {requests.outgoing.map((hunter) => (
                <li key={hunter.user_id} className="flex items-center justify-between gap-2 text-[0.68rem] text-muted">
                  <span className="truncate">{hunter.username}</span>
                  <button
                    type="button"
                    onClick={() => void unfriend(hunter.user_id)}
                    disabled={busyId === hunter.user_id}
                    className="text-[0.6rem] uppercase tracking-[0.14em] text-faint hover:text-ember"
                  >
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {pending ? (
          <p className={cn("mt-3 flex items-center gap-1.5 text-[0.62rem] text-faint")}>
            <Loader2 size={11} className="animate-spin" aria-hidden /> Synchronising with the System…
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
