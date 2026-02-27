"use client";

import { toast } from "sonner";

export function showXPToast(amount: number, source: string) {
  toast.custom(
    () => (
      <div
        className="xp-toast flex items-center gap-2.5 px-4 py-2.5 rounded-full font-mono font-bold text-white shadow-xl"
        style={{
          backgroundColor: "var(--game-accent)",
          boxShadow: "0 0 24px color-mix(in srgb, var(--game-accent) 65%, transparent), 0 4px 12px rgba(0,0,0,0.3)",
        }}
      >
        <span className="text-base">+{amount} XP</span>
        <span className="text-xs font-semibold opacity-80">{source}</span>
      </div>
    ),
    { duration: 2800 },
  );
}
