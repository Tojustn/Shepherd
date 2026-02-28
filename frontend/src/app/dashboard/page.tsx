"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth";
import { useXPContext } from "@/context/xp";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { XPBar } from "@/components/XPBar";
import { GoalPreviewCard } from "@/components/GoalPreviewCard";
import { StreakCard, StreakInfo } from "@/components/StreakCard";
import { Goal } from "@/components/CreateGoalForm";
import { Zap, Target, Flame, ArrowRight, Code2 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface RecentSolve {
  id: number;
  problem: { leetcode_id: number; title: string; difficulty: string };
  language: string | null;
  confidence: number | null;
  solved_at: string;
  is_imported: boolean;
}

const DIFF_COLORS: Record<string, string> = {
  easy: "#22c55e",
  medium: "#f59e0b",
  hard: "#ef4444",
};

function timeAgo(dateStr: string) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "1d ago" : `${days}d ago`;
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
  const { subscribe, triggerLevelUp } = useXPContext();
  const queryClient = useQueryClient();
  const levelUpFiredRef = useRef(false);

  const { data: user } = useQuery<User>({
    queryKey: ["me"],
    queryFn: async () => {
      const r = await fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    enabled: !!token,
  });

  const { data: allSolves = [] } = useQuery<RecentSolve[]>({
    queryKey: ["leetcode", "solves"],
    queryFn: async () => {
      const r = await fetch(`${API_URL}/api/leetcode/solves`, { headers: { Authorization: `Bearer ${token}` } });
      return r.ok ? r.json() : [];
    },
    enabled: !!token,
  });

  const recentSolves = allSolves.slice(0, 5);

  // Fire level-up animation once when data first arrives
  useEffect(() => {
    if (user?.pending_level_up && !levelUpFiredRef.current) {
      levelUpFiredRef.current = true;
      triggerLevelUp(user.level);
    }
  }, [user?.pending_level_up, user?.level, triggerLevelUp]);

  // Keep cached user XP/level in sync with SSE events
  useEffect(() => {
    return subscribe((event) => {
      queryClient.setQueryData<User>(["me"], (old) =>
        old ? { ...old, xp: event.total_xp, level: event.new_level } : old
      );
    });
  }, [subscribe, queryClient]);

  if (!user) return <p className="p-8 text-base-content/40 font-mono">Loading...</p>;

  const questsDone = user.daily_quests.filter((g) => g.completed || g.current >= g.target).length;
  const questsTotal = user.daily_quests.length;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 flex flex-col gap-8">
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
          <StreakCard label="Leetcode" streak={user.leetcode_streak} />
        </div>

      </div>

      {/* Recent Leetcode */}
      <div className="flex flex-col gap-4">
        <SectionHeader
          icon={<Code2 size={16} />}
          color="#f59e0b"
          label="Recent Leetcode"
          right={
            <Link
              href="/dashboard/leetcode"
              className="flex items-center gap-1 text-sm font-bold text-base-content/40 hover:text-base-content transition-colors"
            >
              View all <ArrowRight size={14} />
            </Link>
          }
        />

        {recentSolves.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-base-content/25">
            <Code2 size={32} />
            <p className="text-sm font-bold">No solves logged yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recentSolves.map((solve) => {
              const diff = solve.problem.difficulty.toLowerCase();
              const color = DIFF_COLORS[diff] ?? "var(--game-accent)";
              return (
                <div
                  key={solve.id}
                  className="rounded-xl bg-base-100 border-2 border-base-300 px-4 py-3 flex items-center gap-3"
                  style={{ boxShadow: "0 3px 0 rgba(0,0,0,0.08)" }}
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="font-black text-sm text-base-content/40 font-mono shrink-0">
                    #{solve.problem.leetcode_id}
                  </span>
                  <span className="font-bold text-sm text-base-content flex-1 truncate">
                    {solve.problem.title}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {solve.language && (
                      <span className="text-xs font-bold text-base-content/40">{solve.language}</span>
                    )}
                    <span
                      className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: color + "22", color, border: `1px solid ${color}55` }}
                    >
                      {diff}
                    </span>

                   
                    <span className="text-xs font-bold text-base-content/30 font-mono">
                      {solve.is_imported ? "imported" : timeAgo(solve.solved_at)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
