"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GitBranch, Code2, Zap, Check, AlertTriangle, Loader2 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const MAX_LEVEL = 50;

interface UserProfile {
  username: string;
  avatar_url: string | null;
  github_id: string;
  xp: number;
  level: number;
  xp_current_level: number;
  xp_next_level: number;
  github_streak: { current: number; longest: number };
  leetcode_streak: { current: number; longest: number };
  leetcode_username: string | null;
  created_at: string;
}

function HorizontalXPBar({ xp, xpCurrentLevel, xpNextLevel, level }: {
  xp: number; xpCurrentLevel: number; xpNextLevel: number; level: number;
}) {
  const isMax = level >= MAX_LEVEL;
  const pct = isMax ? 100 : Math.min(Math.round(((xp - xpCurrentLevel) / (xpNextLevel - xpCurrentLevel)) * 100), 100);
  const [animPct, setAnimPct] = useState(0);
  useEffect(() => { const t = setTimeout(() => setAnimPct(pct), 100); return () => clearTimeout(t); }, [pct]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs font-black font-mono">
        <span style={{ color: "var(--game-accent)" }}>LVL {level}</span>
        {isMax
          ? <span style={{ color: "var(--game-accent)" }}>MAX LEVEL</span>
          : <span className="text-base-content/40">LVL {level + 1}</span>
        }
      </div>
      <div className="h-3 w-full rounded-full bg-base-300 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${animPct}%`,
            backgroundColor: "var(--game-accent)",
            boxShadow: "0 0 12px color-mix(in srgb, var(--game-accent) 60%, transparent)",
          }}
        />
      </div>
      <div className="flex items-center justify-between text-xs font-semibold text-base-content/40">
        <span>{xp.toLocaleString()} XP total</span>
        {!isMax && <span>{(xpNextLevel - xp).toLocaleString()} XP to next level · {pct}%</span>}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string;
}) {
  return (
    <div className="rounded-2xl bg-base-100 border-2 border-base-300 p-4 flex flex-col gap-1"
      style={{ boxShadow: "0 3px 0 rgba(0,0,0,0.08)" }}>
      <div className="flex items-center gap-1.5 text-base-content/40">
        {icon}
        <span className="text-xs font-black uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-2xl font-black font-mono text-base-content">{value}</span>
      {sub && <span className="text-xs font-semibold text-base-content/40">{sub}</span>}
    </div>
  );
}

export default function ProfilePage() {
  const { token, logout } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [username, setUsername]       = useState("");
  const [saved, setSaved]             = useState(false);
  const [lcUsername, setLcUsername]   = useState("");
  const [lcSaved, setLcSaved]         = useState(false);
  const [lcImported, setLcImported]   = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [showDelete, setShowDelete]   = useState(false);
  const deleteInputRef = useRef<HTMLInputElement>(null);

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["me"],
    queryFn: async () => {
      const r = await fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    enabled: !!token,
  });

  // Seed input fields once when profile first loads
  useEffect(() => {
    if (profile && !username) setUsername(profile.username);
    if (profile && !lcUsername) setLcUsername(profile.leetcode_username ?? "");
  }, [profile]);

  const { mutate: saveUsername, isPending: saving } = useMutation({
    mutationFn: () =>
      fetch(`${API_URL}/api/auth/profile`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      }).then((r) => { if (!r.ok) throw new Error("Save failed"); return r.json(); }),
    onSuccess: () => {
      queryClient.setQueryData<UserProfile>(["me"], (old) => old ? { ...old, username: username.trim() } : old);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const { mutate: saveLcUsername, isPending: lcSaving } = useMutation({
    mutationFn: () =>
      fetch(`${API_URL}/api/auth/profile`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ leetcode_username: lcUsername.trim() || null }),
      }).then((r) => { if (!r.ok) throw new Error("Save failed"); return r.json(); }),
    onSuccess: () => {
      queryClient.setQueryData<UserProfile>(["me"], (old) =>
        old ? { ...old, leetcode_username: lcUsername.trim() || null } : old
      );
      setLcImported(null);
      setLcSaved(true);
      setTimeout(() => setLcSaved(false), 2500);
    },
  });

  const { mutate: importLcSolves, isPending: lcImporting } = useMutation({
    mutationFn: () =>
      fetch(`${API_URL}/api/leetcode/import`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => { if (!r.ok) throw new Error("Import failed"); return r.json(); }),
    onSuccess: (data) => {
      setLcImported(data.imported ?? 0);
      queryClient.invalidateQueries({ queryKey: ["leetcode"] });
    },
  });

  const { mutate: deleteAccount, isPending: deleting } = useMutation({
    mutationFn: () =>
      fetch(`${API_URL}/api/auth/account`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => { if (!r.ok && r.status !== 204) throw new Error("Delete failed"); }),
    onSuccess: () => {
      logout();
      router.replace("/");
    },
  });

  function memberSince(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  if (!profile) return <p className="p-8 text-base-content/40 font-mono">Loading...</p>;

  const isMax = profile.level >= MAX_LEVEL;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 flex flex-col gap-8">

      {/* Profile card */}
      <div
        className="rounded-2xl bg-base-100 border-2 border-base-300 p-6 flex items-center gap-5"
        style={{ boxShadow: "0 5px 0 rgba(0,0,0,0.15)" }}
      >
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.username}
            className="h-20 w-20 rounded-full border-4 shrink-0"
            style={{ borderColor: "var(--game-accent)" }}
          />
        ) : (
          <div
            className="h-20 w-20 rounded-full shrink-0 flex items-center justify-center text-3xl font-black text-white"
            style={{ backgroundColor: "var(--game-accent)" }}
          >
            {profile.username[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-2xl font-black text-base-content">{profile.username}</span>
            <span
              className="font-black font-mono text-xs px-2 py-1 rounded-lg"
              style={{ backgroundColor: "color-mix(in srgb, var(--game-accent) 15%, transparent)", color: "var(--game-accent)" }}
            >
              {isMax ? "MAX" : `LVL ${profile.level}`}
            </span>
          </div>
          <span className="text-sm font-semibold text-base-content/40">
            github.com/{profile.github_id !== profile.username ? profile.username : profile.github_id}
          </span>
          <span className="text-xs font-bold text-base-content/30">Member since {memberSince(profile.created_at)}</span>
        </div>
      </div>

      {/* XP Progress */}
      <div
        className="rounded-2xl bg-base-100 border-2 border-base-300 p-6 flex flex-col gap-2"
        style={{ boxShadow: "0 3px 0 rgba(0,0,0,0.08)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="rounded-lg p-1.5" style={{ backgroundColor: "color-mix(in srgb, var(--game-accent) 15%, transparent)" }}>
            <Zap size={14} style={{ color: "var(--game-accent)" }} />
          </div>
          <h2 className="font-black text-base-content">XP Progress</h2>
        </div>
        <HorizontalXPBar
          xp={profile.xp}
          xpCurrentLevel={profile.xp_current_level}
          xpNextLevel={profile.xp_next_level}
          level={profile.level}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard
          icon={<Zap size={12} />}
          label="Total XP"
          value={profile.xp.toLocaleString()}
          sub="all time"
        />
        <StatCard
          icon={<GitBranch size={12} />}
          label="GitHub streak"
          value={profile.github_streak.current}
          sub={`best: ${profile.github_streak.longest} days`}
        />
        <StatCard
          icon={<Code2 size={12} />}
          label="LC streak"
          value={profile.leetcode_streak.current}
          sub={`best: ${profile.leetcode_streak.longest} days`}
        />
      </div>

      {/* Settings */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-black text-base-content">Settings</h2>
        <div
          className="rounded-2xl bg-base-100 border-2 border-base-300 p-5 flex flex-col gap-4"
          style={{ boxShadow: "0 3px 0 rgba(0,0,0,0.08)" }}
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-black uppercase tracking-wider text-base-content/40">Display name</label>
            <div className="flex gap-2">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveUsername()}
                className="input input-bordered flex-1 font-bold text-sm"
                placeholder="Your display name"
                maxLength={64}
              />
              <button
                onClick={() => saveUsername()}
                disabled={saving || username === profile.username || !username.trim()}
                className="btn btn-sm gap-1.5 font-black text-white border-none min-w-[80px]"
                style={{
                  backgroundColor: saved ? "#22c55e" : "var(--game-accent)",
                  boxShadow: "0 3px 0 color-mix(in srgb, var(--game-accent) 50%, #000)",
                }}
              >
                {saved ? <><Check size={14} strokeWidth={3} /> Saved</> : saving ? "..." : "Save"}
              </button>
            </div>
            <p className="text-xs text-base-content/30 font-semibold">
              This is your display name inside Shepherd. Your GitHub handle stays unchanged.
            </p>
          </div>

          {/* Leetcode username */}
          <div className="flex flex-col gap-1.5 border-t border-base-300 pt-4">
            <label className="text-xs font-black uppercase tracking-wider text-base-content/40">Leetcode username</label>
            <div className="flex gap-2">
              <input
                value={lcUsername}
                onChange={(e) => { setLcUsername(e.target.value); setLcImported(null); }}
                onKeyDown={(e) => e.key === "Enter" && saveLcUsername()}
                className="input input-bordered flex-1 font-bold text-sm font-mono"
                placeholder="your-lc-handle"
                maxLength={64}
              />
              <button
                onClick={saveLcUsername}
                disabled={lcSaving || lcUsername === (profile.leetcode_username ?? "")}
                className="btn btn-sm gap-1.5 font-black text-white border-none min-w-[80px]"
                style={{
                  backgroundColor: lcSaved ? "#22c55e" : "var(--game-accent)",
                  boxShadow: "0 3px 0 color-mix(in srgb, var(--game-accent) 50%, #000)",
                }}
              >
                {lcSaved ? <><Check size={14} strokeWidth={3} /> Saved</> : lcSaving ? "..." : "Save"}
              </button>
            </div>
            {profile.leetcode_username && (
              <div className="flex items-center gap-3 mt-1">
                <button
                  onClick={importLcSolves}
                  disabled={lcImporting}
                  className="flex items-center gap-1.5 text-xs font-black transition-colors"
                  style={{ color: "var(--game-accent)" }}
                >
                  {lcImporting
                    ? <><Loader2 size={11} className="animate-spin" /> Importing…</>
                    : <><Code2 size={11} /> Re-sync solves from Leetcode</>
                  }
                </button>
                {lcImported !== null && !lcImporting && (
                  <span className="text-xs font-bold text-base-content/40">
                    {lcImported === 0 ? "Already up to date" : `Imported ${lcImported} new solve${lcImported === 1 ? "" : "s"}`}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-black text-error/80 flex items-center gap-2">
          <AlertTriangle size={18} />
          Danger zone
        </h2>
        <div className="rounded-2xl border-2 border-error/20 bg-error/5 p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-black text-sm text-base-content">Delete account</p>
              <p className="text-xs font-semibold text-base-content/50 mt-0.5">
                Permanently deletes your account, all goals, solves, streaks, and XP. This cannot be undone.
              </p>
            </div>
            {!showDelete && (
              <button
                onClick={() => { setShowDelete(true); setTimeout(() => deleteInputRef.current?.focus(), 50); }}
                className="btn btn-sm btn-error btn-outline font-black shrink-0"
              >
                Delete account
              </button>
            )}
          </div>

          {showDelete && (
            <div className="flex flex-col gap-3 border-t border-error/20 pt-4">
              <p className="text-xs font-bold text-base-content/60">
                Type <span className="font-black text-error font-mono">DELETE</span> to confirm
              </p>
              <div className="flex gap-2">
                <input
                  ref={deleteInputRef}
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && deleteConfirm === "DELETE" && deleteAccount()}
                  placeholder="DELETE"
                  className="input input-bordered input-error input-sm flex-1 font-mono font-bold"
                />
                <button
                  onClick={deleteAccount}
                  disabled={deleteConfirm !== "DELETE" || deleting}
                  className="btn btn-sm btn-error font-black"
                >
                  {deleting ? "Deleting..." : "Confirm"}
                </button>
                <button
                  onClick={() => { setShowDelete(false); setDeleteConfirm(""); }}
                  className="btn btn-sm btn-ghost font-black"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
