"use client";

export interface StreakInfo {
  current: number;
  longest: number;
  last_activity_date: string | null;
}

export function StreakCard({ label, streak }: { label: string; streak: StreakInfo }) {
  return (
    <div
      className="rounded-2xl bg-base-100 p-5 flex flex-col gap-1 border-2 border-base-300"
      style={{ boxShadow: "0 4px 0 rgba(0,0,0,0.12)" }}
    >
      <p className="text-sm font-black uppercase tracking-wider text-base-content/40">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-5xl font-black font-mono" style={{ color: "var(--game-accent)" }}>
          {streak.current}
        </span>
        <span className="text-lg font-bold text-base-content/60">
          day streak
        </span>
      </div>
      <p className="text-sm font-bold text-base-content/35 font-mono">best {streak.longest}d</p>
    </div>
  );
}
