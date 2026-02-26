"use client";

const STARS = [
  { top: "-16px", left: "12px",  size: "2rem", delay: "0.15s", rotate: "-15deg" },
  { top: "-20px", right: "20px", size: "2.5rem", delay: "0.2s", rotate: "20deg" },
  { top: "30px",  left: "-20px", size: "1.5rem", delay: "0.25s", rotate: "-30deg" },
  { top: "20px",  right: "-16px", size: "1.75rem", delay: "0.3s", rotate: "10deg" },
  { bottom: "-8px", left: "30px", size: "1.25rem", delay: "0.35s", rotate: "25deg" },
];

function Star({ style, delay }: { style: React.CSSProperties; delay: string }) {
  return (
    <span
      className="star-pop absolute select-none"
      style={{ ...style, animationDelay: delay, fontSize: style.fontSize ?? "1.5rem" }}
    >
      ⭐
    </span>
  );
}

export function LevelUpBanner({ level, onDismiss }: { level: number; onDismiss: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={onDismiss}
    >
      <div
        className="level-up-card relative flex flex-col items-center gap-5 rounded-3xl bg-base-100 px-14 py-10 text-center"
        style={{ boxShadow: "0 8px 0 color-mix(in srgb, var(--game-accent) 60%, #000), 0 16px 40px rgba(0,0,0,0.3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Stars */}
        {STARS.map((s, i) => (
          <Star
            key={i}
            delay={s.delay}
            style={{
              top: s.top,
              left: s.left,
              right: s.right,
              bottom: s.bottom,
              fontSize: s.size,
              rotate: s.rotate,
            }}
          />
        ))}

        {/* Level circle */}
        <div
          className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-b-8 border-white/20"
          style={{
            backgroundColor: "var(--game-accent)",
            boxShadow: "0 6px 0 color-mix(in srgb, var(--game-accent) 50%, #000)",
          }}
        >
          <span className="font-mono text-5xl font-black text-white">{level}</span>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-2xl font-black text-base-content">Level Up!</p>
          <p className="text-base font-semibold text-base-content/50">You reached level {level}</p>
        </div>

        <button
          onClick={onDismiss}
          className="btn btn-wide border-b-4 border-b-black/20 font-black text-white text-base mt-1"
          style={{ backgroundColor: "var(--game-accent)" }}
        >
          Keep going!
        </button>
      </div>
    </div>
  );
}
