"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth";
import { Loading } from "@/components/Loading";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function AuthCallbackInner() {
  const router = useRouter();
  const { refreshToken } = useAuth();

  useEffect(() => {
    // Token is now set as a cookie by the backend redirect — no URL exposure.
    refreshToken();

    const token = document.cookie
      .split("; ")
      .find((row) => row.startsWith("auth_token="))
      ?.split("=")[1];

    if (!token) { router.replace("/"); return; }

    fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((user) => router.replace(user.onboarding_complete ? "/dashboard" : "/onboarding"))
      .catch(() => router.replace("/dashboard"));
  }, []);

  return <Loading />;
}

export default function AuthCallback() {
  return (
    <Suspense fallback={<Loading />}>
      <AuthCallbackInner />
    </Suspense>
  );
}
