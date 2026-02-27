"use client";

import { CheckCircle, Circle, Zap } from "lucide-react";
import { Goal } from "@/components/CreateGoalForm";

export function GoalPreviewCard({ goal }: { goal: Goal }) {
  const isDaily = goal.type === "daily_commit" || goal.type === "daily_leetcode";
  const isDone = goal.completed || goal.current >= goal.target;
  const pct = Math.min((goal.current / goal.target) * 100, 100);
  const accent = isDaily ? "var(--color-quest)" : "var(--game-accent)";

  return (
    <div
      className="rounded-2xl bg-base-100 border-2 border-base-300 p-4 flex flex-col gap-3"
      style={{ boxShadow: `0 5px 0 color-mix(in srgb, ${accent} 40%, rgba(0,0,0,0.35))` }}
    >
        <div className="flex items-start justify-between gap-2">
          <p className={`font-black text-base ${isDone ? "line-through text-base-content/40" : "text-base-content"}`}>
            {goal.label}
          </p>
          {isDaily && (
            <span
              className="badge badge-sm gap-1 font-bold shrink-0"
              style={{ backgroundColor: `color-mix(in srgb, var(--color-quest) 20%, transparent)`, color: "var(--color-quest)" }}
            >
              <Zap size={10} />
              Daily
            </span>
          )}
        </div>

        {goal.target === 1 ? (
          <div className="flex items-center gap-2 text-sm font-bold text-base-content/50">
            {isDone
              ? <CheckCircle size={16} style={{ color: accent }} />
              : <Circle size={16} />
            }
            {isDone ? "Completed" : "In progress"}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="h-4 w-full rounded-full bg-base-200 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  backgroundColor: accent,
                  boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.2)",
                }}
              />
            </div>
            <div className="flex justify-between font-mono text-xs font-bold text-base-content/40">
              <span>{goal.current}/{goal.target}</span>
              <span>{Math.round(pct)}%</span>
            </div>
          </div>
        )}
    </div>
  );
}
