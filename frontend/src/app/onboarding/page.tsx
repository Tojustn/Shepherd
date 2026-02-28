// app/onboarding/page.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth";
import { StepDots } from "@/components/onboarding/StepDots";
import { WelcomeStep } from "@/components/onboarding/steps/WelcomeStep";
import { GitHubStep } from "@/components/onboarding/steps/GitHubStep";
import { LeetCodeStep } from "@/components/onboarding/steps/LeetCodeStep";
import { DoneStep } from "@/components/onboarding/steps/DoneStep";
import { OnboardingFooter } from "@/components/onboarding/OnboardingFooter";
import { LCStatus } from "../../components/onboarding/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function OnboardingPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState("");
  const [appInstalled, setAppInstalled] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [lcUsername, setLcUsername] = useState("");
  const [lcStatus, setLcStatus] = useState<LCStatus>("idle");
  const [lcImported, setLcImported] = useState<number | null>(null);
  const [lcSession, setLcSession] = useState("");
  const [showCookieHelp, setShowCookieHelp] = useState(false);
  const [lcImportError, setLcImportError] = useState<string | null>(null);
  const lcDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webhookUrl = `${API_URL}/api/webhooks/github`;

  useEffect(() => {
    if (!token) { router.replace("/"); return; }
    fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((u) => {
        if (u.onboarding_complete) { router.replace("/dashboard"); return; }
        setUsername(u.username ?? "");
        if (u.leetcode_username) { setLcUsername(u.leetcode_username); setLcStatus("valid"); }
      })
      .catch(() => router.replace("/"));
  }, [token, router]);

  useEffect(() => {
    if (!lcUsername.trim()) { setLcStatus("idle"); return; }
    setLcStatus("validating");
    if (lcDebounceRef.current) clearTimeout(lcDebounceRef.current);
    lcDebounceRef.current = setTimeout(async () => {
      if (!token) return;
      const res = await fetch(
        `${API_URL}/api/leetcode/validate-username?username=${encodeURIComponent(lcUsername.trim())}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setLcStatus(data.valid ? "valid" : "invalid");
      } else {
        setLcStatus("idle");
      }
    }, 600);
    return () => { if (lcDebounceRef.current) clearTimeout(lcDebounceRef.current); };
  }, [lcUsername, token]);

  async function saveLcAndImport() {
    if (!token || lcStatus !== "valid") return;
    setLcStatus("importing");
    setLcImportError(null);
    await fetch(`${API_URL}/api/auth/profile`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ leetcode_username: lcUsername.trim() }),
    });
    const res = await fetch(`${API_URL}/api/leetcode/import`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ session_cookie: lcSession.trim() || null }),
    });
    if (res.ok) {
      const data = await res.json();
      setLcImported(data.imported ?? 0);
      setLcStatus("done");
      setStep(3);
    } else {
      const err = await res.json().catch(() => ({}));
      setLcImportError(err.detail ?? "Import failed. Check your session cookie and try again.");
      setLcStatus("valid");
    }
  }

  async function complete() {
    if (!token || completing) return;
    setCompleting(true);
    await fetch(`${API_URL}/api/auth/complete-onboarding`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    router.replace("/dashboard");
  }

  return (
    <div className="min-h-screen bg-base-200 flex flex-col items-center justify-center px-4 py-12">
      <div className="mb-10">
        <span className="font-mono text-2xl font-black tracking-tight">
          <span className="text-base-content/25">&lt;</span>
          Shepherd
          <span className="text-base-content/25">&gt;</span>
        </span>
      </div>

      <div
        className="w-full max-w-lg rounded-3xl bg-base-100 border-2 border-base-300 flex flex-col overflow-hidden"
        style={{ boxShadow: "0 8px 0 rgba(0,0,0,0.15)" }}
      >
        <div className="px-8 pt-8 pb-6 flex flex-col gap-6 border-b border-base-300">
          <StepDots step={step} />
        </div>

        <div className="px-8 py-8 flex flex-col gap-6 flex-1">
          {step === 0 && <WelcomeStep username={username} />}
          {step === 1 && <GitHubStep webhookUrl={webhookUrl} appInstalled={appInstalled} setAppInstalled={setAppInstalled} />}
          {step === 2 && (
            <LeetCodeStep
              lcUsername={lcUsername}
              setLcUsername={(v) => { setLcUsername(v); setLcImported(null); setLcImportError(null); }}
              lcStatus={lcStatus}
              lcSession={lcSession}
              setLcSession={setLcSession}
              showCookieHelp={showCookieHelp}
              setShowCookieHelp={setShowCookieHelp}
              lcImportError={lcImportError}
              setLcImportError={setLcImportError}
            />
          )}
          {step === 3 && <DoneStep lcImported={lcImported} />}
        </div>

        <OnboardingFooter
          step={step}
          appInstalled={appInstalled}
          lcStatus={lcStatus}
          completing={completing}
          onBack={() => setStep((s) => s - 1)}
          onNext={() => setStep((s) => s + 1)}
          onImport={saveLcAndImport}
          onComplete={complete}
        />
      </div>

      {step === 1 && (
        <button onClick={() => setStep(2)} className="mt-5 text-xs font-bold text-base-content/25 hover:text-base-content/50 transition-colors">
          Skip for now
        </button>
      )}
      {step === 2 && (
        <button
          onClick={() => setStep(3)}
          disabled={lcStatus === "importing"}
          className="mt-5 text-xs font-bold text-base-content/25 hover:text-base-content/50 transition-colors disabled:opacity-40"
        >
          Skip for now
        </button>
      )}
    </div>
  );
}