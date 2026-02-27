"use client";

import { useEffect, useRef } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface XPEvent {
  amount: number;
  source: string;
  level_up: boolean;
  new_level: number;
  total_xp: number;
}

export function formatXPSource(source: string, meta?: Record<string, unknown> | null): string {
  if (source === "commit") {
    const repo = meta?.repo as string | undefined;
    const name = repo ? repo.split("/").pop() : undefined;
    return name ? `GitHub — ${name}` : "GitHub commit";
  }
  if (source === "leetcode_solve") {
    const diff = meta?.difficulty as string | undefined;
    return diff ? `LeetCode ${diff.charAt(0).toUpperCase() + diff.slice(1)}` : "LeetCode";
  }
  if (source === "goal_complete") {
    const kind = meta?.kind as string | undefined;
    return kind === "daily" ? "Daily quest" : "Goal complete";
  }
  if (source === "streak_bonus") return "Streak bonus";
  return source.replace(/_/g, " ");
}

export function useXPEvents(
  token: string | null,
  onXP: (event: XPEvent) => void,
) {
  const onXPRef = useRef(onXP);
  onXPRef.current = onXP;

  useEffect(() => {
    if (!token) return;

    const es = new EventSource(`${API_URL}/api/events/stream?token=${token}`);

    es.addEventListener("xp_gained", (e: MessageEvent) => {
      onXPRef.current(JSON.parse(e.data) as XPEvent);
    });

    // EventSource auto-reconnects on error — no manual handling needed
    return () => es.close();
  }, [token]);
}
