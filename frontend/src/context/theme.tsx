"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
type Accent = "blue" | "orange";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  accent: Accent;
  toggleAccent: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const ACCENT_COLORS: Record<Accent, string> = {
  blue: "#3b82f6",
  orange: "#f97316",
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [accent, setAccent] = useState<Accent>("blue");

  useEffect(() => {
    const storedTheme = localStorage.getItem("theme") as Theme | null;
    if (storedTheme === "light" || storedTheme === "dark") {
      setTheme(storedTheme);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
    }

    const storedAccent = localStorage.getItem("accent") as Accent | null;
    if (storedAccent === "blue" || storedAccent === "orange") {
      setAccent(storedAccent);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--game-accent", ACCENT_COLORS[accent]);
    localStorage.setItem("accent", accent);
  }, [accent]);

  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));
  const toggleAccent = () => setAccent((a) => (a === "blue" ? "orange" : "blue"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, accent, toggleAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
