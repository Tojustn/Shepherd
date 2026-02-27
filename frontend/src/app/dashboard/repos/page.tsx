"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/auth";
import Link from "next/link";
import { Search, ExternalLink } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Repo {
  id: number; name: string; full_name: string; description: string | null;
  url: string; language: string | null; stars: number; forks: number;
  pushed_at: string | null;
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f7df1e",
  Python: "#3572A5",
  Rust: "#dea584",
  Go: "#00ADD8",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  CSS: "#563d7c",
  HTML: "#e34c26",
  Ruby: "#701516",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
};

function timeAgo(dateStr: string) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function getStatus(lastDate: string | null) {
  if (!lastDate) return { label: "Abandoned", color: "rgba(148,163,184,1)", icon: "📦" };
  const days = Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000);
  if (days <= 14) return { label: "Active", color: "#22c55e", icon: "⚔️" };
  if (days <= 60) return { label: "Stale", color: "#f59e0b", icon: "💤" };
  return { label: "Abandoned", color: "rgba(148,163,184,1)", icon: "📦" };
}

function getActivityPct(lastDate: string | null) {
  if (!lastDate) return 0;
  const days = (Date.now() - new Date(lastDate).getTime()) / 86400000;
  // Decay from 100% at day 0 to ~0% at day 90, clamped to [0, 100]
  return Math.round(Math.max(0, 100 - (days / 90) * 100));
}

function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div>
      <div className="flex justify-between text-[10px] font-black text-base-content/30 mb-1">
        <span>Activity</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-base-300 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export default function QuestBoardPage() {
  const { token, logout } = useAuth();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/github/repos`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (r.status === 401) { logout(); return; }
        if (!r.ok) return;
        return r.json().then(setRepos);
      })
      .catch(() => {});
  }, [token, logout]);

  const filtered = repos.filter(r =>
    r.name.toLowerCase().includes(query.toLowerCase()) ||
    (r.description ?? "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="min-h-screen px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="font-black text-2xl text-base-content">Quest Board</h1>
        <div className="ml-auto relative w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/30" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search quests..."
            className="w-full rounded-xl border-2 border-base-300 bg-base-100 pl-9 pr-4 py-2 text-sm font-bold text-base-content placeholder:text-base-content/30 outline-none focus:border-base-content/40 transition-all"
          />
        </div>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <p className="text-sm font-bold text-base-content/30 text-center mt-20">
          {repos.length === 0 ? "Loading quests..." : "No quests found"}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(repo => {
            const status = getStatus(repo.pushed_at);
            const activityPct = getActivityPct(repo.pushed_at);
            const langColor = repo.language ? (LANG_COLORS[repo.language] ?? "var(--game-accent)") : null;

            return (
              <Link
                key={repo.id}
                href={`/dashboard/repos/${repo.name}`}
                className="rounded-2xl bg-base-100 border-2 border-base-300 p-4 flex flex-col gap-3 transition-all hover:border-base-content/25 hover:-translate-y-0.5"
                style={{ boxShadow: "0 4px 0 rgba(0,0,0,0.10)" }}
              >
                {/* Title + status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base leading-none shrink-0">{status.icon}</span>
                    <p className="font-black text-base text-base-content leading-tight truncate">{repo.name}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: status.color + "22",
                        color: status.color,
                        border: `1px solid ${status.color}55`,
                      }}
                    >
                      {status.label}
                    </span>
                    <button
                      onClick={e => { e.preventDefault(); e.stopPropagation(); window.open(repo.url, "_blank", "noopener,noreferrer"); }}
                      className="text-base-content/20 hover:text-base-content/60 transition-colors"
                    >
                      <ExternalLink size={12} />
                    </button>
                  </div>
                </div>

                {/* Language + last active */}
                <div className="flex items-center justify-between">
                  {langColor ? (
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: langColor + "33", color: langColor, border: `1px solid ${langColor}55` }}
                    >
                      {repo.language}
                    </span>
                  ) : <span />}
                  {repo.pushed_at && (
                    <span className="text-xs font-bold text-base-content/40">{timeAgo(repo.pushed_at)}</span>
                  )}
                </div>

                {/* Progress bar */}
                <ProgressBar pct={activityPct} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
