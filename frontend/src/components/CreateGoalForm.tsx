"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type GoalType = "daily_commit" | "daily_leetcode" | "custom";

export interface Goal {
  id: number;
  type: GoalType;
  target: number;
  current: number;
  label: string;
  active: boolean;
  goal_date: string | null;
  created_at: string;
  completed: boolean;
  completed_at: string | null;
}

export function CreateGoalForm({ token, onCreated }: { token: string; onCreated: (goal: Goal) => void }) {
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState(1);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch(`${API_URL}/api/goals/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ label, target }),
    });
    if (res.ok) {
      const goal = await res.json();
      onCreated(goal);
      setLabel("");
      setTarget(1);
    }
    setLoading(false);
  }

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
        <div className="flex items-center gap-2">
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
        <button type="submit" disabled={loading} className="btn btn-primary btn-sm w-full gap-2 text-white">
          <Plus size={15} />
          {loading ? "Adding..." : "Add Goal"}
        </button>
      </div>
    </form>
  );
}
