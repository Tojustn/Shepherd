"use client";

import { CheckCircle, Circle } from "lucide-react";
import { StarRating, GOAL_TYPE_LABELS, Goal } from "@/components/CreateGoalForm";

export function GoalPreviewCard({ goal }: { goal: Goal }) {
  const isCustom = goal.type === "custom";
  const isDone = goal.current >= goal.target;
  const pct = Math.min((goal.current / goal.target) * 100, 100);

  return (
    <div
      className="rounded-2xl bg-base-100 p-4 flex flex-col gap-3 border-2 border-base-300"
      style={{ boxShadow: "0 4px 0 rgba(0,0,0,0.12)" }}
    >
      <div className="flex flex-col gap-1">
        <p className="font-black text-base text-base-content">{goal.label}</p>
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-base-content/40">{GOAL_TYPE_LABELS[goal.type]}</p>
          <StarRating value={goal.difficulty} />
        </div>
      </div>

      {isCustom ? (
        <div className="flex items-center gap-2 text-sm font-bold text-base-content/50">
          {isDone
            ? <CheckCircle size={16} style={{ color: "var(--game-accent)" }} />
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
                backgroundColor: "var(--game-accent)",
                boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.15)",
              }}
            />
          </div>
          <div className="flex justify-between font-mono text-sm font-bold text-base-content/40">
            <span>{goal.current}/{goal.target}</span>
            <span>{Math.round(pct)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
