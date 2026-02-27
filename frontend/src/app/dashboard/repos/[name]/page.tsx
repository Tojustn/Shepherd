"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/auth";
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type NodeProps,
  type Node,
  type Edge,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, X, GitBranch } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────

interface Commit {
  sha: string;
  message: string;
  date: string;
  author: string;
}

interface BranchData {
  name: string;
  sha: string;
  date: string;
  commits: Commit[];
}

interface CommitDetail {
  sha: string;
  message: string;
  date: string;
  author: string;
  additions: number;
  deletions: number;
  files: { filename: string; additions: number; deletions: number; status: string }[];
}

// ── Layout constants ──────────────────────────────────────────────────────

const ROW_H  = 120;
const LANE_W = 250;
const NODE_W = 180;
const NODE_H = 76;
const HEAD_W = 192;
const HEAD_H = 92;

// Lane 0 = main (accent), lanes 1–3 = feature branch colours
const LANE_COLORS = [
  "var(--game-accent)",
  "#a78bfa",   // violet
  "#34d399",   // emerald
  "#f472b6",   // pink
];

// ── Helpers ───────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function calcXP(d: CommitDetail) {
  return 10 + d.files.length * 2;
}

const FILE_STATUS: Record<string, { cls: string; label: string }> = {
  added:    { cls: "bg-green-500/15 text-green-500",   label: "A" },
  removed:  { cls: "bg-red-500/15 text-red-500",      label: "R" },
  modified: { cls: "bg-blue-500/15 text-blue-400",    label: "M" },
  renamed:  { cls: "bg-purple-500/15 text-purple-400", label: "N" },
};

// ── Graph layout helpers ──────────────────────────────────────────────────

/** Interpolated Y position for a date inside the main commit timeline */
function dateToY(date: string, mainCommits: Commit[]): number {
  if (!mainCommits.length) return 0;
  const d = new Date(date).getTime();
  const newestMs = new Date(mainCommits[0].date).getTime();
  if (d >= newestMs) return -ROW_H * 0.65;

  for (let i = 0; i < mainCommits.length - 1; i++) {
    const curr = new Date(mainCommits[i].date).getTime();
    const next = new Date(mainCommits[i + 1].date).getTime();
    if (d <= curr && d > next) {
      const frac = curr === next ? 0 : (curr - d) / (curr - next);
      return (i + frac) * ROW_H;
    }
  }
  return (mainCommits.length - 0.5) * ROW_H;
}

function detectDefaultBranch(mainCommits: Commit[], branches: BranchData[]): string {
  const sha = mainCommits[0]?.sha;
  if (sha) {
    const m = branches.find(b => b.sha === sha);
    if (m) return m.name;
  }
  return branches.find(b => b.name === "main" || b.name === "master")?.name ?? "main";
}

// ── Graph builder ─────────────────────────────────────────────────────────

function buildGraph(
  mainCommits: Commit[],
  allBranches: BranchData[],
  defaultBranch: string,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const featureBranches = allBranches
    .filter(b => b.name !== defaultBranch && b.commits?.length)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 3);

  // ── Main lane ──
  mainCommits.forEach((commit, i) => {
    const isHead      = i === 0;
    const isMilestone = (i + 1) % 10 === 0 && i < mainCommits.length - 1;
    nodes.push({
      id: `m-${commit.sha}`,
      type: "commitNode",
      position: { x: 0, y: i * ROW_H },
      data: {
        sha: commit.sha, message: commit.message,
        date: commit.date, author: commit.author,
        isHead, isBranchHead: false,
        color: LANE_COLORS[0],
        milestone: isMilestone ? Math.floor((i + 1) / 10) : 0,
      },
      draggable: false,
    });

    if (i > 0) {
      edges.push({
        id: `me-${i}`,
        source: `m-${mainCommits[i - 1].sha}`,
        target: `m-${commit.sha}`,
        sourceHandle: "bottom",
        targetHandle: "top",
        type: "straight",
        style: { stroke: LANE_COLORS[0], strokeWidth: 2.5, opacity: 0.5 },
        animated: i === 1, // pulse on the head→head-1 connection
      });
    }
  });

  // Main branch label
  if (mainCommits.length) {
    nodes.push({
      id: "lbl-main",
      type: "branchLabelNode",
      position: { x: 0, y: -ROW_H * 0.65 - 52 },
      data: { name: defaultBranch, color: LANE_COLORS[0], isMain: true },
      draggable: false,
    });
  }

  // ── Feature branches ──
  featureBranches.forEach((branch, bi) => {
    const color  = LANE_COLORS[bi + 1];
    const laneX  = (bi + 1) * LANE_W;
    const bCmts  = branch.commits;
    const ids: string[] = [];

    bCmts.forEach((commit, j) => {
      const y  = dateToY(commit.date, mainCommits);
      const id = `b${bi}-${j}`;
      ids.push(id);

      nodes.push({
        id,
        type: "commitNode",
        position: { x: laneX, y },
        data: {
          sha: commit.sha, message: commit.message,
          date: commit.date, author: commit.author,
          isHead: false,
          isBranchHead: j === 0,
          color,
          milestone: 0,
        },
        draggable: false,
      });

      if (j > 0) {
        edges.push({
          id: `be${bi}-${j}`,
          source: ids[j - 1],
          target: id,
          sourceHandle: "bottom",
          targetHandle: "top",
          type: "straight",
          style: { stroke: color, strokeWidth: 2, opacity: 0.6 },
        });
      }
    });

    // Fork edge: main divergence → oldest branch commit
    const oldestY    = dateToY(bCmts[bCmts.length - 1].date, mainCommits);
    const divergeIdx = Math.min(Math.max(0, Math.round(oldestY / ROW_H)), mainCommits.length - 1);
    edges.push({
      id: `fork-${bi}`,
      source: `m-${mainCommits[divergeIdx].sha}`,
      target: ids[ids.length - 1],
      sourceHandle: "right",
      targetHandle: "left",
      type: "default",
      style: { stroke: color, strokeWidth: 1.75, strokeDasharray: "7 4", opacity: 0.8 },
    });

    // Branch label above head commit
    const headY = dateToY(bCmts[0].date, mainCommits);
    nodes.push({
      id: `lbl-${bi}`,
      type: "branchLabelNode",
      position: { x: laneX, y: headY - 56 },
      data: { name: branch.name, color, isMain: false },
      draggable: false,
    });
  });

  return { nodes, edges };
}

// ── Node: commit ──────────────────────────────────────────────────────────

function CommitNode({ data }: NodeProps) {
  const d = data as unknown as {
    sha: string; message: string; date: string; author: string;
    isHead: boolean; isBranchHead: boolean; color: string; milestone: number;
  };

  const w = d.isHead ? HEAD_W : NODE_W;
  const h = d.isHead ? HEAD_H : NODE_H;

  return (
    <div style={{ width: w, height: h, cursor: "pointer", position: "relative" }}>
      <Handle id="top"    type="target" position={Position.Top}    style={{ opacity: 0 }} />
      <Handle id="left"   type="target" position={Position.Left}   style={{ opacity: 0 }} />
      <Handle id="bottom" type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle id="right"  type="source" position={Position.Right}  style={{ opacity: 0 }} />

      <div style={{
        width: "100%", height: "100%",
        borderRadius: 14,
        border: `2.5px solid ${d.color}`,
        background: d.isHead
          ? `color-mix(in oklch, ${d.color} 11%, var(--color-base-200))`
          : "var(--color-base-200)",
        boxShadow: d.isHead
          ? `0 0 32px color-mix(in oklch, ${d.color} 55%, transparent), 0 0 64px color-mix(in oklch, ${d.color} 20%, transparent), 0 6px 20px rgba(0,0,0,0.32)`
          : "0 3px 10px rgba(0,0,0,0.18)",
        padding: "10px 14px",
        overflow: "hidden",
        position: "relative",
      }}>

        {/* HEAD badge */}
        {d.isHead && (
          <div style={{
            position: "absolute", top: 8, right: 9,
            background: d.color, color: "white",
            fontSize: 8, fontWeight: 900, fontFamily: "monospace",
            letterSpacing: "0.08em", padding: "2px 7px", borderRadius: 5,
          }}>HEAD</div>
        )}

        {/* Branch-head dot */}
        {d.isBranchHead && !d.isHead && (
          <div style={{
            position: "absolute", top: 9, right: 10,
            width: 7, height: 7, borderRadius: "50%",
            background: d.color,
            boxShadow: `0 0 8px ${d.color}88`,
          }} />
        )}

        {/* Milestone badge */}
        {d.milestone > 0 && (
          <div style={{
            position: "absolute", top: 8, right: 9,
            fontSize: 9, fontWeight: 900,
            letterSpacing: "0.05em", padding: "2px 7px", borderRadius: 5,
            background: "#f59e0b22", color: "#f59e0b",
            border: "1px solid #f59e0b66",
          }}>⭐ LVL {d.milestone}</div>
        )}

        {/* SHA + meta */}
        <p style={{
          fontFamily: "monospace", fontSize: 10,
          color: d.color, opacity: 0.9, marginBottom: 5,
        }}>
          {d.sha.slice(0, 7)} · {timeAgo(d.date)}
        </p>

        {/* Message */}
        <p style={{
          fontSize: d.isHead ? 12 : 11, fontWeight: 900,
          color: d.isHead ? d.color : "var(--color-base-content)",
          opacity: d.isHead ? 1 : 0.85,
          lineHeight: 1.35,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}>
          {d.message}
        </p>
      </div>
    </div>
  );
}

// ── Node: branch label pill ───────────────────────────────────────────────

function BranchLabelNode({ data }: NodeProps) {
  const d = data as unknown as { name: string; color: string; isMain: boolean };
  return (
    <div style={{
      padding: "5px 14px 5px 10px",
      borderRadius: 20,
      border: `1.5px solid ${d.color}`,
      background: `color-mix(in oklch, ${d.color} 10%, var(--color-base-200))`,
      color: d.color,
      fontSize: 11, fontWeight: 900, fontFamily: "monospace",
      whiteSpace: "nowrap",
      display: "flex", alignItems: "center", gap: 6,
      cursor: "default",
      boxShadow: `0 0 16px color-mix(in oklch, ${d.color} 22%, transparent), 0 2px 6px rgba(0,0,0,0.15)`,
    }}>
      <Handle id="bottom" type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      {d.isMain ? "⎇" : "⎇"} {d.name}
    </div>
  );
}

const nodeTypes = { commitNode: CommitNode, branchLabelNode: BranchLabelNode };

// ── Commit detail modal ───────────────────────────────────────────────────

function CommitModal({
  detail, loading, onClose,
}: { detail: CommitDetail | null; loading: boolean; onClose: () => void }) {
  const xp = detail ? calcXP(detail) : null;

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return createPortal(
    <div onClick={onClose}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-5 bg-black/50 backdrop-blur-sm">
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-[440px] bg-base-200 border border-base-300 rounded-2xl p-5 shadow-2xl"
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }}>

        <div className="flex justify-between items-start mb-3">
          <div className="flex gap-2 items-center flex-wrap">
            {detail && <>
              <span className="font-black text-base-content/40 font-mono text-[10px]">{detail.sha.slice(0, 7)}</span>
              <span className="font-bold text-base-content/30 text-[10px]">{timeAgo(detail.date)} · {detail.author}</span>
            </>}
            {loading && !detail && <span className="font-bold text-base-content/40 text-xs">Loading…</span>}
          </div>
          <button onClick={onClose} className="text-base-content/30 hover:text-base-content/70 transition-colors p-0.5">
            <X size={15} />
          </button>
        </div>

        {detail && <>
          <p className="font-black text-base-content text-[15px] leading-snug mb-4">{detail.message}</p>

          <div className="flex gap-3 mb-3">
            <span className="font-black text-green-500 text-xs">+{detail.additions}</span>
            <span className="font-black text-red-500 text-xs">-{detail.deletions}</span>
            <span className="font-bold text-base-content/40 text-xs">
              {detail.files.length} file{detail.files.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="flex flex-col gap-1.5 mb-4 max-h-48 overflow-y-auto">
            {detail.files.map(f => {
              const s = FILE_STATUS[f.status] ?? FILE_STATUS.modified;
              return (
                <div key={f.filename} className="flex items-center gap-2">
                  <span className={`text-[9px] font-black px-1.5 py-px rounded shrink-0 ${s.cls}`}>{s.label}</span>
                  <span className="font-mono text-[11px] text-base-content/50 overflow-hidden text-ellipsis whitespace-nowrap flex-1">{f.filename}</span>
                  <span className="text-[10px] font-bold text-base-content/25 shrink-0">+{f.additions} -{f.deletions}</span>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between items-center border-t border-base-300 pt-3">
            <div>
              <p className="font-bold text-base-content/40 text-[10px] mb-1">Base XP breakdown</p>
              <p className="font-bold text-base-content/25 text-[9px]">10 base + 2 × {detail.files.length} files</p>
            </div>
            <span className="font-black text-2xl" style={{ color: "var(--game-accent)" }}>+{xp} XP</span>
          </div>
        </>}
      </div>
    </div>,
    document.body,
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function RepoDetailPage() {
  const params   = useParams();
  const repoName = params.name as string;
  const { token, logout } = useAuth();

  const [mainCommits, setMainCommits] = useState<Commit[]>([]);
  const [branches,    setBranches]    = useState<BranchData[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedSha,  setSelectedSha]  = useState<string | null>(null);
  const [modalDetail,  setModalDetail]  = useState<CommitDetail | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const rfRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);

  const closeModal  = useCallback(() => setSelectedSha(null), []);
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === "commitNode") setSelectedSha((node.data as { sha: string }).sha);
  }, []);

  // Fetch main commits + branches in parallel
  useEffect(() => {
    if (!token) return;
    const h = { Authorization: `Bearer ${token}` };

    fetch(`${API_URL}/api/github/repos/${repoName}/commits`, { headers: h })
      .then(r => { if (r.status === 401) logout(); return r.ok ? r.json() : []; })
      .then((d: Commit[]) => setMainCommits(d))
      .catch(() => {});

    fetch(`${API_URL}/api/github/repos/${repoName}/branches`, { headers: h })
      .then(r => r.ok ? r.json() : [])
      .then((d: BranchData[]) => setBranches(d))
      .catch(() => {});
  }, [token, repoName, logout]);

  // Rebuild graph whenever data arrives
  useEffect(() => {
    if (!mainCommits.length) return;
    const defaultBranch = detectDefaultBranch(mainCommits, branches);
    const { nodes: n, edges: e } = buildGraph(mainCommits, branches, defaultBranch);
    setNodes(n);
    setEdges(e);

    setTimeout(() => {
      const topNodes = n.filter(x => x.id.startsWith("m-")).slice(0, 6);
      rfRef.current?.fitView({ nodes: topNodes, padding: 0.4, duration: 500, maxZoom: 1.2 });
    }, 60);
  }, [mainCommits, branches, setNodes, setEdges]);

  // Fetch commit detail on click
  useEffect(() => {
    if (!selectedSha || !token) return;
    setModalDetail(null);
    setModalLoading(true);
    fetch(`${API_URL}/api/github/repos/${repoName}/commits/${selectedSha}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setModalDetail(d); })
      .catch(() => {})
      .finally(() => setModalLoading(false));
  }, [selectedSha, token, repoName]);

  const defaultBranch    = detectDefaultBranch(mainCommits, branches);
  const featureBranchCnt = branches.filter(b => b.name !== defaultBranch).length;

  return (
    <div className="relative w-full h-screen bg-base-100">

      {/* Header */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center gap-3 px-5 py-3.5 bg-base-100/90 backdrop-blur border-b border-base-300">
        <Link href="/dashboard/repos" className="text-base-content/40 hover:text-base-content/70 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-black text-xl text-base-content leading-none">⚔️ {repoName}</h1>
          <p className="font-bold text-[11px] text-base-content/40 mt-0.5">
            {mainCommits.length === 0
              ? "Loading commits…"
              : `${mainCommits.length} commits · ${defaultBranch}`}
          </p>
        </div>
        {featureBranchCnt > 0 && (
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black"
            style={{
              color: "var(--game-accent)",
              background: "color-mix(in oklch, var(--game-accent) 12%, transparent)",
            }}
          >
            <GitBranch size={12} />
            {featureBranchCnt} branch{featureBranchCnt > 1 ? "es" : ""}
          </div>
        )}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        nodeOrigin={[0.5, 0.5]}
        onInit={instance => { rfRef.current = instance; }}
        onNodeClick={onNodeClick}
        fitView={false}
        defaultViewport={{ x: 300, y: 120, zoom: 1 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        zoomOnScroll={false}
        style={{ background: "transparent", paddingTop: 56 }}
      >
        <Background
          color="var(--color-base-content)"
          style={{ opacity: 0.045 }}
          gap={28}
        />
      </ReactFlow>

      {selectedSha && (
        <CommitModal detail={modalDetail} loading={modalLoading} onClose={closeModal} />
      )}
    </div>
  );
}
