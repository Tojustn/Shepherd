import { Check } from "lucide-react";

const TOTAL_STEPS = 4;

export function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-3">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
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
          {i < TOTAL_STEPS - 1 && (
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