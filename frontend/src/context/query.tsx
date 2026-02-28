// context/query.tsx
"use client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: (count, error) => {
          if (error instanceof Error && error.message === "401") return false;
          return count < 2;
        },
      },
    },
  }))
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}