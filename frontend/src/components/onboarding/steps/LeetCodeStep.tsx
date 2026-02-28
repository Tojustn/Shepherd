"use client";
import { Check, Code2, Loader2 } from "lucide-react";
import { LCStatus } from "../types";

export function LeetCodeStep({
  lcUsername,
  setLcUsername,
  lcStatus,
  lcSession,
  setLcSession,
  showCookieHelp,
  setShowCookieHelp,
  lcImportError,
  setLcImportError,
}: {
  lcUsername: string;
  setLcUsername: (v: string) => void;
  lcStatus: LCStatus;
  lcSession: string;
  setLcSession: (v: string) => void;
  showCookieHelp: boolean;
  setShowCookieHelp: (v: boolean) => void;
  lcImportError: string | null;
  setLcImportError: (v: string | null) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-black text-base-content">Connect Leetcode</h2>
        <p className="text-sm font-semibold text-base-content/50">
          Enter your username and paste your session cookie to import your full solve history.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <label className="text-xs font-black uppercase tracking-wider text-base-content/40 mb-1.5 block">
            Username
          </label>
          <div
            className="flex items-center gap-2 rounded-2xl border-2 px-4 py-3 transition-colors"
            style={{
              borderColor:
                lcStatus === "valid" || lcStatus === "done"
                  ? "var(--game-accent)"
                  : lcStatus === "invalid"
                  ? "#ef4444"
                  : "var(--color-base-300)",
            }}
          >
            <Code2
              size={16}
              style={{
                color:
                  lcStatus === "valid" || lcStatus === "done"
                    ? "var(--game-accent)"
                    : lcStatus === "invalid"
                    ? "#ef4444"
                    : "rgba(var(--bc), 0.3)",
                flexShrink: 0,
              }}
            />
            <input
              type="text"
              placeholder="your-leetcode-username"
              value={lcUsername}
              onChange={(e) => { setLcUsername(e.target.value); setLcImportError(null); }}
              className="flex-1 bg-transparent text-sm font-bold text-base-content outline-none placeholder:text-base-content/25"
              disabled={lcStatus === "importing"}
              autoComplete="off"
              spellCheck={false}
            />
            {lcStatus === "validating" && <Loader2 size={14} className="animate-spin shrink-0 text-base-content/30" />}
            {(lcStatus === "valid" || lcStatus === "done") && (
              <Check size={14} strokeWidth={3} style={{ color: "var(--game-accent)", flexShrink: 0 }} />
            )}
          </div>
          {lcStatus === "invalid" && (
            <p className="mt-1.5 text-xs font-bold text-red-500 pl-1">Username not found on Leetcode.</p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-black uppercase tracking-wider text-base-content/40">
              Session cookie
            </label>
            <button
              type="button"
              onClick={() => setShowCookieHelp(!showCookieHelp)}
              className="text-xs font-bold transition-colors"
              style={{ color: "var(--game-accent)" }}
            >
              {showCookieHelp ? "Hide" : "How to get it"}
            </button>
          </div>

          {showCookieHelp && (
            <div className="mb-2 rounded-xl bg-base-200 border border-base-300 p-3 flex flex-col gap-1.5">
              {[
                "1. Log in to leetcode.com",
                "2. Open DevTools → F12 (or Ctrl+Shift+I)",
                "3. Go to Application → Cookies → leetcode.com",
                "4. Find LEETCODE_SESSION and copy its value",
              ].map((s) => (
                <p key={s} className="text-xs font-semibold text-base-content/60">{s}</p>
              ))}
              <p className="text-xs font-semibold text-base-content/40 mt-0.5">
                We only use this once to import your history. It is never stored.
              </p>
            </div>
          )}

          <textarea
            placeholder="Paste LEETCODE_SESSION value here…"
            value={lcSession}
            onChange={(e) => { setLcSession(e.target.value); setLcImportError(null); }}
            disabled={lcStatus === "importing"}
            rows={2}
            className="w-full rounded-2xl border-2 border-base-300 px-4 py-3 bg-transparent text-xs font-mono text-base-content/70 outline-none resize-none placeholder:text-base-content/20 focus:border-base-content/30 transition-colors"
          />
          <p className="mt-1 text-xs font-semibold text-base-content/30 pl-1">
            Without this we can only import your 20 most recent solves.
          </p>
        </div>

        {lcImportError && <p className="text-xs font-bold text-red-500 pl-1">{lcImportError}</p>}

        {lcStatus === "importing" && (
          <div className="flex items-center gap-2 rounded-2xl border-2 border-base-300 px-4 py-3 bg-base-200">
            <Loader2 size={14} className="animate-spin shrink-0" style={{ color: "var(--game-accent)" }} />
            <span className="text-sm font-bold text-base-content/60">
              Importing your solves — this may take a few seconds…
            </span>
          </div>
        )}
      </div>
    </>
  );
}