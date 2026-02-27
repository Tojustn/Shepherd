"use client";

import { useState } from "react";
import { Plus, Star } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type GoalType = "daily_commit" | "daily_leetcode" | "custom";

export interface Goal {
  id: number;
  type: GoalType;
  target: number;
  current: number;
  label: string;
  difficulty: number;
  active: boolean;
  goal_date: string | null;
  created_at: string;
  completed: boolean;
  completed_at: string | null;
}

export const DIFFICULTY_XP: Record<number, number> = { 1: 20, 2: 35, 3: 50, 4: 75, 5: 100 };

export function CreateGoalForm({ token, onCreated }: { token: string; onCreated: (goal: Goal) => void }) {
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState(1);
  const [difficulty, setDifficulty] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch(`${API_URL}/api/goals/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ label, target, difficulty }),
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

  const displayStars = hovered || difficulty;

  return (
    <form onSubmit={handleSubmit} className="card bg-base-200 border border-base-300">
      <div className="card-body p-4 gap-3">
        <p className="font-semibold text-sm text-base-content">New Goal</p>
        <input
          required
          placeholder="What do you want to accomplish?"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="input input-bordered input-sm w-full"
        />
        <div className="flex items-center gap-3">
          <label className="text-xs text-base-content/50 whitespace-nowrap">Target</label>
          <input
            type="number"
            min={1}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            className="input input-bordered input-sm w-24"
          />
          <span className="text-xs text-base-content/40">
            {target === 1 ? "checkbox" : `${target} times`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-base-content/50 whitespace-nowrap">Difficulty</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setDifficulty(star)}
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
                className="p-0.5 transition-transform hover:scale-110"
              >
                <Star
                  size={16}
                  fill={star <= displayStars ? "var(--game-accent)" : "transparent"}
                  strokeWidth={1.5}
                  style={{ color: star <= displayStars ? "var(--game-accent)" : "oklch(var(--bc)/0.2)" }}
                />
              </button>
            ))}
          </div>
          <span className="text-xs font-bold" style={{ color: "var(--game-accent)" }}>
            +{DIFFICULTY_XP[difficulty]} XP
          </span>
        </div>
        <button type="submit" disabled={loading} className="btn btn-primary btn-sm w-full gap-2 text-white">
          <Plus size={15} />
          {loading ? "Adding..." : "Add Goal"}
        </button>
      </div>
    </form>
  );
}
