// hooks/useGoalMutations.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Goal } from "@/components/CreateGoalForm";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function authFetch(url: string, token: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
}

export function useGoalMutations(goalId: number, token: string) {
  const queryClient = useQueryClient();

  function makeOptimistic(updater: (old: Goal[]) => Goal[]) {
    return {
      onMutate: async () => {
        await queryClient.cancelQueries({ queryKey: ["goals", "custom"] });
        const prev = queryClient.getQueryData<Goal[]>(["goals", "custom"]);
        queryClient.setQueryData<Goal[]>(["goals", "custom"], (old) => updater(old ?? []));
        return { prev };
      },
      onError: (_err: unknown, _v: unknown, ctx: { prev?: Goal[] } | undefined) => {
        queryClient.setQueryData(["goals", "custom"], ctx?.prev);
        alert("Something went wrong, changes reverted");
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: ["goals", "custom"] }),
    };
  }

  const complete = useMutation({
    mutationFn: () =>
      authFetch(`${API_URL}/api/goals/${goalId}/complete`, token, { method: "PATCH" }).then((r) => r.json()),
    ...makeOptimistic((old) => old.map((g) => g.id === goalId ? { ...g, completed: true } : g)),
  });

  const increment = useMutation({
    mutationFn: () =>
      authFetch(`${API_URL}/api/goals/${goalId}/increment`, token, { method: "PATCH" }).then((r) => r.json()),
    ...makeOptimistic((old) => old.map((g) => g.id === goalId ? { ...g, current: g.current + 1 } : g)),
  });

  const remove = useMutation({
    mutationFn: () =>
      authFetch(`${API_URL}/api/goals/${goalId}`, token, { method: "DELETE" }),
    ...makeOptimistic((old) => old.filter((g) => g.id !== goalId)),
  });

  return { complete, increment, remove };
}