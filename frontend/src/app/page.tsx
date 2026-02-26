"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { HeroText } from "@/components/HeroText";
import { useAuth } from "@/context/auth";

const GITHUB_LOGIN_URL = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/auth/github/login`;

const FEATURES = [
  {
    emoji: "⚡",
    title: "Earn XP",
    desc: "Every commit and LeetCode solve gives you real XP.",
  },
  {
    emoji: "🔥",
    title: "Build Streaks",
    desc: "Code every day. Watch your streak grow.",
  },
  {
    emoji: "🎯",
    title: "Hit Goals",
    desc: "Set targets, track progress, and level up faster.",
  },
];

export default function Home() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, router]);

  return (
    <div className="flex min-h-screen flex-col bg-base-100">
      <Navbar />

      <main className="flex flex-1 flex-col items-center justify-center text-center px-4 pt-24 pb-16 gap-12">

        {/* Hero */}
        <div className="flex flex-col items-center gap-4">
          <HeroText />
          <p className="max-w-sm text-xl font-bold text-base-content/55">
            Level up as a developer. One commit at a time.
          </p>
        </div>

        {/* CTA */}
        <a
          href={GITHUB_LOGIN_URL}
          className="btn btn-lg gap-3 font-black text-white border-none"
          style={{
            backgroundColor: "var(--game-accent)",
            boxShadow: "0 6px 0 color-mix(in srgb, var(--game-accent) 50%, #000)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
          </svg>
          Get started with GitHub
        </a>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
          {FEATURES.map(({ emoji, title, desc }) => (
            <div
              key={title}
              className="rounded-2xl bg-base-100 border-2 border-base-300 p-5 flex flex-col items-center gap-2 text-center"
              style={{ boxShadow: "0 4px 0 rgba(0,0,0,0.10)" }}
            >
              <span className="text-3xl">{emoji}</span>
              <p className="font-black text-base text-base-content">{title}</p>
              <p className="text-sm font-semibold text-base-content/50">{desc}</p>
            </div>
          ))}
        </div>

      </main>
    </div>
  );
}
