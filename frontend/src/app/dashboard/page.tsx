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
import { Zap, Target, Flame, ArrowRight } from "lucide-react";

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
  daily_quests: Goal[];
  pending_level_up: boolean;
}

function SectionHeader({ icon, color, label, right }: { icon: React.ReactNode; color: string; label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="rounded-lg p-1.5" style={{ backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)` }}>
          <div style={{ color }}>{icon}</div>
        </div>
        <h2 className="text-xl font-black text-base-content">{label}</h2>
      </div>
      {right}
    </div>
  );
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

  const questsDone = user.daily_quests.filter((g) => g.completed || g.current >= g.target).length;
  const questsTotal = user.daily_quests.length;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 flex flex-col gap-8">
      <XPToast toasts={toasts} />
      {showLevelUp && (
        <LevelUpBanner level={user.level} onDismiss={() => setShowLevelUp(false)} />
      )}

      {/* Profile card */}
      <div
        className="rounded-2xl bg-base-100 p-5 flex items-center gap-5 border-2 border-base-300"
        style={{ boxShadow: "0 5px 0 rgba(0,0,0,0.25)" }}
      >
        {user.avatar_url && (
          <img
            src={user.avatar_url}
            alt={user.username}
            className="h-16 w-16 rounded-full border-4 shrink-0"
            style={{ borderColor: "var(--game-accent)" }}
          />
        )}
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-base-content">{user.username}</h1>
            <span
              className="font-black font-mono text-sm px-2.5 py-1 rounded-lg"
              style={{ backgroundColor: "color-mix(in srgb, var(--game-accent) 15%, transparent)", color: "var(--game-accent)" }}
            >
              LVL {user.level}
            </span>
          </div>
          <XPBar
            xp={user.xp}
            xpCurrentLevel={user.xp_current_level}
            xpNextLevel={user.xp_next_level}
            level={user.level}
          />
        </div>

        {/* Daily quest mini-stat */}
        {questsTotal > 0 && (
          <div className="hidden sm:flex flex-col items-center gap-1 shrink-0 px-5 border-l-2 border-base-300">
            <Zap size={18} style={{ color: "var(--color-quest)" }} />
            <span
              className="font-mono text-3xl font-black leading-none"
              style={{ color: questsDone === questsTotal ? "var(--color-quest)" : undefined }}
            >
              {questsDone}/{questsTotal}
            </span>
            <span className="text-xs font-bold text-base-content/40">quests</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 items-start">

        {/* Goals */}
        <div className="flex flex-col gap-4">
          <SectionHeader
            icon={<Target size={16} />}
            color="var(--game-accent)"
            label="Goals"
            right={
              <Link
                href="/dashboard/goals"
                className="flex items-center gap-1 text-sm font-bold text-base-content/40 hover:text-base-content transition-colors"
              >
                View all <ArrowRight size={14} />
              </Link>
            }
          />

          {user.daily_quests.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-black text-base-content/40 uppercase tracking-wide flex items-center gap-1">
                <Zap size={11} style={{ color: "var(--color-quest)" }} /> Daily Quests
              </p>
              {user.daily_quests.map((goal) => <GoalPreviewCard key={goal.id} goal={goal} />)}
            </div>
          )}

          {user.recent_goals.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-black text-base-content/40 uppercase tracking-wide">My Goals</p>
              {user.recent_goals.map((goal) => <GoalPreviewCard key={goal.id} goal={goal} />)}
            </div>
          )}

          {user.daily_quests.length === 0 && user.recent_goals.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-base-content/25">
              <Target size={32} />
              <p className="text-sm font-bold">No goals yet.</p>
            </div>
          )}
        </div>

        {/* Streaks */}
        <div className="flex flex-col gap-4">
          <SectionHeader
            icon={<Flame size={16} />}
            color="var(--color-streak)"
            label="Streaks"
          />
          <StreakCard label="GitHub" streak={user.github_streak} />
          <StreakCard label="LeetCode" streak={user.leetcode_streak} />
        </div>

      </div>
    </div>
  );
}
