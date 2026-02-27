// components/goals/CustomGoalCard.tsx
"use client";

import { CheckCircle, Circle, Trash2 } from "lucide-react";
import { Goal } from "@/components/CreateGoalForm";
import { useGoalMutations } from "@/hooks/useGoalMutations";

export function CustomGoalCard({ goal, token }: { goal: Goal; token: string }) {
  const { complete, increment, remove } = useGoalMutations(goal.id, token);
  const isCheckbox = goal.target === 1;
  const isDone = goal.completed || goal.current >= goal.target;
  const pct = Math.min((goal.current / goal.target) * 100, 100);
  const a = "var(--game-accent)";

  return (
    <div
      className="rounded-2xl bg-base-100 border-2 border-base-300 p-4 flex flex-col gap-3"
      style={{
        boxShadow: `0 5px 0 color-mix(in srgb, ${a} 30%, rgba(0,0,0,0.35))`,
        opacity: isDone ? 0.7 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={`font-black text-base ${isDone ? "line-through text-base-content/40" : "text-base-content"}`}>
            {goal.label}
          </p>
          <p className="text-xs font-bold mt-0.5" style={{ color: a, opacity: 0.8 }}>+20 XP</p>
        </div>
        <button
          onClick={() => remove.mutate(undefined)}
          className="btn btn-ghost btn-xs text-base-content/25 hover:text-error shrink-0"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {isCheckbox ? (
        <button
          onClick={() => complete.mutate(undefined)}
          disabled={isDone}
          className="flex items-center gap-2 text-sm font-bold text-base-content/50 disabled:opacity-50 w-fit"
        >
          {isDone
            ? <CheckCircle size={16} style={{ color: a }} />
            : <Circle size={16} />
          }
          {isDone ? "Completed" : "Mark as done"}
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="h-4 w-full rounded-full bg-base-200 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                backgroundColor: a,
                boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.2)",
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm font-bold text-base-content/40">
              {goal.current} / {goal.target}
            </span>
            {!isDone ? (
              <button
                onClick={() => increment.mutate(undefined)}
                className="btn btn-xs font-black"
                style={{ backgroundColor: a, color: "#fff", boxShadow: `0 3px 0 color-mix(in srgb, ${a} 50%, #000)` }}
              >
                +1
              </button>
            ) : (
              <span className="text-xs font-black" style={{ color: a }}>Done!</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}