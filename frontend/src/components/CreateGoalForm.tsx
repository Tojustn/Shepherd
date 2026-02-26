"use client";

import { useState } from "react";
import { Plus, Star } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type GoalType =
  | "commits_daily"
  | "commits_weekly"
  | "leetcode_daily"
  | "leetcode_weekly"
  | "streak_maintain"
  | "custom";

type GoalPeriod = "daily" | "weekly";

export interface Goal {
  id: number;
  type: GoalType;
  period: GoalPeriod;
  target: number;
  current: number;
  difficulty: number;
  label: string;
  active: boolean;
  created_at: string;
}

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  commits_daily: "Commits (Daily)",
  commits_weekly: "Commits (Weekly)",
  leetcode_daily: "LeetCode (Daily)",
  leetcode_weekly: "LeetCode (Weekly)",
  streak_maintain: "Maintain Streak",
  custom: "Custom",
};

const DIFFICULTY_LABELS: Record<number, string> = {
  1: "Easy",
  2: "Medium",
  3: "Hard",
  4: "Expert",
  5: "Legendary",
};

export function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  const interactive = !!onChange;
  const active = hovered > 0 ? hovered : value;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={!interactive}
            onClick={() => onChange?.(star)}
            onMouseEnter={() => interactive && setHovered(star)}
            onMouseLeave={() => interactive && setHovered(0)}
            className={interactive ? "cursor-pointer" : "cursor-default"}
          >
            <Star
              size={14}
              className={
                star <= active
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-base-content/20"
              }
            />
          </button>
        ))}
      </div>
      {interactive && (
        <span className="text-xs text-base-content/50 w-16">
          {DIFFICULTY_LABELS[active] ?? ""}
        </span>
      )}
    </div>
  );
}

export function CreateGoalForm({ token, onCreated }: { token: string; onCreated: (goal: Goal) => void }) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<GoalType>("commits_daily");
  const [target, setTarget] = useState(1);
  const [difficulty, setDifficulty] = useState(1);
  const [loading, setLoading] = useState(false);

  const isCustom = type === "custom";
  const period: GoalPeriod = type.endsWith("weekly") ? "weekly" : "daily";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch(`${API_URL}/api/goals/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ label, type, period, target: isCustom ? 1 : target, difficulty }),
    });
    if (res.ok) {
      const goal = await res.json();
      onCreated(goal);
      setLabel("");
      setTarget(1);
      setDifficulty(1);
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="card bg-base-200 border border-base-300">
      <div className="card-body p-4 gap-3">
        <p className="font-semibold text-sm text-base-content">New Goal</p>
        <input
          required
          placeholder="Label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="input input-bordered input-sm w-full"
        />
        <div className="flex gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as GoalType)}
            className="select select-bordered select-sm flex-1"
          >
            {Object.entries(GOAL_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          {!isCustom && (
            <input
              type="number"
              min={1}
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
              className="input input-bordered input-sm w-24"
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-base-content/50">Difficulty</p>
          <StarRating value={difficulty} onChange={setDifficulty} />
        </div>
        <button type="submit" disabled={loading} className="btn btn-primary btn-sm w-full gap-2 text-white">
          <Plus size={15} />
          {loading ? "Adding..." : "Add Goal"}
        </button>
      </div>
    </form>
  );
}
