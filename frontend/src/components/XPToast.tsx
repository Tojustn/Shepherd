"use client";

export interface XPToastItem {
  id: number;
  amount: number;
  source: string;
}

export function XPToast({ toasts }: { toasts: XPToastItem[] }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="xp-toast flex items-center gap-2.5 px-4 py-2.5 rounded-full font-mono font-bold text-white shadow-xl"
          style={{
            backgroundColor: "var(--game-accent)",
            boxShadow: "0 0 24px color-mix(in srgb, var(--game-accent) 65%, transparent), 0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          <span className="text-base">+{t.amount} XP</span>
          <span className="text-xs font-semibold opacity-80">{t.source}</span>
        </div>
      ))}
    </div>
  );
}
