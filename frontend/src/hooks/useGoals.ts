// hooks/useGoals.ts
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/context/auth";
import { Goal } from "@/components/CreateGoalForm";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function authFetch(url: string, token: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
}

export function useGoals() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const { data: dailyGoals = [] } = useQuery<Goal[]>({
    queryKey: ["goals", "daily"],
    queryFn: () => authFetch(`${API_URL}/api/goals/daily`, token!).then((r) => r.json()),
    enabled: !!token,
  });

  const { data: customGoals = [] } = useQuery<Goal[]>({
    queryKey: ["goals", "custom"],
    queryFn: () => authFetch(`${API_URL}/api/goals/`, token!).then((r) => r.json()),
    enabled: !!token,
  });

  useEffect(() => {
    if (!token) return;
    const es = new EventSource(`${API_URL}/api/events/stream?token=${token}`);
    es.addEventListener("goal_updated", () => queryClient.invalidateQueries({ queryKey: ["goals"] }));
    es.addEventListener("goal_created", () => queryClient.invalidateQueries({ queryKey: ["goals", "custom"] }));
    es.addEventListener("goal_deleted", () => queryClient.invalidateQueries({ queryKey: ["goals", "custom"] }));
    return () => es.close();
  }, [token, queryClient]);

  function handleCreated(goal: Goal) {
    queryClient.setQueryData<Goal[]>(["goals", "custom"], (old) => [goal, ...(old ?? [])]);
  }

  return { dailyGoals, customGoals, handleCreated };
}