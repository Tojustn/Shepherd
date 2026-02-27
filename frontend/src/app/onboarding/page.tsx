"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth";
import { GitBranch, Target, Code2, Flame, ExternalLink, Check, Copy, ChevronRight } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const GITHUB_APP_NAME = process.env.NEXT_PUBLIC_GITHUB_APP_NAME ?? "";

const FEATURES = [
  { icon: GitBranch, label: "Commit graph", desc: "Interactive branch visualizer for every repo" },
  { icon: Code2,     label: "LeetCode log", desc: "Track solves, code, and confidence over time" },
  { icon: Target,    label: "Goals",        desc: "Daily quests and custom goals earn XP" },
  { icon: Flame,     label: "Streaks",      desc: "GitHub and LeetCode streaks with multipliers" },
];

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div
            className="h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all duration-300"
            style={
              i < step
                ? { backgroundColor: "var(--game-accent)", borderColor: "var(--game-accent)" }
                : i === step
                ? { borderColor: "var(--game-accent)", backgroundColor: "transparent" }
                : { borderColor: "rgba(var(--bc), 0.15)", backgroundColor: "transparent" }
            }
          >
            {i < step ? (
              <Check size={14} style={{ color: "white" }} strokeWidth={3} />
            ) : (
              <span
                className="text-xs font-black font-mono"
                style={{ color: i === step ? "var(--game-accent)" : "rgba(var(--bc), 0.3)" }}
              >
                {i + 1}
              </span>
            )}
          </div>
          {i < 2 && (
            <div
              className="h-px w-8 transition-all duration-500"
              style={{ backgroundColor: i < step ? "var(--game-accent)" : "rgba(var(--bc), 0.12)" }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={handleCopy}
      className="shrink-0 p-1.5 rounded-lg transition-colors"
      style={{ color: copied ? "var(--game-accent)" : "rgba(var(--bc), 0.4)" }}
      title="Copy"
    >
      {copied ? <Check size={13} strokeWidth={3} /> : <Copy size={13} />}
    </button>
  );
}

export default function OnboardingPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState("");
  const [appInstalled, setAppInstalled] = useState(false);
  const [completing, setCompleting] = useState(false);

  const webhookUrl = `${API_URL}/api/webhooks/github`;

  useEffect(() => {
    if (!token) { router.replace("/"); return; }
    fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((u) => {
        if (u.onboarding_complete) { router.replace("/dashboard"); return; }
        setUsername(u.username ?? "");
      })
      .catch(() => router.replace("/"));
  }, [token, router]);

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
      {/* Logo */}
      <div className="mb-10">
        <span className="font-mono text-2xl font-black tracking-tight">
          <span className="text-base-content/25">&lt;</span>
          Shepherd
          <span className="text-base-content/25">&gt;</span>
        </span>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-lg rounded-3xl bg-base-100 border-2 border-base-300 flex flex-col overflow-hidden"
        style={{ boxShadow: "0 8px 0 rgba(0,0,0,0.15)" }}
      >
        {/* Top bar */}
        <div className="px-8 pt-8 pb-6 flex flex-col gap-6 border-b border-base-300">
          <StepDots step={step} />
        </div>

        {/* Step content */}
        <div className="px-8 py-8 flex flex-col gap-6 flex-1">

          {/* Step 0 — Welcome */}
          {step === 0 && (
            <>
              <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-black text-base-content leading-tight">
                  Hey, {username || "there"}.
                </h1>
                <p className="text-base font-semibold text-base-content/50">
                  Welcome to your developer command center. Let&apos;s get you set up in two quick steps.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {FEATURES.map(({ icon: Icon, label, desc }) => (
                  <div
                    key={label}
                    className="rounded-2xl border-2 border-base-300 p-4 flex flex-col gap-2"
                    style={{ backgroundColor: "color-mix(in srgb, var(--game-accent) 4%, transparent)" }}
                  >
                    <div
                      className="h-8 w-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: "color-mix(in srgb, var(--game-accent) 15%, transparent)" }}
                    >
                      <Icon size={16} style={{ color: "var(--game-accent)" }} />
                    </div>
                    <div>
                      <p className="font-black text-sm text-base-content">{label}</p>
                      <p className="text-xs font-semibold text-base-content/40 leading-snug mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Step 1 — GitHub Webhooks */}
          {step === 1 && (
            <>
              <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-black text-base-content">Enable commit tracking</h2>
                <p className="text-sm font-semibold text-base-content/50">
                  Shepherd listens for GitHub push events to award XP, update streaks, and tick your daily quest automatically.
                </p>
              </div>

              {/* GitHub App install */}
              {GITHUB_APP_NAME ? (
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-black uppercase tracking-wider text-base-content/40">Recommended</p>
                  <a
                    href={`https://github.com/apps/${GITHUB_APP_NAME}/installations/new`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setAppInstalled(true)}
                    className="flex items-center justify-between gap-3 rounded-2xl border-2 px-5 py-4 transition-all hover:-translate-y-0.5"
                    style={{
                      borderColor: "var(--game-accent)",
                      backgroundColor: "color-mix(in srgb, var(--game-accent) 8%, transparent)",
                      boxShadow: "0 4px 0 color-mix(in srgb, var(--game-accent) 30%, rgba(0,0,0,0.2))",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <GitBranch size={20} style={{ color: "var(--game-accent)" }} />
                      <div>
                        <p className="font-black text-sm text-base-content">Install GitHub App</p>
                        <p className="text-xs font-semibold text-base-content/40">Automatically sets up webhooks on your repos</p>
                      </div>
                    </div>
                    <ExternalLink size={14} className="text-base-content/30 shrink-0" />
                  </a>
                </div>
              ) : null}

              {/* Manual webhook */}
              <div className="flex flex-col gap-3">
                {GITHUB_APP_NAME && (
                  <div className="flex items-center gap-3 text-base-content/25">
                    <div className="h-px flex-1 bg-base-300" />
                    <span className="text-xs font-black uppercase tracking-wider">or set up manually</span>
                    <div className="h-px flex-1 bg-base-300" />
                  </div>
                )}
                <p className="text-xs font-black uppercase tracking-wider text-base-content/40">Manual webhook</p>
                <div className="rounded-2xl border-2 border-base-300 p-4 flex flex-col gap-3">
                  <p className="text-xs font-semibold text-base-content/50">
                    In any repo, go to <span className="font-black text-base-content/70">Settings → Webhooks → Add webhook</span> and use these values:
                  </p>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 rounded-xl bg-base-200 px-3 py-2">
                      <span className="text-xs font-black text-base-content/40 shrink-0 w-16">URL</span>
                      <span className="font-mono text-xs text-base-content flex-1 truncate">{webhookUrl}</span>
                      <CopyButton text={webhookUrl} />
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-base-200 px-3 py-2">
                      <span className="text-xs font-black text-base-content/40 shrink-0 w-16">Secret</span>
                      <span className="font-mono text-xs text-base-content/50 flex-1">see GITHUB_WEBHOOK_SECRET in .env</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-base-200 px-3 py-2">
                      <span className="text-xs font-black text-base-content/40 shrink-0 w-16">Events</span>
                      <span className="font-mono text-xs text-base-content/70 flex-1">Just the push event</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Confirm toggle */}
              <label className="flex items-center gap-3 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  style={{ "--chkbg": "var(--game-accent)" } as React.CSSProperties}
                  checked={appInstalled}
                  onChange={(e) => setAppInstalled(e.target.checked)}
                />
                <span className="text-sm font-bold text-base-content/60">I&apos;ve set this up</span>
              </label>
            </>
          )}

          {/* Step 2 — Done */}
          {step === 2 && (
            <div className="flex flex-col items-center gap-6 py-4 text-center">
              <div
                className="h-24 w-24 rounded-full flex items-center justify-center border-4 border-b-8"
                style={{
                  backgroundColor: "var(--game-accent)",
                  borderColor: "color-mix(in srgb, var(--game-accent) 50%, #000)",
                  boxShadow: "0 0 40px color-mix(in srgb, var(--game-accent) 40%, transparent)",
                }}
              >
                <Check size={40} color="white" strokeWidth={3} />
              </div>
              <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-black text-base-content">You&apos;re all set.</h2>
                <p className="text-base font-semibold text-base-content/50 max-w-xs mx-auto">
                  Start pushing commits, logging LeetCode solves, and hitting your goals. Every action earns XP.
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full">
                {[
                  { icon: GitBranch, text: "Commit = XP + streak progress" },
                  { icon: Code2,     text: "LeetCode solve = XP by difficulty" },
                  { icon: Target,    text: "Goal complete = XP by difficulty" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-3 rounded-xl bg-base-200 px-4 py-2.5">
                    <Icon size={14} style={{ color: "var(--game-accent)" }} />
                    <span className="text-sm font-bold text-base-content/60">{text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="px-8 pb-8 flex items-center justify-between gap-4">
          {step > 0 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="btn btn-ghost btn-sm font-black text-base-content/40"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {step === 0 && (
            <button
              onClick={() => setStep(1)}
              className="btn gap-2 font-black text-white border-none border-b-4"
              style={{
                backgroundColor: "var(--game-accent)",
                boxShadow: "0 4px 0 color-mix(in srgb, var(--game-accent) 50%, #000)",
              }}
            >
              Get started <ChevronRight size={16} />
            </button>
          )}

          {step === 1 && (
            <button
              onClick={() => setStep(2)}
              className="btn gap-2 font-black text-white border-none"
              style={{
                backgroundColor: appInstalled ? "var(--game-accent)" : undefined,
                boxShadow: appInstalled ? "0 4px 0 color-mix(in srgb, var(--game-accent) 50%, #000)" : undefined,
                opacity: appInstalled ? 1 : 0.5,
              }}
              disabled={!appInstalled}
            >
              Continue <ChevronRight size={16} />
            </button>
          )}

          {step === 2 && (
            <button
              onClick={complete}
              disabled={completing}
              className="btn gap-2 font-black text-white border-none"
              style={{
                backgroundColor: "var(--game-accent)",
                boxShadow: "0 4px 0 color-mix(in srgb, var(--game-accent) 50%, #000)",
              }}
            >
              {completing ? "Loading..." : "Enter Dashboard"}
              {!completing && <ChevronRight size={16} />}
            </button>
          )}
        </div>
      </div>

      {/* Skip link */}
      {step === 1 && (
        <button
          onClick={() => setStep(2)}
          className="mt-5 text-xs font-bold text-base-content/25 hover:text-base-content/50 transition-colors"
        >
          Skip for now
        </button>
      )}
    </div>
  );
}
