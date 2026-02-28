"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { HeroText } from "@/components/HeroText";
import { useAuth } from "@/context/auth";
import {
  LayoutDashboard, GitBranch, Target, Code2, Play, ArrowRight,
  Flame, Zap, Filter, CheckCircle2, Star,
} from "lucide-react";

const GITHUB_LOGIN_URL = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/auth/github/login`;

// ─── Mock Visuals ─────────────────────────────────────────────────────────────

function DashboardVisual({ color }: { color: string }) {
  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="rounded-xl p-3 border border-base-300" style={{ backgroundColor: `${color}10` }}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-black text-base-content/50">LVL 4 → 5</span>
          <span className="text-xs font-black" style={{ color }}>88 XP</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-base-300 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: "88%", backgroundColor: color }} />
        </div>
      </div>
      <div className="flex gap-2">
        {[{ val: "🔥", label: "7d streak" }, { val: "🎯", label: "3 goals" }, { val: "⚡", label: "2/3 quests" }].map((item, i) => (
          <div key={i} className="flex-1 rounded-xl p-2 border border-base-300 text-center" style={{ backgroundColor: `${color}08` }}>
            <div className="text-sm">{item.val}</div>
            <div className="text-xs text-base-content/40 font-semibold">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReposVisual({ color }: { color: string }) {
  const repos = [
    { name: "Shepherd", lang: "TypeScript", langColor: "#3178c6", status: "Active", statusColor: "#22c55e", pct: 95, icon: "⚔️" },
    { name: "ml-experiments", lang: "Python", langColor: "#3572A5", status: "Stale", statusColor: "#f59e0b", pct: 38, icon: "💤" },
    { name: "portfolio", lang: "TypeScript", langColor: "#3178c6", status: "Active", statusColor: "#22c55e", pct: 80, icon: "⚔️" },
  ];
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {repos.map((r, i) => (
        <div key={i} className="rounded-xl px-3 py-2 border border-base-300" style={{ backgroundColor: `${color}08`, opacity: 1 - i * 0.1 }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-black text-base-content">{r.icon} {r.name}</span>
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{ color: r.statusColor, backgroundColor: `${r.statusColor}22` }}>{r.status}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-1.5 py-px rounded-full shrink-0" style={{ color: r.langColor, backgroundColor: `${r.langColor}22` }}>{r.lang}</span>
            <div className="flex-1 h-1 rounded-full bg-base-300 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${r.pct}%`, backgroundColor: r.statusColor }} />
            </div>
            <span className="text-[10px] font-black text-base-content/30 shrink-0">{r.pct}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function StreaksVisual({ color }: { color: string }) {
  return (
    <div className="flex flex-col gap-2 w-full">
      {[{ platform: "GitHub", streak: 7, best: 14, icon: "🐙" }, { platform: "Leetcode", streak: 3, best: 5, icon: "💻" }].map((s, i) => (
        <div key={i} className="rounded-xl p-3 border border-base-300" style={{ backgroundColor: `${color}10` }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-black text-base-content/60 uppercase tracking-wide">{s.icon} {s.platform}</span>
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{ color, backgroundColor: `${color}22` }}>On fire</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black font-mono leading-none" style={{ color }}>{s.streak}</span>
            <span className="text-xs font-bold text-base-content/50">day streak</span>
          </div>
          <p className="text-[10px] font-bold text-base-content/30 mt-1">best {s.best}d · Active today</p>
        </div>
      ))}
    </div>
  );
}

function GoalsVisual({ color }: { color: string }) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {[{ label: "Push a commit", done: true }, { label: "Solve a Leetcode problem", done: true }, { label: "Reach Level 5", done: false, progress: 88 }].map((q, i) => (
        <div key={i} className="rounded-xl px-3 py-2 border border-base-300 flex items-center gap-2" style={{ backgroundColor: `${color}08` }}>
          <CheckCircle2 size={13} style={{ color: q.done ? color : "rgba(0,0,0,0.15)" }} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-base-content">{q.label}</p>
            {!q.done && q.progress !== undefined && (
              <div className="w-full h-1 rounded-full bg-base-300 mt-1 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${q.progress}%`, backgroundColor: color }} />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function LeetCodeVisual({ color }: { color: string }) {
  const diffColor: Record<string, string> = { Easy: "#22c55e", Medium: "#f59e0b", Hard: "#ef4444" };
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex items-center gap-1.5 mb-0.5">
        <Filter size={10} style={{ color }} />
        <span className="text-xs font-black text-base-content/40">Low confidence</span>
      </div>
      {[{ name: "LRU Cache", diff: "Hard", conf: 2, topic: "Design" }, { name: "Coin Change", diff: "Medium", conf: 4, topic: "DP" }, { name: "Word Ladder", diff: "Hard", conf: 3, topic: "Graph" }].map((p, i) => (
        <div key={i} className="rounded-xl px-3 py-2 border border-base-300 flex items-center gap-2" style={{ backgroundColor: `${color}08` }}>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-base-content truncate">{p.name}</p>
            <p className="text-xs text-base-content/40 font-semibold">{p.topic}</p>
          </div>
          <span className="text-xs font-black shrink-0" style={{ color: diffColor[p.diff] }}>{p.diff}</span>
          <div className="flex gap-0.5">
            {[1,2,3,4,5].map(s => (
              <Star key={s} size={7} fill={s <= p.conf ? color : "transparent"} style={{ color: s <= p.conf ? color : "rgba(0,0,0,0.15)" }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FeatureVisual({ visual, color }: { visual: NodeDef["visual"]; color: string }) {
  switch (visual) {
    case "dashboard": return <DashboardVisual color={color} />;
    case "repos":     return <ReposVisual color={color} />;
    case "streaks":   return <StreaksVisual color={color} />;
    case "goals":     return <GoalsVisual color={color} />;
    case "leetcode":  return <LeetCodeVisual color={color} />;
  }
}

// ─── Branch config ────────────────────────────────────────────────────────────

const MAIN_X = 100;
const BRANCH_X = 230;
const ROW_H = 380;
const TOP_PAD = 160;

interface NodeDef {
  id: string;
  type: "main" | "fork" | "branch" | "merge";
  title: string;
  tagline: string;
  desc: string;
  color: string;
  features: string[];
  visual: "dashboard" | "repos" | "streaks" | "goals" | "leetcode";
  cardSide: "left" | "right";
  icon: React.ElementType;
  href: string;
}

const NODES: NodeDef[] = [
  { id: "dashboard", type: "main",   title: "Dashboard", tagline: "Your command center.",       desc: "XP, level, streaks, and daily quests — all at a glance.",                        color: "#3b82f6", features: ["XP & level progression", "Daily quest board", "At-a-glance stats"],        visual: "dashboard", cardSide: "right", icon: LayoutDashboard, href: "/dashboard" },
  { id: "repos",     type: "fork",   title: "Repos",     tagline: "Every repo, gamified.",      desc: "Your repos ranked by activity. Click into any one for an interactive commit graph with branches, XP, and file diffs.", color: "#6366f1", features: ["Active / Stale / Abandoned status", "Interactive commit graph", "Activity decay tracking"],  visual: "repos",     cardSide: "left",  icon: GitBranch,       href: "/dashboard/repos" },
  { id: "streaks",   type: "branch", title: "Streaks",   tagline: "Consistency is the grind.",  desc: "GitHub and Leetcode streaks unified — one place to track your fire.",             color: "#f97316", features: ["Cross-platform streaks", "Current & best streak tracking", "Last activity status"],  visual: "streaks",   cardSide: "right", icon: Flame,           href: "/dashboard" },
  { id: "goals",     type: "merge",  title: "Goals",     tagline: "Ship. Complete. Level up.",  desc: "Daily quests auto-complete when you ship. Set custom goals on top.",              color: "#22c55e", features: ["Auto-tracked daily quests", "Custom goal builder", "Real-time updates"], visual: "goals",     cardSide: "left",  icon: Target,          href: "/dashboard/goals" },
  { id: "leetcode",  type: "main",   title: "Leetcode",  tagline: "Your problem journal.",      desc: "Track solves, confidence, topics, and notes — all in one place. Built for grinders.", color: "#f59e0b", features: ["Confidence star ratings", "Topic + difficulty filters", "Code & notes editor"], visual: "leetcode", cardSide: "right", icon: Code2, href: "/dashboard/leetcode" },
];

// ─── SVG Spine ────────────────────────────────────────────────────────────────

function BranchSpine({ activeIdx, totalHeight }: { activeIdx: number; totalHeight: number }) {
  const yOf = (i: number) => TOP_PAD + i * ROW_H + ROW_H / 2;
  const forkIdx  = NODES.findIndex(n => n.type === "fork");
  const branchIdx = NODES.findIndex(n => n.type === "branch");
  const mergeIdx = NODES.findIndex(n => n.type === "merge");

  return (
    <svg className="absolute left-0 top-0 pointer-events-none w-full" height={totalHeight}>
      {/* Main line segments */}
      {NODES.map((node, i) => {
        if (i >= NODES.length - 1) return null;
        if (node.type === "branch") return null; // branch row has no downward main line
        const nextMainI = NODES.findIndex((n, ni) => ni > i && n.type !== "branch");
        if (nextMainI === -1) return null;
        const isActive = i < activeIdx;
        return (
          <line key={`ml-${i}`}
            x1={MAIN_X} y1={yOf(i)}
            x2={MAIN_X} y2={yOf(nextMainI)}
            stroke={isActive ? node.color : "currentColor"}
            strokeWidth={isActive ? 2.5 : 1.5}
            strokeOpacity={isActive ? 0.5 : 0.12}
            className="text-base-content transition-all duration-700"
          />
        );
      })}

      {/* Fork curve: fork node → branch node */}
      <path
        d={`M ${MAIN_X} ${yOf(forkIdx)} C ${MAIN_X} ${yOf(forkIdx) + 70}, ${BRANCH_X} ${yOf(branchIdx) - 70}, ${BRANCH_X} ${yOf(branchIdx)}`}
        fill="none"
        stroke={activeIdx > forkIdx ? NODES[forkIdx].color : "currentColor"}
        strokeWidth={activeIdx > forkIdx ? 2.5 : 1.5}
        strokeOpacity={activeIdx > forkIdx ? 0.45 : 0.12}
        className="text-base-content transition-all duration-700"
      />

      {/* Merge curve: branch node → merge node */}
      <path
        d={`M ${BRANCH_X} ${yOf(branchIdx)} C ${BRANCH_X} ${yOf(branchIdx) + 70}, ${MAIN_X} ${yOf(mergeIdx) - 70}, ${MAIN_X} ${yOf(mergeIdx)}`}
        fill="none"
        stroke={activeIdx >= mergeIdx ? NODES[mergeIdx].color : "currentColor"}
        strokeWidth={activeIdx >= mergeIdx ? 2.5 : 1.5}
        strokeOpacity={activeIdx >= mergeIdx ? 0.45 : 0.12}
        className="text-base-content transition-all duration-700"
      />

      {/* Commit dots */}
      {NODES.map((node, i) => {
        const cx = node.type === "branch" ? BRANCH_X : MAIN_X;
        const cy = yOf(i);
        const isActive = i <= activeIdx;
        return (
          <g key={`dot-${i}`} className="transition-all duration-500">
            {isActive && <circle cx={cx} cy={cy} r={16} fill={node.color} fillOpacity={0.1} />}
            <circle cx={cx} cy={cy} r={8}
              fill="var(--fallback-b1,oklch(var(--b1)/1))"
              stroke={node.color}
              strokeWidth={isActive ? 2.5 : 1.5}
              strokeOpacity={isActive ? 1 : 0.25}
            />
            {isActive && <circle cx={cx} cy={cy} r={4} fill={node.color} />}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [activeIdx, setActiveIdx] = useState(-1);
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const totalHeight = TOP_PAD * 2 + NODES.length * ROW_H;

  useEffect(() => {
    if (isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, router]);

  useEffect(() => {
    const observers = nodeRefs.current.map((el, i) => {
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveIdx(i); },
        { threshold: 0.4 }
      );
      obs.observe(el);
      return obs;
    });
    return () => observers.forEach(o => o?.disconnect());
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-base-100">
      <Navbar />
      <main className="flex flex-col items-center">

        {/* Hero */}
        <section className="min-h-screen flex flex-col items-center justify-center text-center px-4 gap-6 w-full relative">
          <HeroText />
          <p className="max-w-md text-xl font-bold text-base-content/50">
            Your developer command center. XP, streaks, and goals — all in one place.
          </p>
          <a href={GITHUB_LOGIN_URL} className="btn btn-lg gap-3 font-black text-white border-none mt-2"
            style={{ backgroundColor: "var(--game-accent)", boxShadow: "0 6px 0 color-mix(in srgb, var(--game-accent) 50%, #000)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Get started with GitHub
          </a>
          <div className="absolute bottom-10 flex flex-col items-center gap-2 animate-bounce text-base-content/25">
            <span className="text-xs font-black tracking-widest uppercase">Scroll</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
          </div>
        </section>

        {/* Demo */}
        <section className="w-full max-w-3xl px-4 pb-24 flex flex-col gap-4 items-center">
          <h2 className="text-2xl font-black text-base-content">See it in action</h2>
          <div className="relative w-full rounded-2xl border-2 border-base-300 overflow-hidden"
            style={{ aspectRatio: "16/9", boxShadow: "0 8px 0 rgba(0,0,0,0.08)", backgroundColor: "color-mix(in srgb, var(--color-base-200) 80%, transparent)" }}>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-base-content/25">
              <div className="rounded-full p-5 border-2 border-current"><Play size={28} /></div>
              <p className="text-xs font-black tracking-widest uppercase">Demo coming soon</p>
            </div>
          </div>
        </section>

        {/* Branch graph — desktop */}
        <section id="features" className="w-full max-w-3xl px-4 pb-32">
          <h2 className="text-2xl font-black text-base-content mb-2 text-center">Explore the app</h2>
          <p className="text-center text-sm text-base-content/40 font-semibold mb-24">Scroll to explore each feature</p>

          {/* Desktop */}
          <div className="hidden md:block relative" style={{ height: totalHeight, isolation: "isolate" }}>
            <BranchSpine activeIdx={activeIdx} totalHeight={totalHeight} />

            {NODES.map((node, i) => {
              const Icon = node.icon;
              const isActive = i <= activeIdx;
              const cy = TOP_PAD + i * ROW_H + ROW_H / 2;
              const dotX = node.type === "branch" ? BRANCH_X : MAIN_X;
              const isRight = node.cardSide === "right";
              const CARD_W = 280;
              const GAP = 24;

              return (
                <div key={node.id}
                  ref={el => { nodeRefs.current[i] = el; }}
                  className="absolute"
                  style={{ top: cy - ROW_H / 2, left: 0, right: 0, height: ROW_H, pointerEvents: "none" }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2"
                    style={{
                      ...(isRight ? { left: dotX + GAP } : { right: `calc(100% - ${dotX - GAP}px)` }),
                      width: CARD_W,
                      pointerEvents: "auto",
                      opacity: isActive ? 1 : 0,
                      transform: isActive
                        ? "translateY(-50%)"
                        : `translateY(calc(-50% + ${isRight ? "-" : ""}12px))`,
                      transition: "opacity 0.55s ease, transform 0.55s ease",
                    }}
                  >
                    {/* Connector tick */}
                    <div className="absolute top-1/2 -translate-y-px h-px w-5"
                      style={{
                        backgroundColor: node.color,
                        opacity: isActive ? 0.35 : 0,
                        ...(isRight ? { right: "100%" } : { left: "100%" }),
                        transition: "opacity 0.55s ease",
                      }}
                    />

                    <a href={node.href}
                      className="block rounded-2xl border border-base-300 p-4 hover:scale-[1.02] transition-transform duration-200"
                      style={{
                        backgroundColor: "color-mix(in srgb, var(--color-base-200, #f5f5f5) 80%, transparent)",
                        boxShadow: isActive ? `0 6px 24px ${node.color}18, 0 0 0 1px ${node.color}18` : "none",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="rounded-lg p-1.5" style={{ backgroundColor: `${node.color}18` }}>
                          <Icon size={13} style={{ color: node.color }} />
                        </div>
                        <span className="font-black text-sm text-base-content">{node.title}</span>
                        {(node.type === "fork" || node.type === "branch" || node.type === "merge") && (
                          <span className="ml-auto text-xs font-black px-1.5 py-0.5 rounded-md"
                            style={{ color: node.color, backgroundColor: `${node.color}15` }}>
                            {node.type}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-black mb-0.5" style={{ color: node.color }}>{node.tagline}</p>
                      <p className="text-xs font-semibold text-base-content/50 mb-3 leading-relaxed">{node.desc}</p>
                      <FeatureVisual visual={node.visual} color={node.color} />
                      <ul className="flex flex-col gap-1 mt-3 mb-3">
                        {node.features.map((f, fi) => (
                          <li key={fi} className="flex items-center gap-2 text-xs font-semibold text-base-content/60"
                            style={{
                              opacity: isActive ? 1 : 0,
                              transform: isActive ? "translateX(0)" : "translateX(-8px)",
                              transition: `opacity 0.4s ease ${0.1 + fi * 0.08}s, transform 0.4s ease ${0.1 + fi * 0.08}s`,
                            }}>
                            <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: node.color }} />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <div className="flex items-center gap-1 text-xs font-black" style={{ color: node.color }}>
                        Open {node.title} <ArrowRight size={11} />
                      </div>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile fallback */}
          <div className="md:hidden flex flex-col gap-4">
            {NODES.map((node) => {
              const Icon = node.icon;
              return (
                <a key={node.id} href={node.href} className="rounded-2xl border border-base-300 p-4"
                  style={{ backgroundColor: `${node.color}08` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="rounded-lg p-1.5" style={{ backgroundColor: `${node.color}18` }}>
                      <Icon size={13} style={{ color: node.color }} />
                    </div>
                    <span className="font-black text-sm text-base-content">{node.title}</span>
                  </div>
                  <p className="text-xs font-semibold text-base-content/50 mb-3">{node.desc}</p>
                  <FeatureVisual visual={node.visual} color={node.color} />
                  <div className="flex items-center gap-1 text-xs font-black mt-3" style={{ color: node.color }}>
                    Open {node.title} <ArrowRight size={11} />
                  </div>
                </a>
              );
            })}
          </div>
        </section>

        {/* CTA */}
        <section className="min-h-[40vh] flex flex-col items-center justify-center text-center px-4 gap-5 pb-24">
          <h2 className="text-4xl font-black text-base-content">Ready to level up?</h2>
          <p className="text-base-content/50 font-semibold max-w-sm">Connect GitHub, start grinding, watch your XP climb.</p>
          <a href={GITHUB_LOGIN_URL} className="btn btn-lg gap-3 font-black text-white border-none"
            style={{ backgroundColor: "var(--game-accent)", boxShadow: "0 6px 0 color-mix(in srgb, var(--game-accent) 50%, #000)" }}>
            Get started free
          </a>
        </section>

      </main>


    </div>
  );
}