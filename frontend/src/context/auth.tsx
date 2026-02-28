"use client";

import { createContext, useContext, useEffect, useState } from "react";

interface AuthContextValue {
  token: string | null;
  isAuthenticated: boolean;
  logout: () => void;
  refreshToken: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getTokenFromCookie(): string | null {
  return (
    document.cookie
      .split("; ")
      .find((row) => row.startsWith("auth_token="))
      ?.split("=")[1] ?? null
  );
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

function clearAuthCookie() {
  document.cookie = "auth_token=; path=/; max-age=0";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const stored = getTokenFromCookie();
    if (stored && !isTokenExpired(stored)) {
      setToken(stored);
    } else if (stored) {
      clearAuthCookie();
    }
  }, []);

  // Check expiry every 30s so mid-session expiry is caught
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => {
      if (isTokenExpired(token)) {
        clearAuthCookie();
        setToken(null);
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [token]);

  function refreshToken() {
    const stored = getTokenFromCookie();
    if (stored && !isTokenExpired(stored)) {
      setToken(stored);
    }
  }

  function logout() {
    clearAuthCookie();
    setToken(null);
  }

  return (
    <AuthContext.Provider value={{ token, isAuthenticated: !!token, logout, refreshToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
