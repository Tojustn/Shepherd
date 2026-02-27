"use client";

import { Flame, Github, Code2 } from "lucide-react";

export interface StreakInfo {
  current: number;
  longest: number;
  last_activity_date: string | null;
}

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  GitHub: <Github size={14} />,
  LeetCode: <Code2 size={14} />,
};

function formatDate(iso: string | null): string {
  if (!iso) return "No activity yet";
  const d = new Date(iso);
  const today = new Date();
  const diffDays = Math.floor((today.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "Active today";
  if (diffDays === 1) return "Active yesterday";
  return `Last active ${diffDays}d ago`;
}

export function StreakCard({ label, streak }: { label: string; streak: StreakInfo }) {
  const isAlive = streak.current > 0;
  const c = "var(--color-streak)";

  return (
    <div
      className="rounded-2xl bg-base-100 p-5 flex flex-col gap-4 border-2 border-base-300"
      style={{
        backgroundColor: isAlive ? `color-mix(in srgb, ${c} 10%, transparent)` : undefined,
        boxShadow: isAlive
          ? `0 5px 0 color-mix(in srgb, ${c} 40%, #000)`
          : "0 5px 0 rgba(0,0,0,0.3)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-base-content/50 text-sm font-black uppercase tracking-wider">
          {PLATFORM_ICONS[label]}
          {label}
        </div>
        {isAlive && (
          <span
            className="text-xs font-black px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `color-mix(in srgb, ${c} 20%, transparent)`, color: c }}
          >
            On fire
          </span>
        )}
      </div>

      {/* Big number */}
      <div className="flex items-center gap-3">
        {isAlive && <Flame size={44} style={{ color: c }} className="shrink-0" />}
        <div className="flex items-baseline gap-1.5">
          <span
            className="text-6xl font-black font-mono leading-none"
            style={{ color: isAlive ? c : undefined }}
          >
            {streak.current}
          </span>
          <span className="text-base font-bold text-base-content/50">day streak</span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs font-bold font-mono text-base-content/40">
        <span>best {streak.longest}d</span>
        <span>{formatDate(streak.last_activity_date)}</span>
      </div>
    </div>
  );
}
