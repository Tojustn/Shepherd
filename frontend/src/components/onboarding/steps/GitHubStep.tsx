import { GitBranch, ExternalLink } from "lucide-react";
import { CopyButton } from "../CopyButton";

const GITHUB_APP_NAME = process.env.NEXT_PUBLIC_GITHUB_APP_NAME ?? "";

export function GitHubStep({
  webhookUrl,
  appInstalled,
  setAppInstalled,
}: {
  webhookUrl: string;
  appInstalled: boolean;
  setAppInstalled: (v: boolean) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-black text-base-content">Enable commit tracking</h2>
        <p className="text-sm font-semibold text-base-content/50">
          Shepherd listens for GitHub push events to award XP, update streaks, and tick your daily quest automatically.
        </p>
      </div>

      {GITHUB_APP_NAME && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-black uppercase tracking-wider text-base-content/40">Recommended</p>
            <a 
            href={`https://github.com/apps/${GITHUB_APP_NAME}/installations/new`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setAppInstalled(true)}
            className="flex items-center justify-between gap-3 rounded-2xl border-2 px-5 py-4 transition-all hover:-translate-y-0.5"
            style={{
              borderColor: "var(--game-accent)",
              backgroundColor: "color-mix(in srgb, var(--game-accent) 8%, transparent)",
              boxShadow: "0 4px 0 color-mix(in srgb, var(--game-accent) 30%, rgba(0,0,0,0.2))",
            }}
          >
            <div className="flex items-center gap-3">
              <GitBranch size={20} style={{ color: "var(--game-accent)" }} />
              <div>
                <p className="font-black text-sm text-base-content">Install GitHub App</p>
                <p className="text-xs font-semibold text-base-content/40">Automatically sets up webhooks on your repos</p>
              </div>
            </div>
            <ExternalLink size={14} className="text-base-content/30 shrink-0" />
          </a>
        </div>
      )}

      {!GITHUB_APP_NAME && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-black uppercase tracking-wider text-base-content/40">Manual webhook</p>
            <a
            href="https://github.com/settings/installations"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setAppInstalled(true)}
            className="flex items-center justify-between gap-3 rounded-2xl border-2 px-5 py-4 transition-all hover:-translate-y-0.5"
            style={{
              borderColor: "var(--game-accent)",
              backgroundColor: "color-mix(in srgb, var(--game-accent) 8%, transparent)",
              boxShadow: "0 4px 0 color-mix(in srgb, var(--game-accent) 30%, rgba(0,0,0,0.2))",
            }}
          >
            <div className="flex items-center gap-3">
              <GitBranch size={20} style={{ color: "var(--game-accent)" }} />
              <div>
                <p className="font-black text-sm text-base-content">Connect via GitHub</p>
                <p className="text-xs font-semibold text-base-content/40">Add the webhook URL to your repo settings</p>
              </div>
            </div>
            <ExternalLink size={14} className="text-base-content/30 shrink-0" />
          </a>
          <p className="text-xs font-semibold text-base-content/30 pl-1">
            Go to your repo → Settings → Webhooks → Add webhook → paste{" "}
            <span className="font-mono text-base-content/50">{webhookUrl}</span>
            <CopyButton text={webhookUrl} />
          </p>
        </div>
      )}

      <label className="flex items-center gap-3 cursor-pointer w-fit">
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          style={{ "--chkbg": "var(--game-accent)" } as React.CSSProperties}
          checked={appInstalled}
          onChange={(e) => setAppInstalled(e.target.checked)}
        />
        <span className="text-sm font-bold text-base-content/60">
          {GITHUB_APP_NAME ? "I've installed the GitHub App" : "I've set this up"}
        </span>
      </label>
    </>
  );
}