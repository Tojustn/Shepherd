import { Check, GitBranch, Code2, Target } from "lucide-react";

export function DoneStep({ lcImported }: { lcImported: number | null }) {
  return (
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
          {lcImported !== null && lcImported > 0
            ? `Imported ${lcImported} Leetcode solve${lcImported === 1 ? "" : "s"}. Start pushing commits, logging more solves, and hitting your goals.`
            : "Start pushing commits, logging Leetcode solves, and hitting your goals. Every action earns XP."}
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full">
        {[
          { icon: GitBranch, text: "Commit = XP + streak progress" },
          { icon: Code2,     text: "Leetcode solve = XP by difficulty" },
          { icon: Target,    text: "Goal complete = XP by difficulty" },
        ].map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-3 rounded-xl bg-base-200 px-4 py-2.5">
            <Icon size={14} style={{ color: "var(--game-accent)" }} />
            <span className="text-sm font-bold text-base-content/60">{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}