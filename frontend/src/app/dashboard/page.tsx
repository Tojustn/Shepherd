"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface StreakInfo {
  current: number;
  longest: number;
  last_activity_date: string | null;
}

interface User {
  id: number;
  username: string;
  avatar_url: string | null;
  xp: number;
  level: number;
  xp_current_level: number;
  xp_next_level: number;
  github_streak: StreakInfo;
  leetcode_streak: StreakInfo;
}

function XPBar({ xp, xpCurrentLevel, xpNextLevel, level }: {
  xp: number;
  xpCurrentLevel: number;
  xpNextLevel: number;
  level: number;
}) {
  const progress = xp - xpCurrentLevel;
  const range = xpNextLevel - xpCurrentLevel;
  const pct = Math.min((progress / range) * 100, 100);

  return (
    <div className="w-full max-w-sm">
      <div className="mb-1 flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <span>Level {level}</span>
        <span>{progress} / {range} XP</span>
      </div>
      <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className="h-2 rounded-full bg-black dark:bg-white transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-right text-xs text-zinc-400 dark:text-zinc-500">
        {xpNextLevel - xp} XP to level {level + 1}
      </p>
    </div>
  );
}

function StreakCard({ label, streak }: { label: string; streak: StreakInfo }) {
  const pct = Math.min((streak.current / 7) * 100, 100);

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">best {streak.longest}</p>
      </div>
      <div className="flex items-center gap-3">
        <p className="text-3xl font-bold text-black dark:text-white w-12 shrink-0">
          {streak.current}
          <span className="text-base font-normal text-zinc-400 dark:text-zinc-500">d</span>
        </p>
        <div className="flex-1 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-2 rounded-full bg-black dark:bg-white transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 w-8 text-right shrink-0">7d</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { token } = useAuth();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setUser);
  }, [token]);

  if (!user) return <p className="p-8 text-zinc-500 dark:text-zinc-400">Loading...</p>;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 flex flex-col gap-8">
      <div className="flex items-center gap-4">
        {user.avatar_url && (
          <img src={user.avatar_url} alt={user.username} className="h-14 w-14 rounded-full" />
        )}
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold text-black dark:text-white">{user.username}</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{user.xp} total XP</p>
        </div>
      </div>

      <XPBar
        xp={user.xp}
        xpCurrentLevel={user.xp_current_level}
        xpNextLevel={user.xp_next_level}
        level={user.level}
      />

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Streaks</h2>
        <div className="grid grid-cols-2 gap-3">
          <StreakCard label="GitHub commits" streak={user.github_streak} />
          <StreakCard label="LeetCode solves" streak={user.leetcode_streak} />
        </div>
      </div>
    </div>
  );
}
