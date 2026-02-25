"use client";

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
    return <p className="text-zinc-500 dark:text-zinc-400">Loading...</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {repos.map((repo) => (
        <a
          key={repo.id}
          href={repo.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-zinc-200 p-4 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600 transition-colors"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium text-black dark:text-white">{repo.name}</p>
            {repo.language && (
              <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{repo.language}</span>
            )}
          </div>
          {repo.description && (
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2">{repo.description}</p>
          )}
          <div className="mt-3 flex gap-4 text-xs text-zinc-400 dark:text-zinc-500">
            <span>★ {repo.stars}</span>
            <span>⑂ {repo.forks}</span>
          </div>
        </a>
      ))}
    </div>
  );
}
