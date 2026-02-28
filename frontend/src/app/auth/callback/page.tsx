"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/auth";
import { Loading } from "@/components/Loading";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function AuthCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const { refreshToken } = useAuth();

  useEffect(() => {
    const token = params.get("token");
    if (!token) { router.replace("/"); return; }

    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `auth_token=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax${secure}`;
    refreshToken();

    fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((user) => router.replace(user.onboarding_complete ? "/dashboard" : "/onboarding"))
      .catch(() => router.replace("/dashboard"));
  }, []);

  return <Loading />;
}
