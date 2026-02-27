"use client";

import { useEffect } from "react";
import { Trash2, Plus, CheckCircle, Circle, Zap, Target, ListTodo } from "lucide-react";
import { useAuth } from "@/context/auth";
import { CreateGoalForm, Goal } from "@/components/CreateGoalForm";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CustomGoalCard } from "@/components/goals/CustomGoallCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function authFetch(url: string, token: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
}

function DailyQuestCard({ goal }: { goal: Goal }) {
  const isDone = goal.completed || goal.current >= goal.target;
  const q = "var(--color-quest)";

  return (
    <div
      className="rounded-2xl bg-base-100 border-2 border-base-300 px-4 py-3 flex items-center gap-4"
      style={{
        backgroundColor: `color-mix(in srgb, ${q} 7%, transparent)`,
        boxShadow: `0 5px 0 color-mix(in srgb, ${q} 30%, rgba(0,0,0,0.35))`,
        opacity: isDone ? 0.75 : 1,
      }}
    >
      {isDone
        ? <CheckCircle size={22} style={{ color: q, flexShrink: 0 }} />
        : <Circle size={22} className="text-base-content/20 shrink-0" />
      }
      <div className="flex-1 min-w-0">
        <p className={`font-black text-base ${isDone ? "line-through text-base-content/40" : "text-base-content"}`}>
          {goal.label}
        </p>
        <p className="text-xs font-bold mt-0.5" style={{ color: q, opacity: 0.8 }}>+30 XP</p>
      </div>
      <span
        className="badge badge-sm gap-1 font-black shrink-0"
        style={{ backgroundColor: `color-mix(in srgb, ${q} 20%, transparent)`, color: q }}
      >
        <Zap size={10} />
        Auto
      </span>
    </div>
  );
}



export default function GoalsPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const { data: dailyGoals = [] } = useQuery({
    queryKey: ["goals", "daily"],
    queryFn: () =>
      authFetch(`${API_URL}/api/goals/daily`, token!).then((r) => r.json()),
    enabled: !!token,
  });

  const { data: customGoals = [] } = useQuery({
    queryKey: ["goals", "custom"],
    queryFn: () =>
      authFetch(`${API_URL}/api/goals/`, token!).then((r) => r.json()),
    enabled: !!token,
  });

  useEffect(() => {
    if (!token) return;
    const es = new EventSource(`${API_URL}/api/events/stream?token=${token}`);
    es.addEventListener("goal_updated", () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    });
    es.addEventListener("goal_created", () => {
      queryClient.invalidateQueries({ queryKey: ["goals", "custom"] });
    });
    es.addEventListener("goal_deleted", () => {
      queryClient.invalidateQueries({ queryKey: ["goals", "custom"] });
    });
    return () => es.close();
  }, [token, queryClient]);

  function handleCreated(goal: Goal) {
    queryClient.setQueryData<Goal[]>(["goals", "custom"], (old) => [goal, ...(old ?? [])]);
  }

  const questsDone = dailyGoals.filter((g: Goal) => g.completed || g.current >= g.target).length;
  const allDone = dailyGoals.length > 0 && questsDone === dailyGoals.length;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="rounded-lg p-1.5" style={{ backgroundColor: "color-mix(in srgb, var(--color-quest) 20%, transparent)" }}>
            <Zap size={16} style={{ color: "var(--color-quest)" }} />
          </div>
          <h2 className="text-xl font-black text-base-content">Daily Quests</h2>
        </div>

        {dailyGoals.length > 0 && (
          <div
            className="rounded-xl px-4 py-3 flex items-center justify-between border-2 border-base-300"
            style={{
              backgroundColor: allDone ? "color-mix(in srgb, var(--color-quest) 10%, transparent)" : undefined,
              borderColor: allDone ? "color-mix(in srgb, var(--color-quest) 50%, transparent)" : undefined,
              boxShadow: "0 3px 0 rgba(0,0,0,0.1)",
            }}
          >
            <div className="flex items-center gap-2">
              {allDone
                ? <CheckCircle size={15} style={{ color: "var(--color-quest)" }} />
                : <Circle size={15} className="text-base-content/30" />
              }
              <span className="text-sm font-black text-base-content">
                {allDone ? "All done for today!" : `${questsDone} of ${dailyGoals.length} complete`}
              </span>
            </div>
            <span className="font-mono text-sm font-bold" style={{ color: "var(--color-quest)" }}>
              +{questsDone * 30} XP
            </span>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {dailyGoals.map((goal: Goal) => (
            <DailyQuestCard key={goal.id} goal={goal} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg p-1.5" style={{ backgroundColor: "color-mix(in srgb, var(--game-accent) 20%, transparent)" }}>
              <Target size={16} style={{ color: "var(--game-accent)" }} />
            </div>
            <h2 className="text-xl font-black text-base-content">My Goals</h2>
          </div>
          <button
            onClick={() => queryClient.setQueryData(["goals", "showForm"], (v: boolean) => !v)}
            className="btn btn-sm gap-2 font-black text-white border-none"
            style={{
              backgroundColor: "var(--game-accent)",
              boxShadow: "0 4px 0 color-mix(in srgb, var(--game-accent) 50%, #000)",
            }}
          >
            <Plus size={14} />
            New Goal
          </button>
        </div>

        {token && <CreateGoalForm token={token} onCreated={handleCreated} />}

        {customGoals.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-base-content/30">
            <ListTodo size={36} />
            <div className="flex flex-col items-center gap-1">
              <p className="font-black text-sm">No goals yet</p>
              <p className="text-xs font-semibold">Add a goal to start earning +20 XP per completion.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {customGoals.map((goal: Goal) => (
              <CustomGoalCard key={goal.id} goal={goal} token={token!} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}