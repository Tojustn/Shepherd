import { ChevronRight, Loader2 } from "lucide-react";
import { LCStatus } from "./types";

export function OnboardingFooter({
  step,
  appInstalled,
  lcStatus,
  completing,
  onBack,
  onNext,
  onImport,
  onComplete,
}: {
  step: number;
  appInstalled: boolean;
  lcStatus: LCStatus;
  completing: boolean;
  onBack: () => void;
  onNext: () => void;
  onImport: () => void;
  onComplete: () => void;
}) {
  return (
    <div className="px-8 pb-8 flex items-center justify-between gap-4">
      {step > 0 && step < 3 ? (
        <button
          onClick={onBack}
          disabled={lcStatus === "importing"}
          className="btn btn-ghost btn-sm font-black text-base-content/40"
        >
          Back
        </button>
      ) : <div />}

      {step === 0 && (
        <button
          onClick={onNext}
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
          onClick={onNext}
          disabled={!appInstalled}
          className="btn gap-2 font-black text-white border-none"
          style={{
            backgroundColor: appInstalled ? "var(--game-accent)" : undefined,
            boxShadow: appInstalled ? "0 4px 0 color-mix(in srgb, var(--game-accent) 50%, #000)" : undefined,
            opacity: appInstalled ? 1 : 0.5,
          }}
        >
          Continue <ChevronRight size={16} />
        </button>
      )}

      {step === 2 && (
        <button
          onClick={onImport}
          disabled={lcStatus !== "valid"}
          className="btn gap-2 font-black text-white border-none"
          style={{
            backgroundColor: lcStatus === "valid" ? "var(--game-accent)" : undefined,
            boxShadow: lcStatus === "valid" ? "0 4px 0 color-mix(in srgb, var(--game-accent) 50%, #000)" : undefined,
            opacity: lcStatus === "valid" ? 1 : 0.5,
          }}
        >
          {lcStatus === "importing"
            ? <><Loader2 size={14} className="animate-spin" /> Importing…</>
            : <>Import & Continue <ChevronRight size={16} /></>
          }
        </button>
      )}

      {step === 3 && (
        <button
          onClick={onComplete}
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
  );
}