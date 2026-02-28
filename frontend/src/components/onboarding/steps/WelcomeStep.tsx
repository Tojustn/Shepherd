// components/onboarding/steps/WelcomeStep.tsx
import { GitBranch, Target, Code2, Flame } from "lucide-react";

const FEATURES = [
  { icon: GitBranch, label: "Commit graph", desc: "Interactive branch visualizer for every repo" },
  { icon: Code2,     label: "Leetcode log", desc: "Track solves, code, and confidence over time" },
  { icon: Target,    label: "Goals",        desc: "Daily quests and custom goals earn XP" },
  { icon: Flame,     label: "Streaks",      desc: "GitHub and Leetcode streaks with multipliers" },
];

export function WelcomeStep({ username }: { username: string }) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-black text-base-content leading-tight">
          Hey, {username || "there"}.
        </h1>
        <p className="text-base font-semibold text-base-content/50">
          Welcome to your developer command center. Let&apos;s get you set up in a few quick steps.
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
  );
}