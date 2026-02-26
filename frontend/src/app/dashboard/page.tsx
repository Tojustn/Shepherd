"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth";
import { LevelUpBanner } from "@/components/LevelUpBanner";
import { XPBar } from "@/components/XPBar";
import { GoalPreviewCard } from "@/components/GoalPreviewCard";
import { StreakCard, StreakInfo } from "@/components/StreakCard";
import { Goal } from "@/components/CreateGoalForm";
import { XPToast, XPToastItem } from "@/components/XPToast";
import { useXPEvents, formatXPSource } from "@/hooks/useXPEvents";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
  recent_goals: Goal[];
  pending_level_up: boolean;
}

export default function Dashboard() {
  const { token } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [toasts, setToasts] = useState<XPToastItem[]>([]);
  const toastId = useRef(0);

  useXPEvents(token, (event) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, amount: event.amount, source: formatXPSource(event.source) }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2800);

    setUser((u) => u ? { ...u, xp: event.total_xp, level: event.new_level } : u);
    if (event.level_up) setShowLevelUp(true);
  });

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: User) => {
        setUser(data);
        if (data.pending_level_up) {
          setShowLevelUp(true);
          fetch(`${API_URL}/api/auth/clear-level-up`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      });
  }, [token]);

  if (!user) return <p className="p-8 text-base-content/40 font-mono">Loading...</p>;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 flex flex-col gap-10">
      <XPToast toasts={toasts} />
      {showLevelUp && (
        <LevelUpBanner level={user.level} onDismiss={() => setShowLevelUp(false)} />
      )}

      {/* Header */}
      <div
        className="rounded-2xl bg-base-100 p-5 flex items-center gap-5 border-2 border-base-300"
        style={{ boxShadow: "0 4px 0 rgba(0,0,0,0.12)" }}
      >
        {user.avatar_url && (
          <img
            src={user.avatar_url}
            alt={user.username}
            className="h-16 w-16 rounded-full border-4"
            style={{ borderColor: "var(--game-accent)" }}
          />
        )}
        <div className="flex flex-col gap-2 flex-1">
          <h1 className="text-2xl font-black text-base-content">{user.username}</h1>
          <XPBar
            xp={user.xp}
            xpCurrentLevel={user.xp_current_level}
            xpNextLevel={user.xp_next_level}
            level={user.level}
          />
        </div>
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-6 items-start">

        {/* Goals */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-base-content">Goals</h2>
            <Link
              href="/dashboard/goals"
              className="text-sm font-bold transition-colors text-base-content/40 hover:text-base-content"
            >
              View all →
            </Link>
          </div>
          {user.recent_goals.length === 0 ? (
            <p className="text-sm font-bold text-base-content/40">No goals yet.</p>
          ) : (
            user.recent_goals.map((goal) => <GoalPreviewCard key={goal.id} goal={goal} />)
          )}
        </div>

        {/* Streaks */}
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-black text-base-content">Streaks</h2>
          <StreakCard label="GitHub" streak={user.github_streak} />
          <StreakCard label="LeetCode" streak={user.leetcode_streak} />
        </div>

      </div>
    </div>
  );
}
