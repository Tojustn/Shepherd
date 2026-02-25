"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/auth";
import { Loading } from "@/components/Loading";

export default function AuthCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const { refreshToken } = useAuth();

  useEffect(() => {
    const token = params.get("token");

    if (token) {
      document.cookie = `auth_token=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
      refreshToken();
    }

    router.replace("/dashboard");
  }, []);

  return <Loading />;
}
