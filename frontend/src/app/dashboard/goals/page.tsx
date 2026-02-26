"use client";

import { useEffect, useState } from "react";
import { Trash2, Plus, CheckCircle, Circle } from "lucide-react";
import { useAuth } from "@/context/auth";
import { CreateGoalForm, StarRating, Goal, GOAL_TYPE_LABELS } from "@/components/CreateGoalForm";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function GoalCard({ goal, token, onDelete, onUpdate }: {
  goal: Goal;
  token: string;
  onDelete: (id: number) => void;
  onUpdate: (goal: Goal) => void;
}) {
  const isCustom = goal.type === "custom";
  const isDone = goal.current >= goal.target;
  const pct = Math.min((goal.current / goal.target) * 100, 100);

  async function handleComplete() {
    const res = await fetch(`${API_URL}/api/goals/${goal.id}/complete`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) onUpdate(await res.json());
  }

  return (
    <div
      className="rounded-2xl bg-base-100 p-4 flex flex-col gap-3 border-2 border-base-300"
      style={{ boxShadow: "0 4px 0 rgba(0,0,0,0.12)" }}
    >
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <p className="font-black text-base text-base-content">{goal.label}</p>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-base-content/40">{GOAL_TYPE_LABELS[goal.type]}</p>
              <StarRating value={goal.difficulty} />
            </div>
          </div>
          <button
            onClick={() => onDelete(goal.id)}
            className="btn btn-ghost btn-xs text-base-content/25 hover:text-error"
          >
            <Trash2 size={15} />
          </button>
        </div>

        {isCustom ? (
          <button
            onClick={handleComplete}
            disabled={isDone}
            className="flex items-center gap-2 text-sm font-bold text-base-content/50 disabled:opacity-50 w-fit"
          >
            {isDone
              ? <CheckCircle size={16} style={{ color: "var(--game-accent)" }} />
              : <Circle size={16} />
            }
            {isDone ? "Completed" : "Mark as done"}
          </button>
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
              <span>{goal.current} / {goal.target}</span>
              <span>{Math.round(pct)}%</span>
            </div>
          </div>
        )}
    </div>
  );
}

export default function GoalsPage() {
  const { token } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/goals/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setGoals);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const es = new EventSource(`${API_URL}/api/events/stream?token=${token}`);
    es.addEventListener("goal_updated", (e) => {
      const updated: Goal = JSON.parse(e.data);
      setGoals((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    });
    es.addEventListener("goal_created", (e) => {
      const created: Goal = JSON.parse(e.data);
      setGoals((prev) => [created, ...prev.filter((g) => g.id !== created.id)]);
    });
    es.addEventListener("goal_deleted", (e) => {
      const { id } = JSON.parse(e.data);
      setGoals((prev) => prev.filter((g) => g.id !== id));
    });
    return () => es.close();
  }, [token]);

  async function handleDelete(id: number) {
    await fetch(`${API_URL}/api/goals/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }

  function handleCreated(goal: Goal) {
    setGoals((prev) => [goal, ...prev]);
    setShowForm(false);
  }

  function handleUpdate(updated: Goal) {
    setGoals((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-base-content">Goals</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn btn-sm gap-2 font-black text-white border-none border-b-4"
          style={{
            backgroundColor: "var(--game-accent)",
            boxShadow: "0 4px 0 color-mix(in srgb, var(--game-accent) 50%, #000)",
          }}
        >
          <Plus size={14} />
          New Goal
        </button>
      </div>

      {showForm && token && (
        <CreateGoalForm token={token} onCreated={handleCreated} />
      )}

      {goals.length === 0 && !showForm ? (
        <p className="text-sm font-semibold text-base-content/40">No goals yet. Add one to get started.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} token={token!} onDelete={handleDelete} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
