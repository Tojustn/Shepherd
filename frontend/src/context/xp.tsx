"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/auth";
import { showXPToast } from "@/components/XPToast";
import { formatXPSource } from "@/hooks/useXPEvents";
import { LevelUpBanner } from "@/components/LevelUpBanner";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface XPEvent {
  amount: number;
  source: string;
  level_up: boolean;
  new_level: number;
  total_xp: number;
  meta?: Record<string, unknown> | null;
}

type XPListener = (event: XPEvent) => void;

interface XPContextValue {
  subscribe: (fn: XPListener) => () => void;
  triggerLevelUp: (level: number) => void;
}

const XPContext = createContext<XPContextValue>({
  subscribe: () => () => {},
  triggerLevelUp: () => {},
});

export function XPProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [levelUpLevel, setLevelUpLevel] = useState<number | null>(null);
  const listeners = useRef<Set<XPListener>>(new Set());

  const triggerLevelUp = useCallback((level: number) => {
    setLevelUpLevel(level);
  }, []);

  const subscribe = useCallback((fn: XPListener) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  useEffect(() => {
    if (!token) return;

    const es = new EventSource(`${API_URL}/api/events/stream?token=${token}`);

    es.addEventListener("xp_gained", (e: MessageEvent) => {
      const event = JSON.parse(e.data) as XPEvent;
      showXPToast(event.amount, formatXPSource(event.source, event.meta));
      if (event.level_up) setLevelUpLevel(event.new_level);
      listeners.current.forEach((fn) => fn(event));
    });

    return () => es.close();
  }, [token]);

  function handleDismiss() {
    setLevelUpLevel(null);
    if (!token) return;
    fetch(`${API_URL}/api/auth/clear-level-up`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  return (
    <XPContext.Provider value={{ subscribe, triggerLevelUp }}>
      {children}
      {levelUpLevel !== null && (
        <LevelUpBanner level={levelUpLevel} onDismiss={handleDismiss} />
      )}
    </XPContext.Provider>
  );
}

export function useXPContext() {
  return useContext(XPContext);
}
