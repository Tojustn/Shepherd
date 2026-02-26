"use client";

import { useEffect, useState } from "react";

export function XPBar({ xp, xpCurrentLevel, xpNextLevel, level }: {
  xp: number;
  xpCurrentLevel: number;
  xpNextLevel: number;
  level: number;
}) {
  const progress = xp - xpCurrentLevel;
  const range = xpNextLevel - xpCurrentLevel;
  const pct = Math.min(Math.round((progress / range) * 100), 100);

  const [animPct, setAnimPct] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setAnimPct(pct), 80);
    return () => clearTimeout(t);
  }, [pct]);

  return (
    <div className="flex items-center gap-4 w-full">
      <div
        className="radial-progress shrink-0"
        style={{
          "--value": animPct,
          "--size": "6rem",
          "--thickness": "6px",
          color: "var(--game-accent)",
          filter: "drop-shadow(0 0 8px color-mix(in srgb, var(--game-accent) 55%, transparent))",
        } as React.CSSProperties}
        role="progressbar"
        aria-valuenow={animPct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className="flex flex-col items-center leading-none gap-0.5">
          <span className="text-[11px] font-mono font-bold text-base-content/50 uppercase tracking-widest">LVL</span>
          <span className="text-2xl font-mono font-bold" style={{ color: "var(--game-accent)" }}>{level}</span>
        </span>
      </div>

      <div className="flex flex-col gap-1 min-w-0">
        <p className="font-mono text-base font-bold text-base-content">{progress.toLocaleString()} XP</p>
        <p className="font-mono text-sm font-semibold text-base-content/50">{(xpNextLevel - xp).toLocaleString()} to level {level + 1}</p>
        <p className="font-mono text-sm text-base-content/40">{pct}% complete</p>
      </div>
    </div>
  );
}
