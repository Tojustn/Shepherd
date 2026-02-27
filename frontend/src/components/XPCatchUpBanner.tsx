"use client";

import { useEffect, useState } from "react";
import { Zap, X } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface UnreadXPEvent {
  id: number;
  source: string;
  amount: number;
  meta: Record<string, unknown> | null;
  created_at: string;
}

function formatEventLabel(source: string, meta: Record<string, unknown> | null): string {
  if (source === "commit") {
    const repo = meta?.repo as string | undefined;
    const name = repo ? repo.split("/").pop() : undefined;
    return name ? `GitHub commit — ${name}` : "GitHub commit";
  }
  if (source === "leetcode_solve") {
    const diff = meta?.difficulty as string | undefined;
    return diff ? `LeetCode ${diff.charAt(0).toUpperCase() + diff.slice(1)}` : "LeetCode solve";
  }
  if (source === "goal_complete") {
    const kind = meta?.kind as string | undefined;
    if (kind === "daily") return "Daily quest";
    const difficulty = meta?.difficulty as number | undefined;
    if (difficulty) return `Goal ${"★".repeat(difficulty)}`;
    return "Custom goal";
  }
  if (source === "streak_bonus") return "Streak bonus";
  return source.replace(/_/g, " ");
}

function timeAgo(dateStr: string) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "1d ago" : `${days}d ago`;
}

const SOURCE_COLORS: Record<string, string> = {
  commit: "var(--game-accent)",
  leetcode_solve: "#f59e0b",
  goal_complete: "var(--color-quest)",
  streak_bonus: "var(--color-streak)",
};

interface Props {
  token: string | null;
}

export function XPCatchUpBanner({ token }: Props) {
  const [events, setEvents] = useState<UnreadXPEvent[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/events/unread`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: UnreadXPEvent[]) => setEvents(data));
  }, [token]);

  if (dismissed || events.length === 0) return null;

  const totalXP = events.reduce((sum, e) => sum + e.amount, 0);

  function dismiss() {
    setDismissed(true);
    if (!token) return;
    fetch(`${API_URL}/api/events/mark-read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  return (
    <div
      className="rounded-2xl bg-base-100 border-2 border-base-300 p-4 flex flex-col gap-3"
      style={{ boxShadow: "0 5px 0 rgba(0,0,0,0.25)", borderColor: "color-mix(in srgb, var(--game-accent) 40%, var(--color-base-300))" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="rounded-lg p-1.5"
            style={{ backgroundColor: "color-mix(in srgb, var(--game-accent) 20%, transparent)" }}
          >
            <Zap size={14} style={{ color: "var(--game-accent)" }} />
          </div>
          <span className="font-black text-base-content text-sm">While you were away</span>
          <span
            className="font-black font-mono text-xs px-2 py-0.5 rounded-lg"
            style={{ backgroundColor: "color-mix(in srgb, var(--game-accent) 15%, transparent)", color: "var(--game-accent)" }}
          >
            +{totalXP} XP
          </span>
        </div>
        <button
          onClick={dismiss}
          className="p-1 rounded-lg text-base-content/30 hover:text-base-content/70 hover:bg-base-200 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Event list */}
      <div className="flex flex-col gap-1.5">
        {events.map((event) => {
          const color = SOURCE_COLORS[event.source] ?? "var(--game-accent)";
          return (
            <div key={event.id} className="flex items-center gap-3 px-1">
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span
                className="font-black font-mono text-xs shrink-0"
                style={{ color }}
              >
                +{event.amount} XP
              </span>
              <span className="text-sm font-medium text-base-content flex-1 truncate">
                {formatEventLabel(event.source, event.meta)}
              </span>
              <span className="text-xs font-bold text-base-content/30 font-mono shrink-0">
                {timeAgo(event.created_at)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Dismiss */}
      <div className="flex justify-end pt-1">
        <button
          onClick={dismiss}
          className="text-xs font-black px-4 py-1.5 rounded-xl border-2 transition-all hover:opacity-80 active:scale-95"
          style={{
            borderColor: "var(--game-accent)",
            color: "var(--game-accent)",
            backgroundColor: "color-mix(in srgb, var(--game-accent) 10%, transparent)",
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
