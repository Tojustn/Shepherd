"use client";

import { Star, GitFork } from "lucide-react";

interface Repo {
  id: number;
  name: string;
  description: string | null;
  url: string;
  language: string | null;
  stars: number;
  forks: number;
}

export function RepoGrid({ repos }: { repos: Repo[] }) {
  if (repos.length === 0) {
    return <p className="text-sm font-bold text-base-content/40">Loading repos...</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {repos.map((repo) => (
        <a
          key={repo.id}
          href={repo.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-2xl bg-base-100 border-2 border-base-300 p-4 flex flex-col gap-2 transition-colors hover:border-base-content/30"
          style={{ boxShadow: "0 4px 0 rgba(0,0,0,0.10)" }}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-black text-base text-base-content">{repo.name}</p>
            {repo.language && (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold text-white"
                style={{ backgroundColor: "var(--game-accent)" }}
              >
                {repo.language}
              </span>
            )}
          </div>
          {repo.description && (
            <p className="text-sm font-semibold text-base-content/50 line-clamp-2">{repo.description}</p>
          )}
          <div className="flex gap-4 text-sm font-bold text-base-content/40 mt-1">
            <span className="flex items-center gap-1"><Star size={13} />{repo.stars}</span>
            <span className="flex items-center gap-1"><GitFork size={13} />{repo.forks}</span>
          </div>
        </a>
      ))}
    </div>
  );
}
