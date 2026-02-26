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

const SOURCE_LABELS: Record<string, string> = {
  commit:         "GitHub commit",
  leetcode_solve: "LeetCode",
  goal_complete:  "Goal complete",
  streak_bonus:   "Streak bonus",
};

export function formatXPSource(source: string): string {
  return SOURCE_LABELS[source] ?? source;
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
