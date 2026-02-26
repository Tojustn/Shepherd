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
import { ArrowLeft, X } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const NODE_SIZE = 72;
const SPACING_Y  = 80;   // tight — nodes nearly touch, creating the snake effect
const ZIG_X      = 85;


interface Commit {
  sha: string;
  message: string;
  date: string;
  author: string;
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
  added:    { cls: "bg-green-500/15 text-green-500",  label: "A" },
  removed:  { cls: "bg-red-500/15 text-red-500",     label: "R" },
  modified: { cls: "bg-blue-500/15 text-blue-400",   label: "M" },
  renamed:  { cls: "bg-purple-500/15 text-purple-400", label: "N" },
};

// No onClick here — React Flow's pan swallows it.
// Clicks are handled via onNodeClick on <ReactFlow> instead.

function CommitNode({ data }: NodeProps) {
  const d = data as unknown as Commit & { isLatest: boolean };

  return (
    <div style={{ cursor: "pointer" }}>
      <Handle type="target" position={Position.Top}    style={{ opacity: 0 }} />
      <div
        className="rounded-full border-2 flex flex-col items-center justify-center transition-all"
        style={{
          width: NODE_SIZE,
          height: NODE_SIZE,
          backgroundColor: d.isLatest ? "var(--game-accent)"          : "var(--color-base-200)",
          borderColor:     d.isLatest ? "var(--game-accent)"          : "color-mix(in oklch, var(--color-base-content) 20%, transparent)",
          boxShadow:       d.isLatest ? "0 0 24px color-mix(in oklch, var(--game-accent) 50%, transparent)" : "0 2px 6px rgba(0,0,0,0.15)",
          color:           d.isLatest ? "color-mix(in oklch, var(--game-accent) 20%, black)" : "var(--color-base-content)",
        }}
      >
        <p className="font-black" style={{ fontSize: 9, fontFamily: "monospace", opacity: d.isLatest ? 0.7 : 0.5 }}>
          {d.sha.slice(0, 7)}
        </p>
        <p className="font-bold" style={{ fontSize: 8, marginTop: 2, opacity: d.isLatest ? 0.55 : 0.35 }}>
          {timeAgo(d.date)}
        </p>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}


function MilestoneNode({ data }: NodeProps) {
  const d = data as { level: number };
  return (
    <div>
      <Handle type="target" position={Position.Top}    style={{ opacity: 0 }} />
      <div
        className="rounded-full border-2 flex flex-col items-center justify-center"
        style={{
          width: NODE_SIZE + 12,
          height: NODE_SIZE + 12,
          backgroundColor: "color-mix(in oklch, #f59e0b 12%, transparent)",
          borderColor: "#f59e0b",
          boxShadow: "0 0 28px rgba(245,158,11,0.35), 0 0 56px rgba(245,158,11,0.1)",
        }}
      >
        <span style={{ fontSize: 20, lineHeight: 1 }}>⭐</span>
        <p className="font-black" style={{ fontSize: 9, color: "#f59e0b", marginTop: 3, letterSpacing: "0.05em" }}>
          LEVEL {d.level}
        </p>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { commitNode: CommitNode, milestoneNode: MilestoneNode };


type DisplayItem =
  | { kind: "commit"; commit: Commit; isLatest: boolean }
  | { kind: "milestone"; level: number };

function buildGraph(commits: Commit[], token: string, repoName: string): Node[] {
  const oldestFirst = [...commits].reverse();
  const newestSha   = commits[0]?.sha;
  const items: DisplayItem[] = [];

  for (let i = 0; i < oldestFirst.length; i++) {
    items.push({ kind: "commit", commit: oldestFirst[i], isLatest: oldestFirst[i].sha === newestSha });
    if ((i + 1) % 10 === 0 && i < oldestFirst.length - 1) {
      items.push({ kind: "milestone", level: Math.floor((i + 1) / 10) });
    }
  }

  items.reverse(); // newest = index 0 = top (small y)

  return items.map((item, i) => {
    const x = i % 2 === 0 ? ZIG_X : -ZIG_X;
    const y = i * SPACING_Y;
    if (item.kind === "milestone") {
      return { id: `milestone-${item.level}`, type: "milestoneNode", position: { x, y }, data: { level: item.level }, draggable: false };
    }
    return {
      id: item.commit.sha, type: "commitNode", position: { x, y },
      data: { ...item.commit, repoName, token, isLatest: item.isLatest },
      draggable: false,
    };
  });
}


function CommitModal({ detail, loading, onClose }: {
  detail: CommitDetail | null;
  loading: boolean;
  onClose: () => void;
}) {
  const xp = detail ? calcXP(detail) : null;

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-5 bg-black/50 backdrop-blur-sm"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[440px] bg-base-200 border border-base-300 rounded-2xl p-5 shadow-2xl"
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }}
      >
        {/* Header */}
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
            <span className="font-bold text-base-content/40 text-xs">{detail.files.length} file{detail.files.length !== 1 ? "s" : ""}</span>
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
              <p className="font-bold text-base-content/25 text-[9px]">
                10 base + 2 * {detail.files.length} files
              </p>
            </div>
            <span className="font-black text-2xl" style={{ color: "var(--game-accent)" }}>+{xp} XP</span>
          </div>
        </>}
      </div>
    </div>,
    document.body
  );
}


export default function RepoDetailPage() {
  const params   = useParams();
  const repoName = params.name as string;
  const { token, logout } = useAuth();

  const [commits, setCommits]           = useState<Commit[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [, , onEdgesChange]              = useEdgesState<Edge>([]);
  const [selectedSha, setSelectedSha]   = useState<string | null>(null);
  const [modalDetail, setModalDetail]   = useState<CommitDetail | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const rfRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);

  const closeModal = useCallback(() => setSelectedSha(null), []);

  // Handle node click — must be on ReactFlow, not inside the node
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === "commitNode") setSelectedSha(node.id);
  }, []);

  // Fetch commit list
  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/github/repos/${repoName}/commits`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => { if (r.status === 401) { logout(); return; } if (!r.ok) return; return r.json(); })
      .then((data?: Commit[]) => { if (data) setCommits(data); })
      .catch(() => {});
  }, [token, repoName, logout]);

  // Build graph + fit to newest nodes
  useEffect(() => {
    if (!commits.length || !token) return;
    const n = buildGraph(commits, token, repoName);
    setNodes(n);
    setTimeout(() => {
      rfRef.current?.fitView({
        nodes: n.slice(0, 5).map(node => ({ id: node.id })),
        padding: 0.4,
        duration: 400,
        maxZoom: 1.5,
      });
    }, 50);
  }, [commits, token, repoName, setNodes]);

  // Fetch commit detail when selected
  useEffect(() => {
    if (!selectedSha || !token) return;
    setModalDetail(null);
    setModalLoading(true);
    fetch(`${API_URL}/api/github/repos/${repoName}/commits/${selectedSha}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setModalDetail(data); })
      .catch(() => {})
      .finally(() => setModalLoading(false));
  }, [selectedSha, token, repoName]);

  const levelsReached = Math.floor(commits.length / 10);

  return (
    <div className="relative w-full h-screen bg-base-100">

      {/* Header */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center gap-3 px-5 py-3.5 bg-base-100/90 backdrop-blur border-b border-base-300">
        <Link href="/dashboard/repos" className="text-base-content/40 hover:text-base-content/70 transition-colors flex items-center">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="font-black text-xl text-base-content leading-none">⚔️ {repoName}</h1>
          <p className="font-bold text-[11px] text-base-content/40 mt-0.5">
            {commits.length === 0
              ? "Loading commits…"
              : `${commits.length} commits · ${levelsReached} level${levelsReached !== 1 ? "s" : ""} reached`}
          </p>
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={[]}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        nodeOrigin={[0.5, 0.5]}
        onInit={instance => { rfRef.current = instance; }}
        onNodeClick={onNodeClick}
        fitView={false}
        defaultViewport={{ x: 0, y: 80, zoom: 1 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        zoomOnScroll={false}
        style={{ background: "transparent" }}
      >
        <Background
          color="var(--color-base-content)"
          style={{ opacity: 0.05 }}
          gap={28}
        />
      </ReactFlow>

      {selectedSha && (
        <CommitModal detail={modalDetail} loading={modalLoading} onClose={closeModal} />
      )}
    </div>
  );
}
