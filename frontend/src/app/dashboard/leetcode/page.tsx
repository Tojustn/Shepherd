"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import NoteEditor from "@/components/NoteEditor";
import SyntaxHighlighter from "react-syntax-highlighter";
import { atomOneDark } from "react-syntax-highlighter/dist/esm/styles/hljs";
import { atomOneLight } from "react-syntax-highlighter/dist/esm/styles/hljs";
import CodeMirror from "@uiw/react-codemirror";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import { python }     from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { java }       from "@codemirror/lang-java";
import { cpp }        from "@codemirror/lang-cpp";
import { rust }       from "@codemirror/lang-rust";
import { go }         from "@codemirror/lang-go";
import { useTheme }   from "@/context/theme";
import { useAuth } from "@/context/auth";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import {
  Code2, Search, Plus, ChevronDown, ChevronUp,
  X, Check, Loader2, Pencil, ArrowUp, ArrowDown, SlidersHorizontal, Trash2, ExternalLink, Download, Upload, MoreHorizontal,
  Eye, SkipForward, Sparkles, Brain, HelpCircle, Timer, Zap, BarChart3, PieChart as PieChartIcon, RefreshCw, ListTodo, GripVertical, Archive,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────

interface SearchResult {
  leetcode_id: number;
  title: string;
  slug: string;
  difficulty: string;
  topics: string[];
}

interface Problem {
  id: number;
  leetcode_id: number;
  title: string;
  slug: string;
  difficulty: string;
  topics: string[];
}

interface Solve {
  id: number;
  user_id: number;
  problem: Problem;
  notes: string | null;
  code: string | null;
  language: string | null;
  time_complexity: string | null;
  space_complexity: string | null;
  confidence: number | null;
  solved_at: string;
  xp_awarded: number;
  is_imported: boolean;
}

interface SolveGroup {
  problem: Problem;
  solves: Solve[]; // sorted oldest-first
}

interface ReviewDueItem {
  problem: Problem;
  box: number;
  next_review_at: string;
  last_solve: Solve | null;
  solve_count: number;
  imported_only: boolean;
}

interface ReviewStats {
  done_today: number;
  box_counts: Record<string, number>;
  active: number;
  graduated: number;
  due_now: number;
  due_tomorrow: number;
  due_week: number;
}

interface TodoList {
  id: number;
  name: string;
  position: number;
}

interface TodoItem {
  id: number;
  problem: Problem;
  added_at: string;
  list_id: number | null; // null = Backlog
  position: number;
  done: boolean;
}

// ── Query Builder Types ────────────────────────────────────────────────────

type Field    = "difficulty" | "language" | "confidence" | "topic" | "solveCount" | "imported" | "date";
type Operator = "is" | "is_not" | "gte" | "lte" | "includes" | "excludes";

interface FilterRule {
  id: string;
  field: Field;
  operator: Operator;
  value: string | number;
}

interface FilterGroup {
  id: string;
  combinator: "and" | "or";
  rules: (FilterRule | FilterGroup)[];
}

// ── Constants ─────────────────────────────────────────────────────────────

const DIFF_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  easy:   { text: "#22c55e", bg: "#22c55e14", border: "#22c55e44" },
  medium: { text: "#f59e0b", bg: "#f59e0b14", border: "#f59e0b44" },
  hard:   { text: "#ef4444", bg: "#ef444414", border: "#ef444444" },
};

const DIFF_XP: Record<string, number> = { easy: 20, medium: 40, hard: 80 };

// ── Leitner spaced-repetition (mirrors backend) ─────────────────────────────
const BOX_DAYS: Record<number, number> = { 1: 1, 2: 3, 3: 7, 4: 21, 5: 60 };
const MAX_BOX = 5;

// Default daily review goal — deliberately modest, since low-box reviews are
// full re-solves. Adjustable in the Review header; persisted per browser.
const DEFAULT_REVIEW_GOAL = 8;
const REVIEW_GOAL_CHOICES = [5, 8, 12, 15, 20];

function useDailyGoal(): [number, (n: number) => void] {
  const [goal, setGoal] = useState(DEFAULT_REVIEW_GOAL);
  useEffect(() => {
    const raw = localStorage.getItem("lc-review-goal");
    if (raw && Number(raw) > 0) setGoal(Number(raw));
  }, []);
  const update = (n: number) => {
    setGoal(n);
    localStorage.setItem("lc-review-goal", String(n));
  };
  return [goal, update];
}
// At/above this box, review by blueprinting the approach (~3 min) instead of
// coding from scratch — old problems become a fast warm-up, not a 20-min slog.
// Box 3 (7-day mark) and up speed-run; boxes 1–2 still code from scratch.
const SPEEDRUN_BOX = 3;

// Rough re-solve minutes by difficulty. These are REVIEW times, not fresh-solve
// times — you've solved the problem before, so recall + rewrite is much faster.
const REVIEW_RESOLVE_MINUTES: Record<string, number> = { easy: 8, medium: 15, hard: 25 };

/** Rough minutes for one review: high boxes ~3-min blueprints, low boxes a re-solve. */
function reviewMinutes(i: ReviewDueItem): number {
  if (!i.imported_only && i.box >= SPEEDRUN_BOX) return 4;
  return REVIEW_RESOLVE_MINUTES[i.problem.difficulty.toLowerCase()] ?? 15;
}
function fmtMinutes(m: number): string {
  if (m < 60) return `~${m}m`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `~${h}h ${r.toString().padStart(2, "0")}m` : `~${h}h`;
}

/** Compact overdue label for queue rows ("today", "3d", "2mo"). */
function shortOverdue(dateStr: string): string {
  const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (d <= 0) return "today";
  if (d < 30) return `${d}d`;
  if (d < 365) return `${Math.floor(d / 30)}mo`;
  return `${Math.floor(d / 365)}y`;
}

/** Boxes a passing review advances: a flawless "Mastered" (5) fast-tracks +2. */
function passIncrement(confidence: number): number {
  return confidence >= 5 ? 2 : 1;
}

/** Predict the resulting box for a given confidence in review, matching the backend. */
function predictBox(currentBox: number, confidence: number | null): number {
  if (confidence == null) return Math.max(currentBox, 1);
  if (confidence < 3) return 1;
  return Math.min(currentBox + passIncrement(confidence), MAX_BOX);
}

function boxDaysLabel(days: number): string {
  if (days === 1) return "1 day";
  if (days < 7) return `${days} days`;
  if (days === 7) return "1 week";
  if (days < 30) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}

/** Human label for a due date that's typically in the past ("due today", "3d overdue"). */
function dueLabel(dateStr: string): string {
  const diffDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diffDays <= 0) return "due today";
  if (diffDays === 1) return "1 day overdue";
  if (diffDays < 30) return `${diffDays} days overdue`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo overdue`;
  return `${Math.floor(diffDays / 365)}y overdue`;
}

const DIFF_ORDER: Record<string, number> = { easy: 0, medium: 1, hard: 2 };

const CONFIDENCE_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "Struggled",  color: "#ef4444" },
  2: { label: "Shaky",      color: "#f97316" },
  3: { label: "Got It",     color: "#f59e0b" },
  4: { label: "Solid",      color: "#22c55e" },
  5: { label: "Mastered",   color: "#a78bfa" },
};

const LANGUAGES = [
  "Python", "JavaScript", "TypeScript", "Java", "C++",
  "C", "Go", "Rust", "Swift", "Kotlin", "C#",
];

const LANG_COLORS: Record<string, string> = {
  python:     "#3b82f6",
  javascript: "#f7dc6f",
  typescript: "#3178c6",
  java:       "#f89820",
  "c++":      "#00599c",
  c:          "#a8b9cc",
  go:         "#00acd7",
  rust:       "#ce422b",
  swift:      "#f05138",
  kotlin:     "#7f52ff",
  "c#":       "#9b4f96",
};

const LC_TOPICS = [
  "Array", "String", "Hash Table", "Dynamic Programming", "Math", "Sorting",
  "Greedy", "Depth-First Search", "Breadth-First Search", "Binary Search",
  "Tree", "Matrix", "Two Pointers", "Bit Manipulation", "Prefix Sum",
  "Heap (Priority Queue)", "Graph", "Simulation", "Backtracking", "Stack",
  "Counting", "Sliding Window", "Union Find", "Linked List", "Monotonic Stack",
  "Ordered Set", "Divide and Conquer", "Queue", "Trie", "Recursion",
  "Memoization", "Binary Indexed Tree", "Segment Tree", "Geometry",
  "Topological Sort", "Number Theory", "Combinatorics", "Game Theory",
  "Shortest Path", "Iterator", "Design", "Interactive",
];

const SORT_OPTIONS = [
  { id: "lastSolved", label: "Last Solved"  },
  { id: "id",         label: "Problem #"    },
  { id: "difficulty", label: "Difficulty"   },
  { id: "confidence", label: "Confidence"   },
  { id: "solveCount", label: "Solve Count"  },
] as const;

// ── Query Builder Config ───────────────────────────────────────────────────

const FIELD_LABELS: Record<Field, string> = {
  difficulty: "Difficulty",
  language:   "Language",
  confidence: "Confidence",
  topic:      "Topic",
  solveCount: "Solve Count",
  imported:   "Imported",
  date:       "Solved Date",
};

const FIELD_OPERATORS: Record<Field, { op: Operator; label: string }[]> = {
  difficulty: [
    { op: "is",     label: "is"     },
    { op: "is_not", label: "is not" },
  ],
  language: [
    { op: "is",     label: "is"     },
    { op: "is_not", label: "is not" },
  ],
  confidence: [
    { op: "is",     label: "="  },
    { op: "is_not", label: "≠"  },
    { op: "gte",    label: ">=" },
    { op: "lte",    label: "<=" },
  ],
  topic: [
    { op: "includes", label: "includes" },
    { op: "excludes", label: "excludes" },
  ],
  solveCount: [
    { op: "is",  label: "="  },
    { op: "gte", label: ">=" },
    { op: "lte", label: "<=" },
  ],
  imported: [
    { op: "is",     label: "is"     },
    { op: "is_not", label: "is not" },
  ],
  date: [
    { op: "gte", label: "on/after"  },
    { op: "lte", label: "on/before" },
  ],
};

function defaultOperator(field: Field): Operator {
  return FIELD_OPERATORS[field][0].op;
}

function defaultValue(field: Field, availableLanguages: string[], availableTopics: string[]): string | number {
  switch (field) {
    case "difficulty": return "easy";
    case "language":   return availableLanguages[0] ?? "Python";
    case "confidence": return 3;
    case "topic":      return availableTopics[0] ?? "";
    case "solveCount": return 1;
    case "imported":   return "true";
    case "date":       return new Date().toISOString().slice(0, 10);
  }
}

// ── TanStack Table setup ───────────────────────────────────────────────────

const columnHelper = createColumnHelper<SolveGroup>();

const COLUMNS = [
  columnHelper.accessor(g => g.problem.leetcode_id, {
    id: "id",
    enableColumnFilter: false,
  }),
  columnHelper.accessor(g => g.problem.difficulty, {
    id: "difficulty",
    sortingFn: (a, b) =>
      (DIFF_ORDER[a.original.problem.difficulty] ?? 1) -
      (DIFF_ORDER[b.original.problem.difficulty] ?? 1),
  }),
  columnHelper.accessor(g => g.solves[g.solves.length - 1]?.language ?? "", {
    id: "language",
    enableSorting: false,
  }),
  columnHelper.accessor(g => g.solves[g.solves.length - 1]?.confidence ?? 0, {
    id: "confidence",
  }),
  columnHelper.accessor(g => g.solves.length, {
    id: "solveCount",
    enableColumnFilter: false,
  }),
  columnHelper.accessor(
    g => {
      const nonImported = g.solves.filter(s => !s.is_imported);
      if (nonImported.length === 0) return 0;
      return new Date(nonImported[nonImported.length - 1].solved_at).getTime();
    },
    { id: "lastSolved", enableColumnFilter: false }
  ),
];

// ── Helpers ───────────────────────────────────────────────────────────────

function langColor(lang: string): string {
  return LANG_COLORS[lang.toLowerCase()] ?? "#6b7280";
}

const LANG_HLJS: Record<string, string> = {
  python:     "python",
  javascript: "javascript",
  typescript: "typescript",
  java:       "java",
  "c++":      "cpp",
  c:          "c",
  go:         "go",
  rust:       "rust",
  swift:      "swift",
  kotlin:     "kotlin",
  "c#":       "csharp",
};

function hljsLang(lang: string | null): string {
  return LANG_HLJS[lang?.toLowerCase() ?? ""] ?? "plaintext";
}

function cmExtensions(lang: string | null) {
  switch (lang?.toLowerCase()) {
    case "python":     return [python()];
    case "javascript": return [javascript()];
    case "typescript": return [javascript({ typescript: true })];
    case "java":       return [java()];
    case "c++":        return [cpp()];
    case "c":          return [cpp()];
    case "rust":       return [rust()];
    case "go":         return [go()];
    default:           return [];
  }
}

function authFetch(url: string, token: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
}

function timeAgo(dateStr: string) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function ConfidencePicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const selected = value != null ? CONFIDENCE_LABELS[value] : null;
  return (
    <div className="flex items-center gap-2">
      {([1, 2, 3, 4, 5] as const).map(n => {
        const cl = CONFIDENCE_LABELS[n];
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(active ? null : n)}
            title={cl.label}
            className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-black transition-all shrink-0"
            style={{
              backgroundColor: active ? cl.color : "color-mix(in srgb, var(--color-base-content) 8%, transparent)",
              color: active ? "#fff" : "color-mix(in srgb, var(--color-base-content) 40%, transparent)",
              border: active ? "none" : "1px solid color-mix(in srgb, var(--color-base-content) 12%, transparent)",
            }}
          >
            {n}
          </button>
        );
      })}
      {selected && (
        <span className="text-xs font-black ml-1" style={{ color: selected.color }}>{selected.label}</span>
      )}
    </div>
  );
}

function DiffBadge({ difficulty }: { difficulty: string }) {
  const c = DIFF_COLORS[difficulty.toLowerCase()] ?? DIFF_COLORS.medium;
  return (
    <span
      className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0"
      style={{ color: c.text, backgroundColor: c.bg, border: `1px solid ${c.border}` }}
    >
      {difficulty}
    </span>
  );
}

// ── Query Builder Evaluation ──────────────────────────────────────────────

function isGroup(r: FilterRule | FilterGroup): r is FilterGroup {
  return "rules" in r;
}

function evaluateRule(rule: FilterRule, g: SolveGroup): boolean {
  const recent = g.solves[g.solves.length - 1];
  switch (rule.field) {
    case "difficulty":
      return rule.operator === "is"
        ? g.problem.difficulty === rule.value
        : g.problem.difficulty !== rule.value;
    case "language": {
      const a = (recent?.language ?? "").toLowerCase();
      const v = String(rule.value).toLowerCase();
      return rule.operator === "is" ? a === v : a !== v;
    }
    case "confidence": {
      const a = recent?.confidence ?? 0, v = Number(rule.value);
      if (rule.operator === "is")     return a === v;
      if (rule.operator === "is_not") return a !== v;
      if (rule.operator === "gte")    return a >= v;
      if (rule.operator === "lte")    return a <= v;
      return true;
    }
    case "topic": {
      const has = g.problem.topics.some(t =>
        t.toLowerCase() === String(rule.value).toLowerCase()
      );
      return rule.operator === "includes" ? has : !has;
    }
    case "solveCount": {
      const a = g.solves.length, v = Number(rule.value);
      if (rule.operator === "is")  return a === v;
      if (rule.operator === "gte") return a >= v;
      if (rule.operator === "lte") return a <= v;
      return true;
    }
    case "imported": {
      const allImported = g.solves.every(s => s.is_imported);
      const want = rule.value === "true";
      return rule.operator === "is" ? allImported === want : allImported !== want;
    }
    case "date": {
      const v = String(rule.value);
      if (!v) return true;
      const recent = g.solves[g.solves.length - 1];
      if (!recent) return false;
      const d = new Date(recent.solved_at);
      const solveDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (rule.operator === "gte") return solveDay >= v; // solved on/after
      if (rule.operator === "lte") return solveDay <= v; // solved on/before
      return true;
    }
  }
}

function evaluateGroup(group: FilterGroup, g: SolveGroup): boolean {
  if (group.rules.length === 0) return true;
  const results = group.rules.map(r =>
    isGroup(r) ? evaluateGroup(r, g) : evaluateRule(r, g)
  );
  return group.combinator === "and"
    ? results.every(Boolean)
    : results.some(Boolean);
}

function countRules(group: FilterGroup): number {
  let count = 0;
  for (const r of group.rules) {
    if (isGroup(r)) count += countRules(r);
    else count++;
  }
  return count;
}

// ── Query Builder Components ──────────────────────────────────────────────

function FilterRuleRow({ rule, onChange, onRemove, availableLanguages, availableTopics }: {
  rule: FilterRule;
  onChange: (updated: FilterRule) => void;
  onRemove: () => void;
  availableLanguages: string[];
  availableTopics: string[];
}) {
  const ops = FIELD_OPERATORS[rule.field];

  function handleFieldChange(newField: Field) {
    onChange({
      ...rule,
      field: newField,
      operator: defaultOperator(newField),
      value: defaultValue(newField, availableLanguages, availableTopics),
    });
  }

  function renderValueInput() {
    switch (rule.field) {
      case "difficulty":
        return (
          <select
            value={String(rule.value)}
            onChange={e => onChange({ ...rule, value: e.target.value })}
            className="select select-bordered select-xs"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        );
      case "language": {
        const langOptions = availableLanguages.length > 0 ? availableLanguages : LANGUAGES;
        return (
          <select
            value={String(rule.value)}
            onChange={e => onChange({ ...rule, value: e.target.value })}
            className="select select-bordered select-xs"
          >
            {langOptions.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        );
      }
      case "confidence":
        return (
          <select
            value={String(rule.value)}
            onChange={e => onChange({ ...rule, value: Number(e.target.value) })}
            className="select select-bordered select-xs"
          >
            {([1, 2, 3, 4, 5] as const).map(n => (
              <option key={n} value={n}>{n} — {CONFIDENCE_LABELS[n].label}</option>
            ))}
          </select>
        );
      case "topic":
        return availableTopics.length > 0 ? (
          <select
            value={String(rule.value)}
            onChange={e => onChange({ ...rule, value: e.target.value })}
            className="select select-bordered select-xs"
          >
            {availableTopics.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        ) : (
          <input
            type="text"
            value={String(rule.value)}
            onChange={e => onChange({ ...rule, value: e.target.value })}
            placeholder="topic name"
            className="input input-bordered input-xs w-28"
          />
        );
      case "solveCount":
        return (
          <input
            type="number"
            min={1}
            value={Number(rule.value)}
            onChange={e => onChange({ ...rule, value: Math.max(1, Number(e.target.value)) })}
            className="input input-bordered input-xs w-20"
          />
        );
      case "imported":
        return (
          <select
            value={String(rule.value)}
            onChange={e => onChange({ ...rule, value: e.target.value })}
            className="select select-bordered select-xs"
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        );
      case "date":
        return (
          <input
            type="date"
            value={String(rule.value)}
            max={new Date().toISOString().slice(0, 10)}
            onChange={e => onChange({ ...rule, value: e.target.value })}
            className="input input-bordered input-xs"
          />
        );
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <select
        value={rule.field}
        onChange={e => handleFieldChange(e.target.value as Field)}
        className="select select-bordered select-xs"
      >
        {(Object.keys(FIELD_LABELS) as Field[]).map(f => (
          <option key={f} value={f}>{FIELD_LABELS[f]}</option>
        ))}
      </select>
      <select
        value={rule.operator}
        onChange={e => onChange({ ...rule, operator: e.target.value as Operator })}
        className="select select-bordered select-xs"
      >
        {ops.map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
      </select>
      {renderValueInput()}
      <button
        onClick={onRemove}
        className="btn btn-xs btn-ghost p-1 text-base-content/30 hover:text-error"
      >
        <X size={11} />
      </button>
    </div>
  );
}

function QueryBuilderGroup({ group, onChange, onRemove, depth, availableLanguages, availableTopics }: {
  group: FilterGroup;
  onChange: (updated: FilterGroup) => void;
  onRemove?: () => void;
  depth: number;
  availableLanguages: string[];
  availableTopics: string[];
}) {
  function addRule() {
    const field: Field = "difficulty";
    const rule: FilterRule = {
      id: Math.random().toString(36).slice(2),
      field,
      operator: defaultOperator(field),
      value: defaultValue(field, availableLanguages, availableTopics),
    };
    onChange({ ...group, rules: [...group.rules, rule] });
  }

  function addGroup() {
    const nested: FilterGroup = {
      id: Math.random().toString(36).slice(2),
      combinator: "and",
      rules: [],
    };
    onChange({ ...group, rules: [...group.rules, nested] });
  }

  function updateItem(index: number, updated: FilterRule | FilterGroup) {
    const newRules = [...group.rules];
    newRules[index] = updated;
    onChange({ ...group, rules: newRules });
  }

  function removeItem(index: number) {
    onChange({ ...group, rules: group.rules.filter((_, i) => i !== index) });
  }

  return (
    <div className={depth > 0 ? "pl-4 border-l-2 border-base-300 mt-1" : ""}>
      {/* Group header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex rounded-lg overflow-hidden border border-base-300 text-[11px] font-black">
          <button
            onClick={() => onChange({ ...group, combinator: "and" })}
            className={`px-2.5 py-1 transition-colors ${
              group.combinator === "and"
                ? "bg-primary text-primary-content"
                : "bg-base-100 text-base-content/40 hover:text-base-content/70"
            }`}
          >
            AND
          </button>
          <button
            onClick={() => onChange({ ...group, combinator: "or" })}
            className={`px-2.5 py-1 transition-colors ${
              group.combinator === "or"
                ? "bg-primary text-primary-content"
                : "bg-base-100 text-base-content/40 hover:text-base-content/70"
            }`}
          >
            OR
          </button>
        </div>

        <button
          onClick={addRule}
          className="btn btn-xs btn-ghost gap-1 font-bold text-[11px] text-base-content/60 hover:text-base-content/80"
        >
          <Plus size={11} /> Rule
        </button>

        {depth < 2 && (
          <button
            onClick={addGroup}
            className="btn btn-xs btn-ghost gap-1 font-bold text-[11px] text-base-content/60 hover:text-base-content/80"
          >
            <Plus size={11} /> Group
          </button>
        )}

        {depth > 0 && onRemove && (
          <button
            onClick={onRemove}
            className="btn btn-xs btn-ghost p-1 text-base-content/25 hover:text-error ml-auto"
          >
            <X size={11} />
          </button>
        )}
      </div>

      {group.rules.length === 0 && (
        <p className="text-[11px] text-base-content/30 italic px-1 pb-1">
          No filters yet — click &ldquo;+ Rule&rdquo; to add one.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {group.rules.map((item, i) =>
          isGroup(item) ? (
            <QueryBuilderGroup
              key={item.id}
              group={item}
              onChange={updated => updateItem(i, updated)}
              onRemove={() => removeItem(i)}
              depth={depth + 1}
              availableLanguages={availableLanguages}
              availableTopics={availableTopics}
            />
          ) : (
            <FilterRuleRow
              key={item.id}
              rule={item}
              onChange={updated => updateItem(i, updated)}
              onRemove={() => removeItem(i)}
              availableLanguages={availableLanguages}
              availableTopics={availableTopics}
            />
          )
        )}
      </div>
    </div>
  );
}

// ── Log form ──────────────────────────────────────────────────────────────

const LC_DRAFT_KEY = "lc-draft-solve";

// Post-solve reflection scaffold, dropped into empty notes on demand.
const NOTE_TEMPLATE = `**Core trick:**

**Complexity:**

**Failure mode:**

**Additional notes:**
`;

/** Popover explaining what each template section is for. */
function TemplateHelp() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="text-base-content/30 hover:text-base-content/60 transition-colors flex"
        title="What goes in each section"
        aria-label="What goes in each section"
      >
        <HelpCircle size={13} />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+0.4rem)] z-50 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-base-300 bg-base-100 p-3.5 shadow-2xl text-left flex flex-col gap-2.5 select-text cursor-default">
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-black text-base-content">Core trick</p>
            <p className="text-[11px] text-base-content/55 leading-relaxed">
              The one-sentence insight that cracks it — the pattern or move to remember next time.
            </p>
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-black text-base-content">Complexity</p>
            <p className="text-[11px] text-base-content/55 leading-relaxed">
              Time &amp; space (O(?)), and whether it&apos;s optimal or there&apos;s a cleaner approach.
            </p>
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-black text-base-content">Failure mode</p>
            <p className="text-[11px] text-base-content/55 leading-relaxed">If you struggled, why — so you know what to drill:</p>
            <ul className="text-[11px] text-base-content/55 leading-relaxed flex flex-col gap-0.5 mt-0.5">
              <li><span className="font-bold">clean</span> — nailed it, no help</li>
              <li><span className="font-bold">conceptual</span> — didn&apos;t know the pattern</li>
              <li><span className="font-bold">implementation</span> — fumbled the code</li>
              <li><span className="font-bold">edge case</span> — missed an input</li>
            </ul>
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-black text-base-content">Additional notes</p>
            <p className="text-[11px] text-base-content/55 leading-relaxed">
              Anything else — gotchas, variations to watch for, links.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Notes editor with a one-click template scaffold (shown only when empty). */
function NotesField({ value, onChange, minRows = 4, label = "Notes" }: {
  value: string; onChange: (v: string) => void; minRows?: number; label?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-black text-base-content/40">
          {label} <span className="font-normal opacity-60">(optional)</span>
        </label>
        <div className="flex items-center gap-2 shrink-0">
          {!value.trim() && (
            <button
              type="button"
              onClick={() => onChange(NOTE_TEMPLATE)}
              className="text-[10px] font-black text-base-content/40 hover:text-base-content/70 flex items-center gap-1"
            >
              <Plus size={10} /> Template
            </button>
          )}
          <TemplateHelp />
        </div>
      </div>
      <NoteEditor value={value} onChange={onChange} minRows={minRows} />
    </div>
  );
}

function LogSolveForm({ token, onSuccess, initial }: { token: string; onSuccess: (solved?: SearchResult) => void; initial?: SearchResult | null }) {
  const { theme }   = useTheme();
  const queryClient = useQueryClient();

  const draft = (() => {
    if (initial) return {};  // seeded from a to-do item — ignore the saved draft
    try { return JSON.parse(localStorage.getItem(LC_DRAFT_KEY) ?? "{}"); }
    catch { return {}; }
  })();

  const [query,      setQuery]      = useState(initial ? initial.title : (draft.query ?? ""));
  const [results,    setResults]    = useState<SearchResult[]>([]);
  const [searching,  setSearching]  = useState(false);
  const [selected,   setSelected]   = useState<SearchResult | null>(initial ?? draft.selected ?? null);
  const [showDrop,   setShowDrop]   = useState(false);
  const [language,   setLanguage]   = useState(draft.language   ?? "Python");
  const [timeC,      setTimeC]      = useState(draft.timeC      ?? "");
  const [spaceC,     setSpaceC]     = useState(draft.spaceC     ?? "");
  const [notes,      setNotes]      = useState(draft.notes      ?? "");
  const [code,       setCode]       = useState(draft.code       ?? "");
  const [confidence, setConfidence] = useState<number | null>(draft.confidence ?? null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    localStorage.setItem(LC_DRAFT_KEY, JSON.stringify({ query, selected, language, timeC, spaceC, notes, code, confidence }));
  }, [query, selected, language, timeC, spaceC, notes, code, confidence]);

  useEffect(() => {
    if (!query.trim() || query.length < 2 || selected) {
      setResults([]);
      setShowDrop(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await authFetch(
          `${API_URL}/api/leetcode/search?q=${encodeURIComponent(query)}`,
          token,
        );
        if (r.ok) { setResults(await r.json()); setShowDrop(true); }
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, token, selected]);

  function pick(r: SearchResult) {
    setSelected(r); setQuery(r.title); setShowDrop(false);
  }
  function clear() {
    setSelected(null); setQuery(""); setNotes(""); setCode(""); setLanguage("Python");
    setTimeC(""); setSpaceC(""); setConfidence(null);
    localStorage.removeItem(LC_DRAFT_KEY);
  }

  const { mutate: logSolve, isPending: submitting } = useMutation<Solve, Error>({
    mutationFn: async () => {
      const r = await authFetch(`${API_URL}/api/leetcode/solves`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leetcode_id: selected!.leetcode_id, title: selected!.title,
          slug: selected!.slug, difficulty: selected!.difficulty, topics: selected!.topics,
          notes: notes || null, code, language: language || null,
          time_complexity: timeC || null, space_complexity: spaceC || null,
          confidence,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).detail ?? "Something went wrong");
      return r.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["leetcode", "solves"] });
      const previous = queryClient.getQueryData<Solve[]>(["leetcode", "solves"]);
      const optimistic: Solve = {
        id: -Date.now(),
        user_id: 0,
        problem: {
          id: -1,
          leetcode_id: selected!.leetcode_id,
          title:       selected!.title,
          slug:        selected!.slug,
          difficulty:  selected!.difficulty,
          topics:      selected!.topics,
        },
        notes:            notes || null,
        code,
        language:         language || null,
        time_complexity:  timeC  || null,
        space_complexity: spaceC || null,
        confidence,
        solved_at:   new Date().toISOString(),
        xp_awarded:  0,
        is_imported: false,
      };
      queryClient.setQueryData<Solve[]>(["leetcode", "solves"], old => [optimistic, ...(old ?? [])]);
      return { previous };
    },
    onError: (err, _v, ctx) => {
      const c = ctx as { previous?: Solve[] } | undefined;
      if (c?.previous) queryClient.setQueryData(["leetcode", "solves"], c.previous);
      toast.error(err.message);
    },
    onSuccess: () => {
      toast.success("Solve logged!");
      onSuccess(selected ?? undefined);
      clear();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["leetcode"] });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    logSolve();
  }

  const diff  = selected?.difficulty.toLowerCase() ?? "medium";
  const diffC = DIFF_COLORS[diff] ?? DIFF_COLORS.medium;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="relative">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/30 pointer-events-none" />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); if (selected) setSelected(null); }}
            placeholder="Search problem by title or number…"
            className="input input-bordered w-full pl-9 pr-9 text-sm font-semibold"
            autoComplete="off"
          />
          {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/30 animate-spin pointer-events-none" />}
          {selected && (
            <button type="button" onClick={clear} className="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/30 hover:text-error transition-colors">
              <X size={14} />
            </button>
          )}
        </div>
        {showDrop && results.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-base-200 border border-base-300 rounded-xl shadow-2xl overflow-hidden">
            {results.map(r => {
              const c = DIFF_COLORS[r.difficulty] ?? DIFF_COLORS.medium;
              return (
                <button key={r.leetcode_id} type="button" onClick={() => pick(r)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-base-300/60 transition-colors text-left">
                  <span className="font-mono text-xs text-base-content/35 shrink-0 w-9">{r.leetcode_id}.</span>
                  <span className="flex-1 text-sm font-bold text-base-content truncate">{r.title}</span>
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ color: c.text, backgroundColor: c.bg }}>{r.difficulty}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <>
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border-2" style={{ borderColor: diffC.border, backgroundColor: diffC.bg }}>
            <span className="font-mono text-xs text-base-content/40 shrink-0">{selected.leetcode_id}.</span>
            <span className="font-black text-sm text-base-content flex-1 min-w-0 truncate">{selected.title}</span>
            <a
              href={`https://leetcode.com/problems/${selected.slug}/`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="shrink-0 text-base-content/30 hover:text-base-content/70 transition-colors"
              title="Open on LeetCode"
            >
              <ExternalLink size={13} />
            </a>
            <DiffBadge difficulty={selected.difficulty} />
            <span className="font-black text-sm shrink-0" style={{ color: diffC.text }}>+{DIFF_XP[diff] ?? 20} XP</span>
          </div>

          {selected.topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.topics.map(t => <span key={t} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-base-300 text-base-content/55">{t}</span>)}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-black text-base-content/40">Language</label>
              <select value={language} onChange={e => setLanguage(e.target.value)} className="select select-bordered select-sm w-full">
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-black text-base-content/40">Time</label>
              <input value={timeC} onChange={e => setTimeC(e.target.value)} placeholder="O(n log n)" className="input input-bordered input-sm w-full font-mono" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-black text-base-content/40">Space</label>
              <input value={spaceC} onChange={e => setSpaceC(e.target.value)} placeholder="O(n)" className="input input-bordered input-sm w-full font-mono" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-black text-base-content/40 shrink-0">Confidence <span className="font-normal opacity-60">(optional)</span></label>
            <ConfidencePicker value={confidence} onChange={setConfidence} />
          </div>

          <NotesField value={notes} onChange={setNotes} minRows={4} />

          <div className="flex flex-col gap-1">
            <label className="text-xs font-black text-base-content/40">Code</label>
            <div className="rounded-xl overflow-hidden border border-base-300">
              <CodeMirror
                value={code}
                onChange={setCode}
                extensions={cmExtensions(language)}
                theme={theme === "dark" ? githubDark : githubLight}
                basicSetup={{ lineNumbers: true, foldGutter: false, autocompletion: false }}
                style={{ fontSize: "13px", minHeight: "144px" }}
              />
            </div>
          </div>

          <button type="submit" disabled={submitting} className="btn btn-sm font-black text-white border-none gap-2"
            style={{ backgroundColor: "var(--game-accent)", boxShadow: "0 4px 0 color-mix(in srgb, var(--game-accent) 50%, #000)" }}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {submitting ? "Logging…" : "Log Solve"}
          </button>
        </>
      )}
    </form>
  );
}

// ── SolveAttempt — single attempt within a group ───────────────────────────

type EditPayload = {
  language: string | null;
  time_complexity: string | null;
  space_complexity: string | null;
  confidence: number | null;
  notes: string | null;
  code: string | null;
  solved_at?: string;
};

function SolveAttempt({
  solve, attemptNumber, token, defaultExpanded = false,
}: {
  solve: Solve; attemptNumber: number; token: string; defaultExpanded?: boolean;
}) {
  const { theme }   = useTheme();
  const queryClient = useQueryClient();
  const [expanded,  setExpanded]  = useState(defaultExpanded);
  const [editing,   setEditing]   = useState(false);
  const [editError, setEditError] = useState("");

  const [eLang,      setELang]      = useState(solve.language          ?? "Python");
  const [eTimeC,     setETimeC]     = useState(solve.time_complexity   ?? "");
  const [eSpaceC,    setESpaceC]    = useState(solve.space_complexity  ?? "");
  const [eConf,      setEConf]      = useState<number | null>(solve.confidence ?? null);
  const [eNotes,     setENotes]     = useState(solve.notes ?? "");
  const [eCode,         setECode]         = useState(solve.code  ?? "");
  const [eSolvedAt,     setESolvedAt]     = useState("");

  const isFirst    = attemptNumber === 1;
  const label      = isFirst ? "Initial Solve" : `Re-solve #${attemptNumber}`;
  const labelColor = isFirst ? "var(--game-accent)" : "#a78bfa";
  const conf       = solve.confidence ? CONFIDENCE_LABELS[solve.confidence] : null;
  const hasDetails = !!(solve.code || solve.notes || solve.time_complexity || solve.space_complexity || conf);

  const { mutate: saveEdit, isPending: saving } = useMutation<Solve, Error, EditPayload>({
    mutationFn: async (payload) => {
      const r = await authFetch(`${API_URL}/api/leetcode/solves/${solve.id}`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error((await r.json()).detail ?? "Save failed");
      return r.json();
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ["leetcode", "solves"] });
      const previous = queryClient.getQueryData<Solve[]>(["leetcode", "solves"]);
      queryClient.setQueryData<Solve[]>(["leetcode", "solves"], (old = []) =>
        old.map(s => s.id === solve.id ? { ...s, ...payload } : s)
      );
      return { previous };
    },
    onError: (err, _v, ctx) => {
      const c = ctx as { previous?: Solve[] } | undefined;
      if (c?.previous) queryClient.setQueryData(["leetcode", "solves"], c.previous);
      setEditError(err.message);
      toast.error(err.message);
    },
    onSuccess: () => {
      setEditing(false);
      setEditError("");
      toast.success("Changes saved");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["leetcode", "solves"] });
    },
  });

  const [confirmDelete, setConfirmDelete] = useState(false);

  const { mutate: deleteSolve, isPending: deleting } = useMutation<void, Error>({
    mutationFn: async () => {
      const r = await authFetch(`${API_URL}/api/leetcode/solves/${solve.id}`, token, { method: "DELETE" });
      if (!r.ok && r.status !== 204) throw new Error((await r.json()).detail ?? "Delete failed");
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["leetcode", "solves"] });
      const previous = queryClient.getQueryData<Solve[]>(["leetcode", "solves"]);
      queryClient.setQueryData<Solve[]>(["leetcode", "solves"], (old = []) =>
        old.filter(s => s.id !== solve.id)
      );
      return { previous };
    },
    onError: (err, _v, ctx) => {
      const c = ctx as { previous?: Solve[] } | undefined;
      if (c?.previous) queryClient.setQueryData(["leetcode", "solves"], c.previous);
      toast.error(err.message);
    },
    onSuccess: () => {
      toast.success("Solve deleted");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["leetcode"] });
    },
  });

  function openEdit() {
    setELang(solve.language ?? "Python"); setETimeC(solve.time_complexity ?? "");
    setESpaceC(solve.space_complexity ?? ""); setEConf(solve.confidence ?? null);
    setENotes(solve.notes ?? ""); setECode(solve.code ?? ""); setESolvedAt("");
    setEditError(""); setEditing(true); setExpanded(true);
  }

  function handleSave() {
    setEditError("");
    const payload: EditPayload = {
      language: eLang || null,
      time_complexity: eTimeC || null,
      space_complexity: eSpaceC || null,
      confidence: eConf,
      notes: eNotes || null,
      code: eCode || null,
    };
    if (eSolvedAt) payload.solved_at = new Date(eSolvedAt).toISOString();
    saveEdit(payload);
  }

  return (
    <div className="border-t border-base-300/60">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <button
          onClick={() => !editing && hasDetails && setExpanded(v => !v)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <span className="text-[11px] font-black shrink-0" style={{ color: labelColor }}>{label}</span>
          {!solve.is_imported && (
            <span className="text-[11px] font-semibold text-base-content/35 shrink-0">{timeAgo(solve.solved_at)}</span>
          )}
          {solve.language && (
            <span className="hidden sm:block text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
              style={{ color: langColor(solve.language), backgroundColor: `${langColor(solve.language)}20`, border: `1px solid ${langColor(solve.language)}44` }}>
              {solve.language}
            </span>
          )}
          {conf && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0"
              style={{ color: conf.color, backgroundColor: `${conf.color}20` }}>
              {conf.label}
            </span>
          )}
          {solve.time_complexity && <span className="font-mono text-[10px] text-base-content/35 hidden md:block">{solve.time_complexity}</span>}
          {solve.space_complexity && <span className="font-mono text-[10px] text-base-content/35 hidden md:block">{solve.space_complexity}</span>}
          {solve.is_imported && !solve.code && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-base-300 text-base-content/35 shrink-0">
              no code
            </span>
          )}
        </button>

        <button onClick={editing ? () => setEditing(false) : openEdit}
          className="shrink-0 p-1.5 rounded-lg text-base-content/30 hover:text-base-content/70 hover:bg-base-200 transition-colors"
          title={editing ? "Cancel" : "Edit"}>
          {editing ? <X size={12} /> : <Pencil size={12} />}
        </button>
        {!editing && (
          confirmDelete ? (
            <button
              onClick={() => deleteSolve()}
              disabled={deleting}
              className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black text-error bg-error/10 hover:bg-error/20 transition-colors"
            >
              {deleting ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
              Delete?
            </button>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              onBlur={() => setConfirmDelete(false)}
              className="shrink-0 p-1.5 rounded-lg text-base-content/20 hover:text-error hover:bg-error/10 transition-colors"
              title="Delete solve"
            >
              <Trash2 size={12} />
            </button>
          )
        )}
        {!editing && hasDetails && (
          <button onClick={() => setExpanded(v => !v)} className="shrink-0 text-base-content/30">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}
      </div>

      {editing && (
        <div className="border-t border-base-300/60 px-6 py-6 flex flex-col gap-6 bg-base-200/30">
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-black text-base-content/40 uppercase tracking-wider">Language</label>
              <select value={eLang} onChange={e => setELang(e.target.value)} className="select select-bordered w-full">
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-black text-base-content/40 uppercase tracking-wider">Time</label>
              <input value={eTimeC} onChange={e => setETimeC(e.target.value)} placeholder="O(n log n)" className="input input-bordered w-full font-mono" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-black text-base-content/40 uppercase tracking-wider">Space</label>
              <input value={eSpaceC} onChange={e => setESpaceC(e.target.value)} placeholder="O(n)" className="input input-bordered w-full font-mono" />
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs font-black text-base-content/40 uppercase tracking-wider shrink-0">Confidence</label>
            <ConfidencePicker value={eConf} onChange={setEConf} />
            <div className="ml-auto flex items-center gap-2">
              <label className="text-xs font-black text-base-content/40 uppercase tracking-wider shrink-0">
                Solved <span className="font-normal normal-case opacity-60">(optional)</span>
              </label>
              <input
                type="date"
                value={eSolvedAt}
                max={new Date().toISOString().split("T")[0]}
                onChange={e => setESolvedAt(e.target.value)}
                className="border border-base-300 rounded-lg px-3 py-1.5 text-sm font-mono bg-base-100 text-base-content"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-black text-base-content/40 uppercase tracking-wider">Notes</label>
            <NoteEditor value={eNotes} onChange={setENotes} minRows={6} />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-black text-base-content/40 uppercase tracking-wider">Code</label>
            <div className="rounded-xl overflow-hidden border border-base-300" style={{ minHeight: "320px" }}>
              <CodeMirror value={eCode} onChange={setECode} extensions={cmExtensions(eLang)}
                theme={theme === "dark" ? githubDark : githubLight}
                basicSetup={{ lineNumbers: true, foldGutter: false, autocompletion: false }}
                style={{ fontSize: "13px" }} />
            </div>
          </div>

          {editError && <p className="text-xs font-bold text-error">{editError}</p>}

          <div className="flex gap-3">
            <button type="button" onClick={handleSave} disabled={saving}
              className="btn font-black text-white border-none gap-2 flex-1"
              style={{ backgroundColor: "var(--game-accent)", boxShadow: "0 4px 0 color-mix(in srgb, var(--game-accent) 50%, #000)" }}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn btn-ghost font-black">Cancel</button>
          </div>
        </div>
      )}

      {!editing && expanded && hasDetails && (
        <div className="border-t border-base-300/60 px-4 py-3 flex flex-col gap-3 bg-base-200/20">
          {(solve.time_complexity || solve.space_complexity || conf) && (
            <div className="flex gap-6 flex-wrap items-end">
              {solve.time_complexity && (
                <div>
                  <p className="text-[10px] font-black text-base-content/30 mb-0.5">TIME</p>
                  <p className="font-mono text-xs font-bold text-base-content/70">{solve.time_complexity}</p>
                </div>
              )}
              {solve.space_complexity && (
                <div>
                  <p className="text-[10px] font-black text-base-content/30 mb-0.5">SPACE</p>
                  <p className="font-mono text-xs font-bold text-base-content/70">{solve.space_complexity}</p>
                </div>
              )}
              {conf && (
                <div>
                  <p className="text-[10px] font-black text-base-content/30 mb-0.5">CONFIDENCE</p>
                  <span className="text-xs font-black px-2 py-0.5 rounded-full"
                    style={{ color: conf.color, backgroundColor: `${conf.color}20` }}>
                    {solve.confidence} — {conf.label}
                  </span>
                </div>
              )}
            </div>
          )}
          {solve.notes && (
            <div>
              <p className="text-[10px] font-black text-base-content/30 mb-1">NOTES</p>
              <div className="markdown-notes prose prose-sm max-w-none text-base-content/70">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{solve.notes}</ReactMarkdown>
              </div>
            </div>
          )}
          {solve.code && (
            <div>
              <p className="text-[10px] font-black text-base-content/30 mb-1">CODE</p>
              <div className="rounded-xl overflow-hidden">
                <SyntaxHighlighter language={hljsLang(solve.language)}
                  style={theme === "dark" ? atomOneDark : atomOneLight}
                  customStyle={{ margin: 0, borderRadius: "0.75rem", fontSize: "13px", lineHeight: "1.7", padding: "1.25rem" }}
                  showLineNumbers wrapLongLines={false}>
                  {solve.code}
                </SyntaxHighlighter>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── QuickSolveForm — add a new attempt from inside the card ───────────────

function QuickSolveForm({ problem, token, onSuccess, onCancel, defaultLanguage }: {
  problem: Problem; token: string; onSuccess: () => void; onCancel: () => void; defaultLanguage?: string;
}) {
  const { theme }    = useTheme();
  const queryClient  = useQueryClient();
  const [language,      setLanguage]      = useState(defaultLanguage ?? "Python");
  const [timeC,         setTimeC]         = useState("");
  const [spaceC,        setSpaceC]        = useState("");
  const [notes,      setNotes]      = useState("");
  const [code,          setCode]          = useState("");
  const [confidence,    setConfidence]    = useState<number | null>(null);

  const { mutate: submit, isPending: submitting, error } = useMutation<Solve, Error, void>({
    mutationFn: async () => {
      const r = await authFetch(`${API_URL}/api/leetcode/solves`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leetcode_id: problem.leetcode_id,
          title:       problem.title,
          slug:        problem.slug,
          difficulty:  problem.difficulty,
          topics:      problem.topics,
          language:    language || null,
          time_complexity:  timeC  || null,
          space_complexity: spaceC || null,
          notes:      notes || null,
          code,
          confidence,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).detail ?? "Something went wrong");
      return r.json();
    },
    onSuccess: () => {
      toast.success("Re-solve logged!");
      queryClient.invalidateQueries({ queryKey: ["leetcode"] });
      onSuccess();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const errMsg = error?.message;

  return (
    <form onSubmit={e => { e.preventDefault(); submit(); }} className="flex flex-col gap-4 px-4 py-4 bg-base-200/40 border-t border-base-300/60">
      <p className="text-[11px] font-black text-base-content/40 uppercase tracking-wider">Add Re-solve</p>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-black text-base-content/40">Language</label>
          <select value={language} onChange={e => setLanguage(e.target.value)} className="select select-bordered select-sm w-full">
            {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-black text-base-content/40">Time</label>
          <input value={timeC} onChange={e => setTimeC(e.target.value)} placeholder="O(n log n)" className="input input-bordered input-sm w-full font-mono" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-black text-base-content/40">Space</label>
          <input value={spaceC} onChange={e => setSpaceC(e.target.value)} placeholder="O(n)" className="input input-bordered input-sm w-full font-mono" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-xs font-black text-base-content/40 shrink-0">Confidence <span className="font-normal opacity-60">(optional)</span></label>
        <ConfidencePicker value={confidence} onChange={setConfidence} />
      </div>

      <NotesField value={notes} onChange={setNotes} minRows={4} />

      <div className="flex flex-col gap-1">
        <label className="text-xs font-black text-base-content/40">Code</label>
        <div className="rounded-xl overflow-hidden border border-base-300">
          <CodeMirror
            value={code}
            onChange={setCode}
            extensions={cmExtensions(language)}
            theme={theme === "dark" ? githubDark : githubLight}
            basicSetup={{ lineNumbers: true, foldGutter: false, autocompletion: false }}
            style={{ fontSize: "13px", minHeight: "144px" }}
          />
        </div>
      </div>

      {errMsg && <p className="text-xs font-bold text-error">{errMsg}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={submitting}
          className="btn btn-sm font-black text-white border-none gap-2 flex-1"
          style={{ backgroundColor: "var(--game-accent)", boxShadow: "0 4px 0 color-mix(in srgb, var(--game-accent) 50%, #000)" }}>
          {submitting ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          {submitting ? "Logging…" : "Log Re-solve"}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-sm btn-ghost font-black">Cancel</button>
      </div>
    </form>
  );
}

// ── TopicEditor ───────────────────────────────────────────────────────────

function TopicEditor({ problem, token, availableTopics }: {
  problem: Problem; token: string; availableTopics: string[];
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);

  const allSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of [...LC_TOPICS, ...availableTopics]) {
      if (!seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); }
    }
    return out;
  }, [availableTopics]);

  const suggestions = useMemo(() => {
    const added = new Set(problem.topics.map(t => t.toLowerCase()));
    const q = draft.trim().toLowerCase();
    return allSuggestions.filter(t =>
      !added.has(t.toLowerCase()) && (!q || t.toLowerCase().includes(q))
    );
  }, [allSuggestions, problem.topics, draft]);

  const { mutate: saveTopics } = useMutation<void, Error, string[]>({
    mutationFn: async (topics) => {
      const r = await authFetch(`${API_URL}/api/leetcode/problems/${problem.id}`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topics }),
      });
      if (!r.ok) throw new Error("Failed to update topics");
    },
    onMutate: async (topics) => {
      await queryClient.cancelQueries({ queryKey: ["leetcode", "solves"] });
      const previous = queryClient.getQueryData<Solve[]>(["leetcode", "solves"]);
      queryClient.setQueryData<Solve[]>(["leetcode", "solves"], (old = []) =>
        old.map(s => s.problem.leetcode_id === problem.leetcode_id
          ? { ...s, problem: { ...s.problem, topics } }
          : s
        )
      );
      return { previous };
    },
    onError: (_err, _v, ctx) => {
      const c = ctx as { previous?: Solve[] } | undefined;
      if (c?.previous) queryClient.setQueryData(["leetcode", "solves"], c.previous);
      toast.error("Failed to update topics");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["leetcode"] });
    },
  });

  function removeTopic(t: string) {
    saveTopics(problem.topics.filter(x => x !== t));
  }

  function selectTopic(t: string) {
    saveTopics([...problem.topics, t]);
    setDraft("");
  }

  function addCustom() {
    const t = draft.trim();
    if (!t || problem.topics.map(x => x.toLowerCase()).includes(t.toLowerCase())) {
      setDraft(""); return;
    }
    saveTopics([...problem.topics, t]);
    setDraft("");
  }

  const showSuggestions = focused && suggestions.length > 0;

  return (
    <div className="px-4 py-3 border-b border-base-300/60 bg-base-200/20 flex flex-col gap-2">
      {/* Current topics */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-black text-base-content/30 uppercase tracking-wider shrink-0">Topics</span>
        {problem.topics.length === 0 && (
          <span className="text-[10px] text-base-content/25 italic">none</span>
        )}
        {problem.topics.map(t => (
          <span key={t} className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-base-300/60 text-base-content/55 border border-base-300">
            {t}
            <button type="button" onClick={() => removeTopic(t)}
              className="text-base-content/30 hover:text-error transition-colors leading-none ml-0.5">
              <X size={9} />
            </button>
          </span>
        ))}
      </div>

      {/* Search / add input */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-base-100 border border-base-300 w-full">
        <Search size={11} className="text-base-content/25 shrink-0" />
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); suggestions[0] ? selectTopic(suggestions[0]) : addCustom(); }
            if (e.key === "Escape") { setFocused(false); setDraft(""); }
          }}
          placeholder="Search or add a topic…"
          className="flex-1 text-xs font-semibold bg-transparent outline-none text-base-content/60 placeholder:text-base-content/20 min-w-0"
        />
        {draft.trim() && (
          <button type="button" onMouseDown={e => { e.preventDefault(); addCustom(); }}
            className="text-[10px] font-black text-base-content/40 hover:text-base-content/70 transition-colors shrink-0 flex items-center gap-0.5">
            <Plus size={10} /> Add
          </button>
        )}
      </div>

      {/* Inline suggestions */}
      {showSuggestions && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.slice(0, 30).map(t => (
            <button
              key={t}
              type="button"
              onMouseDown={e => { e.preventDefault(); selectTopic(t); }}
              className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-base-100 border border-base-300 text-base-content/50 hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors"
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── SolveGroupCard ─────────────────────────────────────────────────────────

function SolveGroupCard({
  group, index, token, onUpdated, availableTopics,
}: {
  group: SolveGroup; index: number; token: string; onUpdated: () => void; availableTopics: string[];
}) {
  const [expanded,      setExpanded]      = useState(false);
  const [addingResolve, setAddingResolve] = useState(false);

  const confSolve        = [...group.solves].reverse().find(s => s.confidence != null);
  const latestConf       = confSolve?.confidence != null ? CONFIDENCE_LABELS[confSolve.confidence] : null;
  const latestLang       = [...group.solves].reverse().find(s => s.language)?.language ?? null;
  const isImported       = group.solves.every(s => s.is_imported);
  const lastNonImported  = [...group.solves].reverse().find(s => !s.is_imported);

  return (
    <div
      className="card-rise group/card rounded-2xl bg-base-100 border-2 border-base-300 overflow-hidden transition-transform duration-150 hover:-translate-y-0.5"
      style={{
        boxShadow: "0 4px 0 rgba(0,0,0,0.08)",
        animationDelay: `${Math.min(index, 12) * 45}ms`,
      }}
    >
      {/* Single row */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <span className="font-mono text-xs text-base-content/30 shrink-0 w-10">{group.problem.leetcode_id}.</span>
          <span className="flex-1 font-black text-sm text-base-content truncate min-w-0">{group.problem.title}</span>
          {group.solves.length > 1 && (
            <span className="shrink-0 text-[10px] font-bold text-base-content/30">×{group.solves.length}</span>
          )}
        </button>
        {latestLang && (
          <span className="hidden sm:block shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ color: langColor(latestLang), backgroundColor: `${langColor(latestLang)}20`, border: `1px solid ${langColor(latestLang)}44` }}>
            {latestLang}
          </span>
        )}
        {latestConf && (
          <span className="shrink-0 size-2 rounded-full" title={latestConf.label}
            style={{ backgroundColor: latestConf.color }} />
        )}
        <DiffBadge difficulty={group.problem.difficulty} />
        <span className="shrink-0 text-[11px] font-semibold text-base-content/35 w-16 text-right">
          {isImported ? "imported" : lastNonImported ? timeAgo(lastNonImported.solved_at) : ""}
        </span>
        <a
          href={`https://leetcode.com/problems/${group.problem.slug}/`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="shrink-0 text-base-content/20 hover:text-base-content/60 transition-colors"
          title="Open on LeetCode"
        >
          <ExternalLink size={13} />
        </a>
        <button onClick={() => setExpanded(v => !v)} className="shrink-0 text-base-content/30">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-base-300">
          <TopicEditor problem={group.problem} token={token} availableTopics={availableTopics} />
          {group.solves.map((solve, idx) => (
            <SolveAttempt
              key={solve.id}
              solve={solve}
              attemptNumber={idx + 1}
              token={token}
              defaultExpanded={idx === group.solves.length - 1}
            />
          ))}

          {addingResolve ? (
            <QuickSolveForm
              problem={group.problem}
              token={token}
              defaultLanguage={[...group.solves].reverse().find(s => s.language)?.language ?? undefined}
              onSuccess={() => { setAddingResolve(false); onUpdated(); }}
              onCancel={() => setAddingResolve(false)}
            />
          ) : (
            <div className="border-t border-base-300/60 px-4 py-2.5">
              <button
                onClick={() => setAddingResolve(true)}
                className="btn btn-xs btn-ghost gap-1.5 font-bold text-base-content/40 hover:text-base-content/70"
              >
                <Plus size={11} /> Add Re-solve
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Review (spaced repetition) ─────────────────────────────────────────────

function BoxPill({ box }: { box: number }) {
  return (
    <span
      className="shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
      style={{
        color: "#a78bfa",
        backgroundColor: "#a78bfa18",
        border: "1px solid #a78bfa44",
      }}
      title={`Leitner box ${box} — review interval ${boxDaysLabel(BOX_DAYS[box] ?? 1)}`}
    >
      Box {box}
    </span>
  );
}

function SpeedRunTimer() {
  const [secs, setSecs] = useState<number | null>(null);
  useEffect(() => {
    if (secs == null || secs <= 0) return;
    const id = setTimeout(() => setSecs(s => (s ?? 1) - 1), 1000);
    return () => clearTimeout(id);
  }, [secs]);
  const label =
    secs == null ? "Start 3-min timer"
    : secs === 0 ? "Time's up"
    : `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, "0")}`;
  return (
    <button
      type="button"
      onClick={() => setSecs(180)}
      className="btn btn-xs font-black gap-1.5 shrink-0"
      style={{
        color: secs === 0 ? "#ef4444" : "#a78bfa",
        backgroundColor: secs === 0 ? "#ef444414" : "#a78bfa18",
        border: `1px solid ${secs === 0 ? "#ef444444" : "#a78bfa44"}`,
      }}
    >
      <Timer size={12} /> {label}
    </button>
  );
}

function ReviewCard({ item, token, snoozes, onLogged, onSkip }: {
  item: ReviewDueItem; token: string; snoozes: boolean; onLogged: () => void; onSkip: () => void;
}) {
  const { theme } = useTheme();
  const [revealed,   setRevealed]   = useState(false);
  const [showCode,   setShowCode]   = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const [saveMode,   setSaveMode]   = useState<"new" | "edit">("new");
  const [language,   setLanguage]   = useState(item.last_solve?.language ?? "Python");
  const [timeC,      setTimeC]      = useState("");
  const [spaceC,     setSpaceC]     = useState("");
  const [notes,      setNotes]      = useState("");
  const [code,       setCode]       = useState("");

  const prev    = item.last_solve;
  const canEdit = !!prev && !item.imported_only; // there's a real solution to edit
  const diff   = item.problem.difficulty.toLowerCase();
  const diffC  = DIFF_COLORS[diff] ?? DIFF_COLORS.medium;
  const nextBox  = confidence != null ? predictBox(item.box, confidence) : null;
  const passed   = confidence != null && confidence >= 3;
  const mastered = confidence === 5;
  const speedRun = !item.imported_only && item.box >= SPEEDRUN_BOX;
  const graduated = !item.imported_only && passed &&
    item.box + passIncrement(confidence ?? 0) > MAX_BOX;

  // Switch between logging a fresh re-solve and editing the original in place.
  function chooseMode(m: "new" | "edit") {
    setSaveMode(m);
    if (m === "edit" && prev) {
      setLanguage(prev.language ?? "Python");
      setTimeC(prev.time_complexity ?? "");
      setSpaceC(prev.space_complexity ?? "");
      setNotes(prev.notes ?? "");
      setCode(prev.code ?? "");
      setShowUpdate(true);
    } else {
      setTimeC(""); setSpaceC(""); setNotes(""); setCode("");
    }
  }

  const { mutate: logReview, isPending } = useMutation<Solve, Error>({
    mutationFn: async () => {
      // Edit the original solution in place — still reschedules via from_review.
      if (saveMode === "edit" && prev) {
        const r = await authFetch(`${API_URL}/api/leetcode/solves/${prev.id}`, token, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language:         language || null,
            code:             code || null,
            notes:            notes || null,
            confidence,
            time_complexity:  timeC  || null,
            space_complexity: spaceC || null,
            from_review: true,
          }),
        });
        if (!r.ok) throw new Error((await r.json()).detail ?? "Something went wrong");
        return r.json();
      }
      const r = await authFetch(`${API_URL}/api/leetcode/solves`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leetcode_id: item.problem.leetcode_id,
          title:       item.problem.title,
          slug:        item.problem.slug,
          difficulty:  item.problem.difficulty,
          topics:      item.problem.topics,
          language:    language || null,
          code,
          notes:       notes || null,
          confidence,
          time_complexity:  timeC  || null,
          space_complexity: spaceC || null,
          from_review: true,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).detail ?? "Something went wrong");
      return r.json();
    },
    onSuccess: () => {
      toast.success(
        graduated ? "🎓 Graduated — archived from active review!"
        : mastered ? "⚡ Mastered — fast-tracked two boxes!"
        : passed ? "Nice — promoted a box!"
        : "Logged — back to Box 1"
      );
      onLogged();
    },
    onError: (err) => toast.error(err.message),
  });

  // Keyboard shortcuts — inert while typing in any field or the code editor.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true'], .cm-editor, dialog")) return;
      if (e.key >= "1" && e.key <= "5") setConfidence(Number(e.key));
      else if (e.key === "n" || e.key === "N") setRevealed(v => !v);
      else if ((e.key === "c" || e.key === "C") && prev?.code) setShowCode(v => !v);
      else if (e.key === "s" || e.key === "S") onSkip();
      else if (e.key === "Enter" && confidence != null && !isPending) logReview();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confidence, isPending, prev?.code, onSkip, logReview]);

  const solutionEditor = (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-black text-base-content/40">Language</label>
          <select value={language} onChange={e => setLanguage(e.target.value)} className="select select-bordered select-sm w-full">
            {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-black text-base-content/40">Time</label>
          <input value={timeC} onChange={e => setTimeC(e.target.value)} placeholder="O(n log n)" className="input input-bordered input-sm w-full font-mono" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-black text-base-content/40">Space</label>
          <input value={spaceC} onChange={e => setSpaceC(e.target.value)} placeholder="O(n)" className="input input-bordered input-sm w-full font-mono" />
        </div>
      </div>
      <NotesField value={notes} onChange={setNotes} minRows={3} />
      <div className="rounded-xl overflow-hidden border border-base-300">
        <CodeMirror value={code} onChange={setCode} extensions={cmExtensions(language)}
          theme={theme === "dark" ? githubDark : githubLight}
          basicSetup={{ lineNumbers: true, foldGutter: false, autocompletion: false }}
          style={{ fontSize: "13px", minHeight: "120px" }} />
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl bg-base-100 border-2 border-base-300 overflow-hidden"
      style={{ boxShadow: "0 4px 0 rgba(0,0,0,0.08)" }}>
      {/* Problem header */}
      <div className="px-6 py-5 flex flex-col gap-3 border-b-2" style={{ borderColor: diffC.border, backgroundColor: diffC.bg }}>
        <div className="flex items-center gap-3">
          {item.imported_only ? (
            <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-base-300 text-base-content/45">
              Imported
            </span>
          ) : (
            <BoxPill box={item.box} />
          )}
          <span className="text-[11px] font-bold text-base-content/40">
            {item.imported_only ? "no recorded solution" : dueLabel(item.next_review_at)}
          </span>
          {item.solve_count > 0 && !item.imported_only && (
            <span className="text-[11px] font-semibold text-base-content/35">
              solved {item.solve_count}×
            </span>
          )}
          <DiffBadge difficulty={item.problem.difficulty} />
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-base-content/40 shrink-0">{item.problem.leetcode_id}.</span>
          <span className="font-black text-lg text-base-content flex-1 min-w-0">{item.problem.title}</span>
        </div>
        {item.problem.topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.problem.topics.map(t => (
              <span key={t} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-base-100/70 text-base-content/55">{t}</span>
            ))}
          </div>
        )}
        <a
          href={`https://leetcode.com/problems/${item.problem.slug}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-sm self-start gap-2 font-black text-white border-none mt-1"
          style={{ backgroundColor: "var(--game-accent)", boxShadow: "0 4px 0 color-mix(in srgb, var(--game-accent) 50%, #000)" }}
        >
          <ExternalLink size={14} /> {speedRun ? "Open the problem" : "Solve it on LeetCode"}
        </a>
      </div>

      {/* Speed-run guidance for high boxes */}
      {speedRun && (
        <div className="px-6 py-3 border-b border-base-300/60 flex items-center gap-3 flex-wrap" style={{ backgroundColor: "#a78bfa10" }}>
          <span className="text-[11px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0" style={{ color: "#a78bfa" }}>
            <Zap size={12} /> Speed-run
          </span>
          <span className="text-xs text-base-content/55 flex-1 min-w-[12rem]">
            Don&apos;t re-type the code. Blueprint the approach out loud (~3 min) — data structure, the key trick, time/space — then reveal &amp; check it matches.
          </span>
          <SpeedRunTimer />
        </div>
      )}

      {/* Reveal previous notes / solution — notes first, code behind its own toggle */}
      <div className="px-6 py-4 border-b border-base-300/60 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setRevealed(v => !v)}
            className="btn btn-sm btn-ghost gap-2 font-bold text-base-content/50 hover:text-base-content/80 border border-base-300"
          >
            <Eye size={14} /> {revealed ? "Hide my notes" : "Reveal my notes"}
            {revealed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {prev?.code && (
            <button
              onClick={() => setShowCode(v => !v)}
              className="btn btn-sm btn-ghost gap-2 font-bold text-base-content/50 hover:text-base-content/80 border border-base-300"
            >
              <Code2 size={14} /> {showCode ? "Hide solution" : "Reveal solution"}
              {showCode ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
        </div>

        {revealed && (
          prev && (prev.notes || prev.time_complexity || prev.space_complexity) ? (
            <div className="flex flex-col gap-3">
              <p className="text-[10px] font-black text-base-content/30 uppercase tracking-wider">Your notes</p>
              {(prev.time_complexity || prev.space_complexity) && (
                <div className="flex gap-6">
                  {prev.time_complexity && (
                    <div><p className="text-[10px] font-black text-base-content/30 mb-0.5">TIME</p>
                      <p className="font-mono text-xs font-bold text-base-content/70">{prev.time_complexity}</p></div>
                  )}
                  {prev.space_complexity && (
                    <div><p className="text-[10px] font-black text-base-content/30 mb-0.5">SPACE</p>
                      <p className="font-mono text-xs font-bold text-base-content/70">{prev.space_complexity}</p></div>
                  )}
                </div>
              )}
              {prev.notes ? (
                <div className="markdown-notes prose prose-sm max-w-none text-base-content/70">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{prev.notes}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-xs font-semibold text-base-content/35 italic">No notes recorded — just complexity.</p>
              )}
            </div>
          ) : (
            <p className="text-xs font-semibold text-base-content/35 italic">No notes recorded for this problem.</p>
          )
        )}

        {showCode && prev?.code && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-black text-base-content/30 uppercase tracking-wider">Your solution</p>
            <div className="rounded-xl overflow-hidden">
              <SyntaxHighlighter language={hljsLang(prev.language)}
                style={theme === "dark" ? atomOneDark : atomOneLight}
                customStyle={{ margin: 0, borderRadius: "0.75rem", fontSize: "13px", lineHeight: "1.7", padding: "1.25rem" }}
                showLineNumbers wrapLongLines={false}>
                {prev.code}
              </SyntaxHighlighter>
            </div>
          </div>
        )}
      </div>

      {/* Rate & reschedule */}
      <div className="px-6 py-5 flex flex-col gap-4 bg-base-200/30">
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-black text-base-content/40 uppercase tracking-wider">
            {speedRun ? "Did your blueprint match?" : "How did it go?"}
          </p>
          <ConfidencePicker value={confidence} onChange={setConfidence} />
          {nextBox != null && (
            <p className="text-[11px] font-bold mt-1" style={{ color: passed ? "#22c55e" : "#ef4444" }}>
              {graduated
                ? "Mastered → graduates 🎓 (archived from active review)"
                : mastered
                ? `Mastered → fast-track ⚡ to Box ${nextBox} · next review in ${boxDaysLabel(BOX_DAYS[nextBox])}`
                : passed
                ? `Pass → moves to Box ${nextBox} · next review in ${boxDaysLabel(BOX_DAYS[nextBox])}`
                : `Miss → back to Box ${nextBox} · review again in ${boxDaysLabel(BOX_DAYS[nextBox])}`}
            </p>
          )}
        </div>

        {canEdit && (
          <div className="flex items-center rounded-lg border border-base-300 overflow-hidden self-start text-[11px] font-black">
            {(["new", "edit"] as const).map(m => (
              <button
                key={m}
                onClick={() => chooseMode(m)}
                className={`px-2.5 py-1 transition-colors ${
                  saveMode === m
                    ? "bg-primary text-primary-content"
                    : "bg-base-100 text-base-content/40 hover:text-base-content/70"
                }`}
              >
                {m === "new" ? "New re-solve" : "Edit original"}
              </button>
            ))}
          </div>
        )}

        {saveMode === "edit" ? (
          solutionEditor
        ) : (
          <>
            <button onClick={() => setShowUpdate(v => !v)}
              className="btn btn-xs btn-ghost self-start gap-1.5 font-bold text-base-content/40 hover:text-base-content/70">
              <Plus size={11} /> {showUpdate ? "Hide updated solution" : "Record an updated solution (optional)"}
              {showUpdate ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            {showUpdate && solutionEditor}
          </>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => logReview()}
            disabled={confidence == null || isPending}
            className="btn btn-sm font-black text-white border-none gap-2 flex-1 disabled:opacity-40"
            style={{ backgroundColor: "var(--game-accent)", boxShadow: "0 4px 0 color-mix(in srgb, var(--game-accent) 50%, #000)" }}
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {confidence == null ? "Rate to reschedule" : saveMode === "edit" ? "Update & reschedule" : "Log review"}
          </button>
          <button
            onClick={onSkip}
            title={snoozes ? "Push to tomorrow — it leaves today's queue" : "Show the next problem"}
            className="btn btn-sm btn-ghost font-black gap-1.5 text-base-content/50"
          >
            <SkipForward size={13} /> {snoozes ? "Snooze 1d" : "Next"}
          </button>
        </div>
        <p className="text-[10px] font-semibold text-base-content/25 text-center select-none">
          1–5 rate · N notes · C code · S {snoozes ? "snooze" : "next"} · Enter log
        </p>
      </div>
    </div>
  );
}

function ReviewHelp({ goal }: { goal: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="text-base-content/30 hover:text-base-content/60 transition-colors flex"
        title="How review works"
        aria-label="How review works"
      >
        <HelpCircle size={15} />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-base-300 bg-base-100 p-4 shadow-2xl text-left flex flex-col gap-3 select-text cursor-default">
          <div className="flex flex-col gap-1">
            <p className="font-black text-sm text-base-content">Spaced repetition</p>
            <p className="text-xs text-base-content/60 leading-relaxed">
              Each problem sits in a box that sets how long until you see it again.
              After re-solving, rate how it went:
            </p>
          </div>
          <div className="flex flex-col gap-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-black" style={{ color: "#22c55e" }}>Got It +</span>
              <span className="text-base-content/55">moves up a box — longer gap</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-black" style={{ color: "#ef4444" }}>Shaky / Struggled</span>
              <span className="text-base-content/55">drops to Box 1 — see it tomorrow</span>
            </div>
          </div>
          <div className="flex flex-col gap-1 pt-1 border-t border-base-300">
            <p className="text-[10px] font-black text-base-content/30 uppercase tracking-wider mt-1">Schedule</p>
            {[1, 2, 3, 4, 5].map(b => (
              <div key={b} className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-base-content/50">
                  Box {b}{b >= SPEEDRUN_BOX && <span style={{ color: "#a78bfa" }}> ⚡</span>}
                </span>
                <span className="font-mono text-base-content/40">every {boxDaysLabel(BOX_DAYS[b])}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-base-content/45 leading-relaxed pt-1 border-t border-base-300">
            <span className="font-bold" style={{ color: "#a78bfa" }}>⚡ Boxes {SPEEDRUN_BOX}–{MAX_BOX}:</span> blueprint
            the approach out loud in ~3 min instead of coding it — a fast warm-up.
          </p>
          <p className="text-[11px] text-base-content/45 leading-relaxed">
            Rate <span className="font-bold" style={{ color: "#a78bfa" }}>Mastered</span> on a review
            and it <span className="font-bold">fast-tracks ⚡ two boxes</span> at once (or graduates
            straight from the top).
          </p>
          <p className="text-[11px] text-base-content/45 leading-relaxed">
            Each day you get a plan of <span className="font-bold">{goal}</span> (adjustable in the
            header) — lowest boxes and most overdue first. A big pile-up can be spread across the
            coming days with one click, and the queue&apos;s <Archive size={10} className="inline" /> archives
            problems you never want to review.
          </p>
          <p className="text-[11px] text-base-content/45 leading-relaxed">
            Pass a <span className="font-bold">Box {MAX_BOX}</span> problem in review and it
            <span className="font-bold"> graduates 🎓</span> — archived out of the queue (your data stays;
            re-solve it anytime to bring it back).
          </p>
          <p className="text-[11px] text-base-content/45 leading-relaxed">
            <span className="font-bold">Snooze</span> pushes a problem to tomorrow without
            touching its box — for &quot;not today&quot;, guilt-free.
          </p>
          <p className="text-[11px] text-base-content/45 leading-relaxed pt-1 border-t border-base-300">
            <span className="font-bold">Include imported</span> also surfaces problems you imported
            but never recorded a solution for, so you can re-solve them.
          </p>
        </div>
      )}
    </div>
  );
}

function ImportedToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none" title="Also surface problems you only imported (no recorded solution) so you can re-solve and record them.">
      <input
        type="checkbox"
        checked={value}
        onChange={e => onChange(e.target.checked)}
        className="toggle toggle-sm"
        style={{ "--tglbg": "var(--game-accent)" } as React.CSSProperties}
      />
      <span className="text-xs font-bold text-base-content/50">Include imported</span>
    </label>
  );
}

function QueueList({ items, activeId, laterCount, showAll, onToggleShowAll, onSelect, onArchive }: {
  items: ReviewDueItem[]; activeId: number; laterCount: number; showAll: boolean;
  onToggleShowAll: () => void; onSelect: (id: number) => void; onArchive: (id: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-base-300 bg-base-200/30 p-2 flex flex-col gap-1 lg:max-h-[38rem] lg:overflow-y-auto">
      <p className="px-2 pt-1 pb-0.5 text-[10px] font-black uppercase tracking-wider text-base-content/35">
        {showAll ? "Full queue" : "Today's plan"} · {items.length}
        <span className="normal-case font-bold text-base-content/25"> · {fmtMinutes(items.reduce((m, i) => m + reviewMinutes(i), 0))}</span>
      </p>
      {items.map((i, n) => {
        const active = i.problem.id === activeId;
        const c = DIFF_COLORS[i.problem.difficulty.toLowerCase()] ?? DIFF_COLORS.medium;
        return (
          <div
            key={i.problem.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(i.problem.id)}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(i.problem.id); } }}
            className={`group flex items-center gap-2 px-2.5 py-2 rounded-xl border text-left cursor-pointer transition-colors ${
              active ? "bg-base-100 border-[var(--game-accent)]" : "border-transparent hover:bg-base-200/80"
            }`}
          >
            <span className="font-mono text-[10px] text-base-content/25 w-4 text-right shrink-0">{n + 1}</span>
            <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: c.text }} title={i.problem.difficulty} />
            <span className={`flex-1 min-w-0 truncate text-xs font-bold ${active ? "text-base-content" : "text-base-content/70"}`}>
              {i.problem.title}
            </span>
            {i.imported_only ? (
              <span className="text-[9px] font-black uppercase tracking-wider text-base-content/30 shrink-0">imp</span>
            ) : (
              <>
                <span className="text-[9px] font-black text-base-content/35 shrink-0 group-hover:hidden">B{i.box}</span>
                <span className="text-[9px] font-semibold text-base-content/30 shrink-0 w-9 text-right group-hover:hidden">
                  {shortOverdue(i.next_review_at)}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); onArchive(i.problem.id); }}
                  className="hidden group-hover:flex shrink-0 p-1 rounded-md text-base-content/30 hover:text-error hover:bg-error/10 transition-colors"
                  title="Stop reviewing this problem (re-solve it to bring it back)"
                >
                  <Archive size={12} />
                </button>
              </>
            )}
          </div>
        );
      })}
      {(laterCount > 0 || showAll) && (
        <button
          onClick={onToggleShowAll}
          className="mt-1 w-full py-1.5 rounded-lg border border-dashed border-base-300 text-[11px] font-bold text-base-content/40 hover:text-base-content/70 hover:border-base-content/30 transition-colors"
        >
          {showAll ? "Show today's plan only" : `+${laterCount} more waiting — show all`}
        </button>
      )}
    </div>
  );
}

function PipelineStrip({ stats }: { stats?: ReviewStats }) {
  if (!stats || (stats.active === 0 && stats.graduated === 0)) return null;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-stretch justify-center gap-2 flex-wrap">
        {[1, 2, 3, 4, 5].map(b => (
          <div key={b} className="flex flex-col items-center gap-0.5 rounded-xl border border-base-300 bg-base-200/40 px-3.5 py-2 min-w-[3.5rem]">
            <span className="font-black text-sm text-base-content">{stats.box_counts[String(b)] ?? 0}</span>
            <span className="text-[9px] font-black uppercase tracking-wider text-base-content/35">
              Box {b}{b >= SPEEDRUN_BOX ? " ⚡" : ""}
            </span>
          </div>
        ))}
        <div className="flex flex-col items-center gap-0.5 rounded-xl border border-base-300 bg-base-200/40 px-3.5 py-2 min-w-[3.5rem]">
          <span className="font-black text-sm" style={{ color: "#a78bfa" }}>{stats.graduated}</span>
          <span className="text-[9px] font-black uppercase tracking-wider text-base-content/35">🎓 Grad</span>
        </div>
      </div>
      {(stats.due_tomorrow > 0 || stats.due_week > 0) && (
        <p className="text-[11px] font-bold text-base-content/40">
          {stats.due_tomorrow > 0 && `${stats.due_tomorrow} due tomorrow`}
          {stats.due_tomorrow > 0 && stats.due_week > 0 && " · "}
          {stats.due_week > 0 && `${stats.due_week} due this week`}
        </p>
      )}
    </div>
  );
}

function ReviewQueue({ items, isLoading, token, stats, goal, onGoalChange, includeImported, onToggleImported, onChanged }: {
  items: ReviewDueItem[]; isLoading: boolean; token: string; stats?: ReviewStats;
  goal: number; onGoalChange: (n: number) => void;
  includeImported: boolean; onToggleImported: (v: boolean) => void; onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [override, setOverride] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const doneToday = stats?.done_today ?? 0;

  // Most fragile first: lowest box, then most overdue; imported backlog last.
  const prioritized = useMemo(() => {
    const scheduled = items
      .filter(i => !i.imported_only)
      .sort((a, b) =>
        a.box - b.box ||
        new Date(a.next_review_at).getTime() - new Date(b.next_review_at).getTime());
    return [...scheduled, ...items.filter(i => i.imported_only)];
  }, [items]);

  // The day plan: only what's left of today's goal; the rest waits collapsed.
  const planSize = Math.max(1, goal - doneToday);
  const queueItems = showAll ? prioritized : prioritized.slice(0, planSize);
  const laterCount = prioritized.length - Math.min(planSize, prioritized.length);
  const scheduledDueCount = items.filter(i => !i.imported_only).length;

  const item = prioritized.find(i => i.problem.id === selectedId) ?? queueItems[0];

  const { mutate: snooze } = useMutation<void, Error, number>({
    mutationFn: async (problemId) => {
      const r = await authFetch(`${API_URL}/api/leetcode/review/${problemId}/snooze`, token, { method: "POST" });
      if (!r.ok && r.status !== 204) throw new Error("Couldn't snooze");
    },
    onMutate: async (problemId) => {
      await queryClient.cancelQueries({ queryKey: ["leetcode", "review", includeImported] });
      const previous = queryClient.getQueryData<ReviewDueItem[]>(["leetcode", "review", includeImported]);
      queryClient.setQueryData<ReviewDueItem[]>(["leetcode", "review", includeImported], (old = []) =>
        old.filter(i => i.problem.id !== problemId));
      return { previous };
    },
    onSuccess: () => toast.success("😴 Snoozed — back tomorrow"),
    onError: (_e, _v, ctx) => {
      const c = ctx as { previous?: ReviewDueItem[] } | undefined;
      if (c?.previous) queryClient.setQueryData(["leetcode", "review", includeImported], c.previous);
      toast.error("Couldn't snooze");
    },
    onSettled: () => onChanged(),
  });

  const { mutate: archive } = useMutation<void, Error, number>({
    mutationFn: async (problemId) => {
      const r = await authFetch(`${API_URL}/api/leetcode/review/${problemId}/archive`, token, { method: "POST" });
      if (!r.ok && r.status !== 204) throw new Error("Couldn't archive");
    },
    onMutate: async (problemId) => {
      await queryClient.cancelQueries({ queryKey: ["leetcode", "review", includeImported] });
      const previous = queryClient.getQueryData<ReviewDueItem[]>(["leetcode", "review", includeImported]);
      queryClient.setQueryData<ReviewDueItem[]>(["leetcode", "review", includeImported], (old = []) =>
        old.filter(i => i.problem.id !== problemId));
      return { previous };
    },
    onSuccess: () => toast.success("Archived — re-solve it anytime to bring it back"),
    onError: (_e, _v, ctx) => {
      const c = ctx as { previous?: ReviewDueItem[] } | undefined;
      if (c?.previous) queryClient.setQueryData(["leetcode", "review", includeImported], c.previous);
      toast.error("Couldn't archive");
    },
    onSettled: () => onChanged(),
  });

  const { mutate: rebalance, isPending: rebalancing } = useMutation<
    { kept: number; moved: number; spread_days: number }, Error
  >({
    mutationFn: async () => {
      const r = await authFetch(`${API_URL}/api/leetcode/review/rebalance?per_day=${goal}`, token, { method: "POST" });
      if (!r.ok) throw new Error("Couldn't spread the backlog");
      return r.json();
    },
    onSuccess: ({ kept, moved, spread_days }) => {
      toast.success(`Kept ${kept} for today — spread ${moved} across the next ${spread_days} day${spread_days === 1 ? "" : "s"}`);
      onChanged();
    },
    onError: (e) => toast.error(e.message),
  });

  function advanceFrom(problemId: number) {
    const idx = queueItems.findIndex(i => i.problem.id === problemId);
    const next = queueItems[(idx + 1) % queueItems.length];
    setSelectedId(next && next.problem.id !== problemId ? next.problem.id : null);
  }

  // Snooze pushes a scheduled problem to tomorrow (it leaves the queue);
  // imported-only items have no schedule, so "skip" just moves to the next one.
  function handleSkip() {
    if (!item) return;
    advanceFrom(item.problem.id);
    if (!item.imported_only) snooze(item.problem.id);
  }

  function handleArchive(problemId: number) {
    if (item && item.problem.id === problemId) advanceFrom(problemId);
    archive(problemId);
  }

  function handleLogged() {
    setSelectedId(null); // fall back to the top of whatever remains
    onChanged();
  }

  function header(title: string, extra?: React.ReactNode) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <Brain size={16} style={{ color: "var(--game-accent)" }} />
        <p className="font-black text-sm text-base-content">{title}</p>
        <ReviewHelp goal={goal} />
        {extra}
        <div className="ml-auto flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-[11px] font-bold text-base-content/50 cursor-pointer">
            Goal
            <select
              value={goal}
              onChange={e => onGoalChange(Number(e.target.value))}
              className="select select-xs select-bordered font-bold"
            >
              {REVIEW_GOAL_CHOICES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            /day
          </label>
          <ImportedToggle value={includeImported} onChange={onToggleImported} />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <p className="text-sm font-bold text-base-content/30 text-center py-10">Loading review queue…</p>;
  }

  const progress = (
    <span className="text-xs font-bold">
      <span style={{ color: "var(--game-accent)" }}>Today {doneToday}/{goal}</span>
      {items.length > 0 && <span className="text-base-content/30"> · {items.length} due</span>}
    </span>
  );

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {header("Review", progress)}
        <div className="flex flex-col items-center gap-6 py-16 text-base-content/30">
          <Sparkles size={40} style={{ color: "var(--game-accent)" }} />
          <div className="flex flex-col items-center gap-1">
            <p className="font-black text-sm text-base-content/60">All caught up</p>
            <p className="text-xs font-semibold">
              {includeImported
                ? "Nothing due, and no imported problems left to record."
                : "No problems due for review. Toggle imports to drill ones you only imported."}
            </p>
          </div>
          <PipelineStrip stats={stats} />
        </div>
      </div>
    );
  }

  // Daily cap: once you hit the goal, suggest stopping (you can override).
  if (doneToday >= goal && !override) {
    return (
      <div className="flex flex-col gap-4">
        {header("Review", progress)}
        <div className="flex flex-col items-center gap-4 py-14 text-base-content/40">
          <Sparkles size={40} style={{ color: "var(--game-accent)" }} />
          <div className="flex flex-col items-center gap-1 text-center max-w-xs">
            <p className="font-black text-sm text-base-content/70">Daily goal reached 🎉</p>
            <p className="text-xs font-semibold">
              {doneToday} reviews done today. {items.length} more {items.length === 1 ? "is" : "are"} due —
              but spacing them out beats burning out. Come back tomorrow, or push on.
            </p>
          </div>
          <button
            onClick={() => setOverride(true)}
            className="btn btn-sm btn-ghost font-black border border-base-300 gap-1.5"
          >
            <Zap size={13} /> Keep reviewing
          </button>
          <PipelineStrip stats={stats} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {header("Due for review", progress)}
      {scheduledDueCount > goal * 2 && (
        <div className="rounded-2xl border border-base-300 bg-base-200/40 px-4 py-3 flex items-center gap-3 flex-wrap">
          <p className="text-xs font-semibold text-base-content/60 flex-1 min-w-[16rem]">
            <span className="font-black text-base-content/80">{scheduledDueCount} problems due</span> — that&apos;s a
            pile-up, not a plan. Keep today&apos;s {goal} most fragile and push the rest to the coming days.
          </p>
          <button
            onClick={() => rebalance()}
            disabled={rebalancing}
            className="btn btn-sm font-black text-white border-none gap-1.5 shrink-0"
            style={{ backgroundColor: "var(--game-accent)", boxShadow: "0 4px 0 color-mix(in srgb, var(--game-accent) 50%, #000)" }}
          >
            {rebalancing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            Spread it out
          </button>
        </div>
      )}
      <div className="grid gap-4 items-start lg:grid-cols-[minmax(0,1fr)_280px]">
        <ReviewCard
          key={item.problem.leetcode_id}
          item={item}
          token={token}
          snoozes={!item.imported_only}
          onLogged={handleLogged}
          onSkip={handleSkip}
        />
        <QueueList
          items={queueItems}
          activeId={item.problem.id}
          laterCount={laterCount}
          showAll={showAll}
          onToggleShowAll={() => setShowAll(v => !v)}
          onSelect={setSelectedId}
          onArchive={handleArchive}
        />
      </div>
    </div>
  );
}

// ── Insights tab ────────────────────────────────────────────────────────────

interface TopicStat {
  topic: string;
  count: number;              // problems tagged with this topic
  rated: number;              // how many of those have a confidence score
  avgConfidence: number | null;
}

/** Most recent confidence for a problem, skipping unrated attempts. */
function latestConfidence(g: SolveGroup): number | null {
  for (let i = g.solves.length - 1; i >= 0; i--) {
    if (g.solves[i].confidence != null) return g.solves[i].confidence;
  }
  return null;
}

/** Map a 1–5 confidence average onto its nearest label color. */
function confColor(v: number): string {
  const rounded = Math.max(1, Math.min(5, Math.round(v)));
  return CONFIDENCE_LABELS[rounded].color;
}

// Prominence ranking of the canonical interview patterns — algorithmic
// techniques rank above data structures, which rank above generic buckets like
// Array/String/Math. Used to pick which patterns headline the radar (the most
// prominent ones you've practiced, not just the highest-volume). Reorder freely.
const PATTERN_PRIORITY = [
  "Dynamic Programming", "Backtracking", "Union Find", "Topological Sort",
  "Shortest Path", "Trie", "Segment Tree", "Binary Indexed Tree",
  "Monotonic Stack", "Sliding Window", "Two Pointers", "Binary Search",
  "Divide and Conquer", "Greedy", "Depth-First Search", "Breadth-First Search",
  "Graph", "Tree", "Heap (Priority Queue)", "Prefix Sum", "Bit Manipulation",
  "Linked List", "Stack", "Queue", "Ordered Set", "Memoization", "Recursion",
  "Matrix", "Hash Table", "Sorting", "Number Theory", "Combinatorics",
  "Geometry", "Game Theory", "Simulation", "Counting", "Design", "Iterator",
  "Interactive", "Math", "String", "Array",
];
const PATTERN_RANK: Record<string, number> = Object.fromEntries(
  PATTERN_PRIORITY.map((t, i) => [t, i]),
);

// Distinct-enough palette for the topic pie; "Other" always gets the trailing gray.
const PIE_COLORS = [
  "#22c55e", "#3b82f6", "#f59e0b", "#a78bfa", "#ef4444",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6",
];

interface PieRow { topic: string; count: number; pct: number; color: string; }

/** Shared tooltip chrome for the recharts panels. */
function TipBox({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 px-3 py-2 shadow-xl">
      <p className="text-xs font-black text-base-content">{title}</p>
      <p className="text-[11px] font-semibold text-base-content/60">{sub}</p>
    </div>
  );
}

function TopicPieTooltip({ active, payload }: { active?: boolean; payload?: { payload: PieRow }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return <TipBox title={d.topic} sub={`${d.count} solved · ${d.pct.toFixed(1)}%`} />;
}

function ConfDistTooltip({ active, payload }: { active?: boolean; payload?: { payload: { label: string; count: number } }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return <TipBox title={d.label} sub={`${d.count} problem${d.count === 1 ? "" : "s"}`} />;
}

function ConfDiffTooltip({ active, payload }: { active?: boolean; payload?: { payload: { difficulty: string; avg: number; n: number } }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return <TipBox title={d.difficulty} sub={d.n ? `avg ${d.avg.toFixed(2)} · ${d.n} rated` : "no rated solves"} />;
}

function ConfRadarTooltip({ active, payload }: { active?: boolean; payload?: { payload: { topic: string; avg: number; count: number } }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return <TipBox title={d.topic} sub={`avg ${d.avg.toFixed(2)} · ${d.count} solved`} />;
}

// Muted axis/grid tones that read on both light and dark themes.
const AXIS_TICK = "#94a3b8";
const GRID_STROKE = "#94a3b833";

// ── Daily activity helpers ──────────────────────────────────────────────────

const DAY_RANGES: { label: string; days: number | null }[] = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y",  days: 365 },
  { label: "All", days: null },
];

/** Local YYYY-MM-DD for a Date (avoids the UTC shift of toISOString). */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const localDay = (iso: string) => dayKey(new Date(iso));
const fmtDay = (v: string) => v.slice(5).replace("-", "/"); // 2026-07-04 → 07/04

function DailyTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value?: number; name?: string; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  if (total === 0) return null;
  const title = label
    ? new Date(`${label}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "";
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 px-3 py-2 shadow-xl">
      <p className="text-xs font-black text-base-content">{title}</p>
      {payload.filter(p => (p.value ?? 0) > 0).map(p => (
        <p key={p.name} className="text-[11px] font-semibold" style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
      <p className="text-[11px] font-black text-base-content/70 mt-0.5">{total} total</p>
    </div>
  );
}

function InsightsTab({ groups, token }: { groups: SolveGroup[]; token: string }) {
  const queryClient = useQueryClient();
  const [includeImported, setIncludeImported] = useState(false);
  const [confirmSync, setConfirmSync] = useState(false);
  const [rangeDays, setRangeDays] = useState<number | null>(90);
  const [activeDiffs, setActiveDiffs] = useState<Record<string, boolean>>({ easy: true, medium: true, hard: true });
  const [chartType, setChartType] = useState<"line" | "bar">("line");

  // A problem is "imported-only" when it has no real (logged) solve behind it.
  const hasImported = useMemo(
    () => groups.some(g => g.solves.every(s => s.is_imported)),
    [groups],
  );
  const visibleGroups = useMemo(
    () => includeImported ? groups : groups.filter(g => g.solves.some(s => !s.is_imported)),
    [groups, includeImported],
  );

  const topicStats = useMemo<TopicStat[]>(() => {
    const map: Record<string, { count: number; sum: number; rated: number }> = {};
    for (const g of visibleGroups) {
      const conf = latestConfidence(g);
      for (const topic of g.problem.topics) {
        if (!map[topic]) map[topic] = { count: 0, sum: 0, rated: 0 };
        const e = map[topic];
        e.count++;
        if (conf != null) { e.sum += conf; e.rated++; }
      }
    }
    return Object.entries(map).map(([topic, e]) => ({
      topic,
      count: e.count,
      rated: e.rated,
      avgConfidence: e.rated ? e.sum / e.rated : null,
    }));
  }, [visibleGroups]);

  // Weakest-first: the topics worth grinding rise to the top.
  const byConfidence = useMemo(
    () => topicStats.filter(t => t.avgConfidence != null)
      .sort((a, b) => a.avgConfidence! - b.avgConfidence!)
      .map(t => ({ topic: t.topic, avg: t.avgConfidence!, count: t.count })),
    [topicStats],
  );
  // The most *prominent* patterns (by PATTERN_PRIORITY), sized by problem count.
  // No "Other" bucket — just the top patterns, with percentages normalized across
  // the shown slices so they total 100%.
  const pieData = useMemo<PieRow[]>(() => {
    const ranked = topicStats
      .filter(t => PATTERN_RANK[t.topic] != null)
      .sort((a, b) => PATTERN_RANK[a.topic] - PATTERN_RANK[b.topic])
      .slice(0, PIE_COLORS.length);
    const total = ranked.reduce((s, t) => s + t.count, 0) || 1;
    return ranked.map((t, i) => ({
      topic: t.topic,
      count: t.count,
      pct: (t.count / total) * 100,
      color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [topicStats]);

  // How many problems this level rating — the confidence distribution.
  const confDist = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const g of visibleGroups) {
      const c = latestConfidence(g);
      if (c != null) counts[c - 1]++;
    }
    return ([1, 2, 3, 4, 5] as const).map(n => ({
      level: n,
      label: CONFIDENCE_LABELS[n].label,
      count: counts[n - 1],
      color: CONFIDENCE_LABELS[n].color,
    }));
  }, [visibleGroups]);

  const ratedCount = useMemo(
    () => confDist.reduce((s, d) => s + d.count, 0),
    [confDist],
  );

  // Average confidence per difficulty — shaky-on-Hard vs shaky-everywhere.
  const confByDiff = useMemo(() => {
    const acc: Record<string, { sum: number; n: number }> = {
      easy: { sum: 0, n: 0 }, medium: { sum: 0, n: 0 }, hard: { sum: 0, n: 0 },
    };
    for (const g of visibleGroups) {
      const c = latestConfidence(g);
      const d = g.problem.difficulty.toLowerCase();
      if (c != null && acc[d]) { acc[d].sum += c; acc[d].n++; }
    }
    return (["easy", "medium", "hard"] as const).map(d => ({
      difficulty: d.charAt(0).toUpperCase() + d.slice(1),
      avg: acc[d].n ? acc[d].sum / acc[d].n : 0,
      n: acc[d].n,
      color: DIFF_COLORS[d].text,
    }));
  }, [visibleGroups]);

  // Skill-shape: avg confidence across your most *prominent* patterns (ranked by
  // PATTERN_PRIORITY), not the highest-volume tags. Generic buckets like Array/
  // String rank last so they only appear if you've barely touched real patterns.
  const confRadar = useMemo(
    () => topicStats
      .filter(t => t.avgConfidence != null && PATTERN_RANK[t.topic] != null)
      .sort((a, b) => PATTERN_RANK[a.topic] - PATTERN_RANK[b.topic])
      .slice(0, 8)
      .map(t => ({ topic: t.topic, avg: t.avgConfidence!, count: t.count })),
    [topicStats],
  );

  // Solves per day, split by difficulty, over the selected range. Counts each
  // solve event (re-solves included); respects the imported toggle per-solve.
  const dailyData = useMemo(() => {
    const byDay: Record<string, Record<string, number>> = {};
    let earliest: string | null = null;
    for (const g of groups) {
      const diff = g.problem.difficulty.toLowerCase();
      if (diff !== "easy" && diff !== "medium" && diff !== "hard") continue;
      for (const s of g.solves) {
        if (!includeImported && s.is_imported) continue;
        const day = localDay(s.solved_at);
        if (!byDay[day]) byDay[day] = { easy: 0, medium: 0, hard: 0 };
        byDay[day][diff]++;
        if (!earliest || day < earliest) earliest = day;
      }
    }
    if (!earliest) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let start: Date;
    if (rangeDays) {
      start = new Date(today);
      start.setDate(start.getDate() - (rangeDays - 1));
    } else {
      start = new Date(`${earliest}T00:00:00`);
    }

    const rows: { date: string; easy: number; medium: number; hard: number }[] = [];
    const end = today.getTime();
    for (const d = new Date(start); d.getTime() <= end; d.setDate(d.getDate() + 1)) {
      const key = dayKey(d);
      const rec = byDay[key];
      rows.push({ date: key, easy: rec?.easy ?? 0, medium: rec?.medium ?? 0, hard: rec?.hard ?? 0 });
    }
    return rows;
  }, [groups, includeImported, rangeDays]);

  const hasDailyData = useMemo(
    () => dailyData.some(r => r.easy + r.medium + r.hard > 0),
    [dailyData],
  );

  const { mutate: sync, isPending: syncing } = useMutation<
    { synced: number; failed: number }, Error
  >({
    mutationFn: async () => {
      const r = await authFetch(`${API_URL}/api/leetcode/sync-topics`, token, { method: "POST" });
      if (!r.ok) throw new Error((await r.json()).detail ?? "Sync failed");
      return r.json();
    },
    onSuccess: ({ synced, failed }) => {
      queryClient.invalidateQueries({ queryKey: ["leetcode"] });
      if (synced > 0) {
        toast.success(`Synced topics for ${synced} problem${synced === 1 ? "" : "s"}${failed ? ` — ${failed} couldn't be fetched` : ""}`);
      } else {
        toast("No topics returned from LeetCode");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-base-content/25">
        <BarChart3 size={40} />
        <div className="flex flex-col items-center gap-1">
          <p className="font-black text-sm">No topic data yet</p>
          <p className="text-xs font-semibold">Log a few solves to see your strengths by topic.</p>
        </div>
      </div>
    );
  }

  const syncControl = confirmSync ? (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] font-semibold text-base-content/50">
        Replace all topics with LeetCode&apos;s official tags?
      </span>
      <button
        onClick={() => { setConfirmSync(false); sync(); }}
        className="btn btn-xs font-black text-white border-none gap-1"
        style={{ backgroundColor: "var(--game-accent)" }}
      >
        <Check size={11} /> Sync
      </button>
      <button onClick={() => setConfirmSync(false)} className="btn btn-xs btn-ghost font-black text-base-content/50">
        Cancel
      </button>
    </div>
  ) : (
    <button
      onClick={() => setConfirmSync(true)}
      disabled={syncing}
      className="btn btn-sm btn-ghost border border-base-300 gap-1.5 font-bold text-base-content/60"
      title="Re-fetch official topic tags from LeetCode for every solved problem, overwriting any manual edits."
    >
      {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
      {syncing ? "Syncing…" : "Sync topics"}
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header: sync + imported view filter */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {syncControl}
        {hasImported && <ImportedToggle value={includeImported} onChange={setIncludeImported} />}
      </div>

      {/* Problems solved each day */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <BarChart3 size={16} style={{ color: "var(--game-accent)" }} />
          <p className="font-black text-sm text-base-content">Problems solved each day</p>
          <div className="flex items-center gap-1 ml-1">
            {(["easy", "medium", "hard"] as const).map(d => (
              <button
                key={d}
                onClick={() => setActiveDiffs(a => ({ ...a, [d]: !a[d] }))}
                className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full transition-all"
                style={{
                  color: activeDiffs[d] ? "#fff" : DIFF_COLORS[d].text,
                  backgroundColor: activeDiffs[d] ? DIFF_COLORS[d].text : `${DIFF_COLORS[d].text}20`,
                }}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-base-300 text-[11px] font-black">
              {(["line", "bar"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setChartType(t)}
                  className={`px-2 py-1 capitalize transition-colors ${
                    chartType === t
                      ? "bg-primary text-primary-content"
                      : "bg-base-100 text-base-content/40 hover:text-base-content/70"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg overflow-hidden border border-base-300 text-[11px] font-black">
              {DAY_RANGES.map(r => (
                <button
                  key={r.label}
                  onClick={() => setRangeDays(r.days)}
                  className={`px-2 py-1 transition-colors ${
                    rangeDays === r.days
                      ? "bg-primary text-primary-content"
                      : "bg-base-100 text-base-content/40 hover:text-base-content/70"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {!hasDailyData ? (
          <p className="text-xs font-semibold text-base-content/40 py-4">No solves in this range.</p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "line" ? (
                <LineChart data={dailyData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDay}
                    interval={Math.floor(dailyData.length / 10)}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: AXIS_TICK, fontSize: 10 }}
                  />
                  <YAxis allowDecimals={false} width={24} tickLine={false} axisLine={false} tick={{ fill: AXIS_TICK, fontSize: 11 }} />
                  <Tooltip cursor={{ stroke: "#94a3b855" }} content={<DailyTooltip />} />
                  {(["easy", "medium", "hard"] as const)
                    .filter(d => activeDiffs[d])
                    .map(d => (
                      <Line
                        key={d}
                        type="monotone"
                        dataKey={d}
                        stroke={DIFF_COLORS[d].text}
                        strokeWidth={2}
                        dot={false}
                        name={d.charAt(0).toUpperCase() + d.slice(1)}
                      />
                    ))}
                </LineChart>
              ) : (
                <BarChart data={dailyData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDay}
                    interval={Math.floor(dailyData.length / 10)}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: AXIS_TICK, fontSize: 10 }}
                  />
                  <YAxis allowDecimals={false} width={24} tickLine={false} axisLine={false} tick={{ fill: AXIS_TICK, fontSize: 11 }} />
                  <Tooltip cursor={{ fill: "#94a3b81a" }} content={<DailyTooltip />} />
                  {(["easy", "medium", "hard"] as const)
                    .filter(d => activeDiffs[d])
                    .map((d, i, arr) => (
                      <Bar
                        key={d}
                        dataKey={d}
                        stackId="day"
                        fill={DIFF_COLORS[d].text}
                        name={d.charAt(0).toUpperCase() + d.slice(1)}
                        radius={i === arr.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                      />
                    ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {topicStats.length === 0 ? (
        <p className="text-sm font-semibold text-base-content/40 text-center py-10">
          No topics on your solves yet — hit <span className="font-black">Sync topics</span> to pull them from LeetCode.
        </p>
      ) : (
       <>
      {/* Confidence by topic */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Brain size={16} style={{ color: "var(--game-accent)" }} />
          <p className="font-black text-sm text-base-content">Confidence by topic</p>
          <span className="text-[11px] font-bold text-base-content/40">weakest first</span>
        </div>
        {byConfidence.length === 0 ? (
          <p className="text-xs font-semibold text-base-content/40 py-4">
            No confidence scores logged yet — rate your solves to unlock this.
          </p>
        ) : (
          <div className="w-full" style={{ height: Math.max(140, byConfidence.length * 28) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byConfidence} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis type="number" domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fill: AXIS_TICK, fontSize: 11 }} />
                <YAxis type="category" dataKey="topic" width={124} tickLine={false} axisLine={false} tick={{ fill: AXIS_TICK, fontSize: 10 }} />
                <Tooltip cursor={{ fill: "#94a3b81a" }} content={<ConfRadarTooltip />} />
                <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
                  {byConfidence.map(d => <Cell key={d.topic} fill={confColor(d.avg)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Confidence distribution + by difficulty */}
      {ratedCount > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} style={{ color: "var(--game-accent)" }} />
              <p className="font-black text-sm text-base-content">Confidence distribution</p>
            </div>
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={confDist} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: AXIS_TICK, fontSize: 11 }} />
                  <YAxis type="category" dataKey="label" width={64} tickLine={false} axisLine={false} tick={{ fill: AXIS_TICK, fontSize: 11 }} />
                  <Tooltip cursor={{ fill: "#94a3b81a" }} content={<ConfDistTooltip />} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {confDist.map(d => <Cell key={d.level} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} style={{ color: "var(--game-accent)" }} />
              <p className="font-black text-sm text-base-content">Confidence by difficulty</p>
              <span className="text-[11px] font-bold text-base-content/40">avg 0–5</span>
            </div>
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={confByDiff} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="difficulty" tickLine={false} axisLine={false} tick={{ fill: AXIS_TICK, fontSize: 11 }} />
                  <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} width={24} tickLine={false} axisLine={false} tick={{ fill: AXIS_TICK, fontSize: 11 }} />
                  <Tooltip cursor={{ fill: "#94a3b81a" }} content={<ConfDiffTooltip />} />
                  <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                    {confByDiff.map(d => <Cell key={d.difficulty} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      )}

      {/* Confidence profile by topic (radar) */}
      {confRadar.length >= 3 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Brain size={16} style={{ color: "var(--game-accent)" }} />
            <p className="font-black text-sm text-base-content">Confidence profile by pattern</p>
            <span className="text-[11px] font-bold text-base-content/40">most prominent</span>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={confRadar} outerRadius="70%">
                <PolarGrid stroke={GRID_STROKE} />
                <PolarAngleAxis dataKey="topic" tick={{ fill: AXIS_TICK, fontSize: 10 }} />
                <PolarRadiusAxis domain={[0, 5]} angle={90} tick={{ fill: AXIS_TICK, fontSize: 9 }} />
                <Radar dataKey="avg" stroke="var(--game-accent)" fill="var(--game-accent)" fillOpacity={0.3} />
                <Tooltip content={<ConfRadarTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Problems solved by topic */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <PieChartIcon size={16} style={{ color: "var(--game-accent)" }} />
          <p className="font-black text-sm text-base-content">Problems solved by pattern</p>
          <span className="text-[11px] font-bold text-base-content/40">most prominent</span>
        </div>
        {pieData.length === 0 ? (
          <p className="text-xs font-semibold text-base-content/40 py-4">
            No topics yet — fetch or log a few to see the breakdown.
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="h-56 w-56 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="count"
                    nameKey="topic"
                    innerRadius="58%"
                    outerRadius="92%"
                    paddingAngle={2}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {pieData.map(d => <Cell key={d.topic} fill={d.color} />)}
                  </Pie>
                  <Tooltip content={<TopicPieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {pieData.map(d => (
                <div key={d.topic} className="flex items-center gap-2 min-w-0">
                  <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="flex-1 truncate text-xs font-bold text-base-content/70" title={d.topic}>{d.topic}</span>
                  <span className="shrink-0 font-mono text-[11px] font-black text-base-content/50">{d.pct.toFixed(0)}%</span>
                  <span className="w-6 shrink-0 text-right text-[11px] font-semibold text-base-content/35">{d.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
       </>
      )}
    </div>
  );
}

// ── To Do tab ───────────────────────────────────────────────────────────────

/** Inline "add problem" search scoped to a single Kanban column/section. */
function TodoTab({ token, todos, isLoading, onLogProblem }: {
  token: string; todos: TodoItem[]; isLoading: boolean; onLogProblem: (p: SearchResult) => void;
}) {
  const queryClient = useQueryClient();
  const [active,     setActive]     = useState<number | null>(null); // null = Backlog
  const [query,      setQuery]      = useState("");
  const [results,    setResults]    = useState<SearchResult[]>([]);
  const [searching,  setSearching]  = useState(false);
  const [showDrop,   setShowDrop]   = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [hideDone,   setHideDone]   = useState(false);
  const [creating,   setCreating]   = useState(false);
  const [newName,    setNewName]    = useState("");
  const [renaming,   setRenaming]   = useState(false);
  const [renameText, setRenameText] = useState("");
  const [dragPid,    setDragPid]    = useState<number | null>(null);
  const [overPill,   setOverPill]   = useState<number | null | undefined>(undefined);
  const [overRow,    setOverRow]    = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoPicked  = useRef(false);

  const { data: lists = [], isLoading: listsLoading } = useQuery<TodoList[]>({
    queryKey: ["leetcode", "todo-lists"],
    queryFn:  () => authFetch(`${API_URL}/api/leetcode/todo/lists`, token).then(r => r.json()),
  });

  const onListIds = useMemo(() => new Set(todos.map(t => t.problem.leetcode_id)), [todos]);
  // done/total per list (key null = Backlog).
  const counts = useMemo(() => {
    const m = new Map<number | null, { done: number; total: number }>();
    for (const t of todos) {
      const e = m.get(t.list_id) ?? { done: 0, total: 0 };
      e.total++; if (t.done) e.done++;
      m.set(t.list_id, e);
    }
    return m;
  }, [todos]);

  // If the active list no longer exists (deleted), fall back to Backlog.
  const activeValid = active === null || lists.some(l => l.id === active);
  const view = activeValid ? active : null;
  const activeListObj = lists.find(l => l.id === view) ?? null;
  const activeCount = counts.get(view) ?? { done: 0, total: 0 };
  const backlogCount = counts.get(null) ?? { done: 0, total: 0 };
  const showBacklogPill = backlogCount.total > 0 || lists.length === 0 || view === null;

  // Rows for the active list, in manual order.
  const rows = useMemo(
    () => todos.filter(t => t.list_id === view).sort((a, b) => a.position - b.position || a.id - b.id),
    [todos, view],
  );
  const visibleRows = hideDone ? rows.filter(r => !r.done) : rows;

  // On first load, land on the first named list if the Backlog is empty.
  useEffect(() => {
    if (autoPicked.current || isLoading || listsLoading) return;
    autoPicked.current = true;
    if (backlogCount.total === 0 && lists.length > 0) setActive(lists[0].id);
  }, [isLoading, listsLoading, backlogCount.total, lists]);

  useEffect(() => {
    if (!query.trim() || query.length < 2) { setResults([]); setShowDrop(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await authFetch(`${API_URL}/api/leetcode/search?q=${encodeURIComponent(query)}`, token);
        if (r.ok) { setResults(await r.json()); setShowDrop(true); }
      } finally { setSearching(false); }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, token]);

  const { mutate: addTodo } = useMutation<TodoItem, Error, SearchResult>({
    mutationFn: async (p) => {
      const r = await authFetch(`${API_URL}/api/leetcode/todo`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leetcode_id: p.leetcode_id, title: p.title, slug: p.slug, difficulty: p.difficulty, topics: p.topics, list_id: view }),
      });
      if (!r.ok) throw new Error((await r.json()).detail ?? "Couldn't add");
      return r.json();
    },
    onSuccess: (todo) => {
      queryClient.invalidateQueries({ queryKey: ["leetcode", "todo"] });
      toast.success(todo.done ? "Added — already solved, so it's checked off" : "Added to your list");
    },
    onError: (e) => toast.error(e.message),
  });

  const { mutate: removeTodo } = useMutation<void, Error, number>({
    mutationFn: async (problemId) => {
      const r = await authFetch(`${API_URL}/api/leetcode/todo/${problemId}`, token, { method: "DELETE" });
      if (!r.ok && r.status !== 204) throw new Error("Couldn't remove");
    },
    onMutate: async (problemId) => {
      await queryClient.cancelQueries({ queryKey: ["leetcode", "todo"] });
      const previous = queryClient.getQueryData<TodoItem[]>(["leetcode", "todo"]);
      queryClient.setQueryData<TodoItem[]>(["leetcode", "todo"], (old = []) =>
        old.filter(t => t.problem.id !== problemId));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      const c = ctx as { previous?: TodoItem[] } | undefined;
      if (c?.previous) queryClient.setQueryData(["leetcode", "todo"], c.previous);
      toast.error("Couldn't remove");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["leetcode", "todo"] }),
  });

  const { mutate: importTodos, isPending: importing } = useMutation<
    { added: number; skipped: number; failed: number }, Error
  >({
    mutationFn: async () => {
      const slugs = importText.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean);
      if (slugs.length === 0) throw new Error("Paste some problem slugs or URLs first");
      const r = await authFetch(`${API_URL}/api/leetcode/todo/import`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugs, list_id: view }),
      });
      if (!r.ok) throw new Error((await r.json()).detail ?? "Import failed");
      return r.json();
    },
    onSuccess: ({ added, skipped, failed }) => {
      queryClient.invalidateQueries({ queryKey: ["leetcode", "todo"] });
      toast.success(`Added ${added}${skipped ? `, skipped ${skipped} already on a list` : ""}${failed ? `, ${failed} failed` : ""}`);
      setImportText(""); setShowImport(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const { mutate: moveTodo } = useMutation<void, Error, { problemId: number; listId: number | null }>({
    mutationFn: async ({ problemId, listId }) => {
      const r = await authFetch(`${API_URL}/api/leetcode/todo/${problemId}`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list_id: listId }),
      });
      if (!r.ok && r.status !== 204) throw new Error("Couldn't move");
    },
    onMutate: async ({ problemId, listId }) => {
      await queryClient.cancelQueries({ queryKey: ["leetcode", "todo"] });
      const previous = queryClient.getQueryData<TodoItem[]>(["leetcode", "todo"]);
      queryClient.setQueryData<TodoItem[]>(["leetcode", "todo"], (old = []) =>
        old.map(t => t.problem.id === problemId ? { ...t, list_id: listId, position: Number.MAX_SAFE_INTEGER } : t));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      const c = ctx as { previous?: TodoItem[] } | undefined;
      if (c?.previous) queryClient.setQueryData(["leetcode", "todo"], c.previous);
      toast.error("Couldn't move");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["leetcode", "todo"] }),
  });

  const { mutate: reorderTodos } = useMutation<void, Error, number[]>({
    mutationFn: async (problemIds) => {
      const r = await authFetch(`${API_URL}/api/leetcode/todo/reorder`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list_id: view, problem_ids: problemIds }),
      });
      if (!r.ok && r.status !== 204) throw new Error("Couldn't reorder");
    },
    onMutate: async (problemIds) => {
      await queryClient.cancelQueries({ queryKey: ["leetcode", "todo"] });
      const previous = queryClient.getQueryData<TodoItem[]>(["leetcode", "todo"]);
      const pos = new Map(problemIds.map((pid, i) => [pid, i]));
      queryClient.setQueryData<TodoItem[]>(["leetcode", "todo"], (old = []) =>
        old.map(t => pos.has(t.problem.id) ? { ...t, position: pos.get(t.problem.id)! } : t));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      const c = ctx as { previous?: TodoItem[] } | undefined;
      if (c?.previous) queryClient.setQueryData(["leetcode", "todo"], c.previous);
      toast.error("Couldn't reorder");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["leetcode", "todo"] }),
  });

  const { mutate: createList } = useMutation<TodoList, Error, string>({
    mutationFn: async (name) => {
      const r = await authFetch(`${API_URL}/api/leetcode/todo/lists`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) throw new Error((await r.json()).detail ?? "Couldn't create list");
      return r.json();
    },
    onSuccess: (l) => {
      queryClient.invalidateQueries({ queryKey: ["leetcode", "todo-lists"] });
      setActive(l.id); setCreating(false); setNewName("");
    },
    onError: (e) => toast.error(e.message),
  });

  const { mutate: renameList } = useMutation<TodoList, Error, { id: number; name: string }>({
    mutationFn: async ({ id, name }) => {
      const r = await authFetch(`${API_URL}/api/leetcode/todo/lists/${id}`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) throw new Error((await r.json()).detail ?? "Couldn't rename");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["leetcode", "todo-lists"] }); setRenaming(false); },
    onError: (e) => toast.error(e.message),
  });

  const { mutate: deleteList } = useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const r = await authFetch(`${API_URL}/api/leetcode/todo/lists/${id}`, token, { method: "DELETE" });
      if (!r.ok && r.status !== 204) throw new Error("Couldn't delete list");
    },
    onSuccess: () => {
      setActive(null);
      queryClient.invalidateQueries({ queryKey: ["leetcode", "todo-lists"] });
      queryClient.invalidateQueries({ queryKey: ["leetcode", "todo"] });
    },
    onError: (e) => toast.error(e.message),
  });

  function pick(p: SearchResult) {
    if (!onListIds.has(p.leetcode_id)) addTodo(p);
    setQuery(""); setResults([]); setShowDrop(false);
  }

  function commitCreate() {
    const name = newName.trim();
    if (name) createList(name);
    else { setCreating(false); setNewName(""); }
  }

  function commitRename() {
    if (!activeListObj) return;
    const name = renameText.trim();
    if (name && name !== activeListObj.name) renameList({ id: activeListObj.id, name });
    else setRenaming(false);
  }

  function handleDeleteList() {
    if (!activeListObj) return;
    const n = activeCount.total;
    if (!confirm(`Delete “${activeListObj.name}”${n ? ` and the ${n} problem${n === 1 ? "" : "s"} on it` : ""}?`)) return;
    deleteList(activeListObj.id);
  }

  function resetDrag() { setDragPid(null); setOverRow(null); setOverPill(undefined); }

  function handleRowDrop(targetPid: number) {
    const pid = dragPid;
    resetDrag();
    if (pid == null || pid === targetPid) return;
    const ordered = rows.map(r => r.problem.id).filter(id => id !== pid);
    const idx = ordered.indexOf(targetPid);
    if (idx === -1) return;
    ordered.splice(idx, 0, pid);
    reorderTodos(ordered);
  }

  function handleEndDrop() {
    const pid = dragPid;
    resetDrag();
    if (pid == null) return;
    const ordered = rows.map(r => r.problem.id).filter(id => id !== pid);
    ordered.push(pid);
    reorderTodos(ordered);
  }

  const pill = (key: number | null, name: string) => {
    const c = counts.get(key) ?? { done: 0, total: 0 };
    const isActive = view === key;
    const isOver = overPill !== undefined && overPill === key && dragPid !== null;
    return (
      <button
        key={key ?? "__backlog"}
        onClick={() => setActive(key)}
        onDragOver={e => { e.preventDefault(); if (overPill !== key) setOverPill(key); }}
        onDragLeave={() => setOverPill(cur => (cur === key ? undefined : cur))}
        onDrop={e => {
          e.preventDefault(); e.stopPropagation();
          const pid = dragPid;
          resetDrag();
          if (pid != null && key !== view) moveTodo({ problemId: pid, listId: key });
        }}
        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-sm font-black transition-colors shrink-0 ${
          isActive
            ? "text-white border-transparent"
            : isOver
              ? "border-[var(--game-accent)] text-base-content bg-base-200"
              : "border-base-300 text-base-content/60 bg-base-200/40 hover:bg-base-200"
        }`}
        style={isActive ? { backgroundColor: "var(--game-accent)", boxShadow: "0 3px 0 color-mix(in srgb, var(--game-accent) 50%, #000)" } : undefined}
      >
        {name}
        <span className={`text-[10px] font-black ${isActive ? "text-white/70" : "text-base-content/35"}`}>
          {c.done}/{c.total}
        </span>
      </button>
    );
  };

  const pct = activeCount.total ? Math.round((activeCount.done / activeCount.total) * 100) : 0;
  const anyDoneHere = rows.some(r => r.done);

  return (
    <div className="flex flex-col gap-4">
      {/* List switcher — drop a problem on a pill to move it there */}
      <div className="flex items-center gap-2 flex-wrap">
        {showBacklogPill && pill(null, "Backlog")}
        {lists.map(l => pill(l.id, l.name))}
        {creating ? (
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") commitCreate();
              if (e.key === "Escape") { setCreating(false); setNewName(""); }
            }}
            onBlur={commitCreate}
            placeholder="List name…"
            className="input input-sm input-bordered w-40 font-bold"
          />
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 px-3.5 py-1.5 rounded-full border border-dashed border-base-300 text-sm font-bold text-base-content/40 hover:text-base-content/70 hover:border-base-content/30 transition-colors shrink-0"
          >
            <Plus size={13} /> New list
          </button>
        )}
      </div>

      {/* Active list header: name, rename/delete, progress */}
      <div className="flex items-center gap-3 flex-wrap">
        {renaming && activeListObj ? (
          <input
            autoFocus
            value={renameText}
            onChange={e => setRenameText(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenaming(false);
            }}
            onBlur={commitRename}
            className="input input-sm input-bordered w-52 font-black"
          />
        ) : (
          <h3 className="font-black text-base text-base-content">{activeListObj?.name ?? "Backlog"}</h3>
        )}
        {activeListObj && !renaming && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setRenaming(true); setRenameText(activeListObj.name); }}
              className="p-1 rounded-md text-base-content/30 hover:text-base-content hover:bg-base-200 transition-colors"
              title="Rename list"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={handleDeleteList}
              className="p-1 rounded-md text-base-content/30 hover:text-error hover:bg-error/10 transition-colors"
              title="Delete list"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
        {activeCount.total > 0 && (
          <>
            <div className="h-1.5 w-40 rounded-full bg-base-300 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: "#22c55e" }} />
            </div>
            <span className="text-[11px] font-black text-base-content/40">{activeCount.done}/{activeCount.total} solved</span>
          </>
        )}
        {anyDoneHere && (
          <label className="flex items-center gap-2 cursor-pointer select-none shrink-0 ml-auto">
            <input
              type="checkbox"
              checked={hideDone}
              onChange={e => setHideDone(e.target.checked)}
              className="toggle toggle-xs"
              style={{ "--tglbg": "var(--game-accent)" } as React.CSSProperties}
            />
            <span className="text-[11px] font-bold text-base-content/50">Hide finished</span>
          </label>
        )}
      </div>

      {/* Add via search — goes into the active list */}
      <div className="flex items-start gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/30 pointer-events-none" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Search a problem to add to ${activeListObj?.name ?? "Backlog"}…`}
            className="input input-bordered w-full pl-9 pr-9 text-sm font-semibold"
            autoComplete="off"
          />
          {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/30 animate-spin" />}
          {showDrop && results.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-base-200 border border-base-300 rounded-xl shadow-2xl overflow-hidden">
              {results.map(r => {
                const c = DIFF_COLORS[r.difficulty] ?? DIFF_COLORS.medium;
                const added = onListIds.has(r.leetcode_id);
                return (
                  <button key={r.leetcode_id} type="button" onClick={() => pick(r)} disabled={added}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-base-300/60 transition-colors text-left disabled:opacity-40">
                    <span className="font-mono text-xs text-base-content/35 shrink-0 w-9">{r.leetcode_id}.</span>
                    <span className="flex-1 text-sm font-bold text-base-content truncate">{r.title}</span>
                    {added && <span className="text-[10px] font-black text-base-content/40 shrink-0">on a list</span>}
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0" style={{ color: c.text, backgroundColor: c.bg }}>{r.difficulty}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button
          onClick={() => setShowImport(v => !v)}
          className="btn btn-ghost border border-base-300 gap-1.5 font-bold text-base-content/60 shrink-0"
        >
          <Upload size={14} /> Import
        </button>
      </div>

      {/* Bulk import by slugs / URLs */}
      {showImport && (
        <div className="rounded-2xl bg-base-200 border border-base-300 p-4 flex flex-col gap-3">
          <p className="text-xs font-black text-base-content/60">
            Paste problem slugs or LeetCode URLs — one per line or comma-separated. They&apos;ll go into{" "}
            <span className="text-base-content">{activeListObj?.name ?? "Backlog"}</span>; already-solved ones show up checked off.
          </p>
          <textarea
            value={importText}
            onChange={e => setImportText(e.target.value)}
            rows={4}
            placeholder={"two-sum\nvalid-parentheses\nhttps://leetcode.com/problems/merge-k-sorted-lists/"}
            className="textarea textarea-bordered w-full text-sm font-mono"
          />
          <div className="flex gap-2">
            <button onClick={() => importTodos()} disabled={importing}
              className="btn btn-sm font-black text-white border-none gap-2"
              style={{ backgroundColor: "var(--game-accent)", boxShadow: "0 4px 0 color-mix(in srgb, var(--game-accent) 50%, #000)" }}>
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {importing ? "Importing…" : "Import to list"}
            </button>
            <button onClick={() => setShowImport(false)} className="btn btn-sm btn-ghost font-black">Cancel</button>
          </div>
        </div>
      )}

      {/* The list */}
      {isLoading ? (
        <p className="text-sm font-bold text-base-content/30 text-center py-10">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-14 text-base-content/25">
          <ListTodo size={40} />
          <div className="flex flex-col items-center gap-1">
            <p className="font-black text-sm">
              {todos.length === 0 && lists.length === 0 ? "Your to-do list is empty" : `Nothing in ${activeListObj?.name ?? "Backlog"} yet`}
            </p>
            <p className="text-xs font-semibold">Search a problem above, or import a curated list to plan your grind.</p>
          </div>
        </div>
      ) : (
        <div
          className="flex flex-col gap-1.5"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleEndDrop(); }}
        >
          {visibleRows.map(t => {
            const c = DIFF_COLORS[t.problem.difficulty.toLowerCase()] ?? DIFF_COLORS.medium;
            const isDragging = dragPid === t.problem.id;
            const isOver = overRow === t.problem.id && dragPid !== null && !isDragging;
            return (
              <div
                key={t.id}
                draggable
                onDragStart={e => {
                  setDragPid(t.problem.id);
                  e.dataTransfer.setData("text/plain", String(t.problem.id));
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={resetDrag}
                onDragOver={e => { e.preventDefault(); if (overRow !== t.problem.id) setOverRow(t.problem.id); }}
                onDrop={e => { e.preventDefault(); e.stopPropagation(); handleRowDrop(t.problem.id); }}
                className={`group flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-colors ${
                  isDragging ? "opacity-40" : ""
                } ${isOver ? "border-[var(--game-accent)]" : t.done ? "bg-base-200/40 border-base-300/50" : "bg-base-100 border-base-300"}`}
              >
                <GripVertical size={14} className="shrink-0 text-base-content/20 cursor-grab active:cursor-grabbing" />
                {t.done ? (
                  <Check size={14} className="shrink-0" style={{ color: "#22c55e" }} />
                ) : (
                  <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: c.text }} title={t.problem.difficulty} />
                )}
                <span className="font-mono text-[11px] text-base-content/30 shrink-0 w-9 text-right">{t.problem.leetcode_id}</span>
                <a
                  href={`https://leetcode.com/problems/${t.problem.slug}/`}
                  target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className={`flex-1 min-w-0 truncate text-sm font-bold hover:underline ${t.done ? "text-base-content/40 line-through" : "text-base-content"}`}
                  title={t.problem.title}
                >
                  {t.problem.title}
                </a>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 hidden sm:inline" style={{ color: c.text, backgroundColor: c.bg }}>
                  {t.problem.difficulty}
                </span>
                <button
                  onClick={() => onLogProblem({ leetcode_id: t.problem.leetcode_id, title: t.problem.title, slug: t.problem.slug, difficulty: t.problem.difficulty, topics: t.problem.topics })}
                  className="shrink-0 p-1 rounded-md text-base-content/30 hover:text-white hover:bg-[var(--game-accent)] transition-colors opacity-0 group-hover:opacity-100"
                  title={t.done ? "Log another solve" : "Log solve"}
                >
                  <Check size={13} />
                </button>
                <button
                  onClick={() => removeTodo(t.problem.id)}
                  className="shrink-0 p-1 rounded-md text-base-content/20 hover:text-error hover:bg-error/10 transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function LeetCodePage() {
  const { token }   = useAuth();
  const queryClient = useQueryClient();
  const modalRef    = useRef<HTMLDialogElement>(null);
  const clearModalRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter / sort / pagination state
  const [globalFilter, setGlobalFilter] = useState("");
  const [queryGroup,   setQueryGroup]   = useState<FilterGroup>({ id: "root", combinator: "and", rules: [] });
  const [showFilters,  setShowFilters]  = useState(false);
  const [sorting,      setSorting]      = useState<SortingState>([{ id: "lastSolved", desc: true }]);
  const [pageSize,     setPageSize]     = useState(25);
  const [pageIndex,    setPageIndex]    = useState(0);

  const [tab, setTab] = useState<"review" | "library" | "insights" | "todo">("library");
  const [reviewGoal, setReviewGoal] = useDailyGoal();
  const [includeImported, setIncludeImported] = useState(false);
  const [logInitial, setLogInitial] = useState<SearchResult | null>(null);
  const tabInitialized = useRef(false);

  const { data: solves = [], isLoading } = useQuery<Solve[]>({
    queryKey: ["leetcode", "solves"],
    queryFn:  () => authFetch(`${API_URL}/api/leetcode/solves`, token!).then(r => r.json()),
    enabled:  !!token,
  });

  const { data: dueItems = [], isLoading: dueLoading } = useQuery<ReviewDueItem[]>({
    queryKey: ["leetcode", "review", includeImported],
    queryFn:  () => authFetch(`${API_URL}/api/leetcode/review/due?include_imported=${includeImported}`, token!).then(r => r.json()),
    enabled:  !!token,
  });

  const { data: reviewStats } = useQuery<ReviewStats>({
    queryKey: ["leetcode", "review-stats"],
    queryFn:  () => authFetch(`${API_URL}/api/leetcode/review/stats?tz_offset=${new Date().getTimezoneOffset()}`, token!).then(r => r.json()),
    enabled:  !!token,
  });

  const { data: todos = [], isLoading: todosLoading } = useQuery<TodoItem[]>({
    queryKey: ["leetcode", "todo"],
    queryFn:  () => authFetch(`${API_URL}/api/leetcode/todo`, token!).then(r => r.json()),
    enabled:  !!token,
  });

  function openLog(initial: SearchResult | null) {
    setLogInitial(initial);
    modalRef.current?.showModal();
  }

  // Land on the Review tab the first time data loads if anything is due.
  useEffect(() => {
    if (!tabInitialized.current && !dueLoading) {
      tabInitialized.current = true;
      if (dueItems.length > 0) setTab("review");
    }
  }, [dueLoading, dueItems.length]);

  const { data: stats } = useQuery<{
    total: number;
    difficulty_breakdown: Record<string, number>;
  }>({
    queryKey: ["leetcode", "stats"],
    queryFn:  () => authFetch(`${API_URL}/api/leetcode/stats`, token!).then(r => r.json()),
    enabled:  !!token,
  });

  // Group solves by problem, sorted oldest-first within each group
  const groups = useMemo<SolveGroup[]>(() => {
    const map: Record<number, SolveGroup> = {};
    for (const solve of solves) {
      const key = solve.problem.leetcode_id;
      if (!map[key]) map[key] = { problem: solve.problem, solves: [] };
      map[key].solves.push(solve);
    }
    const result = Object.values(map);
    result.forEach(g =>
      g.solves.sort((a, b) => new Date(a.solved_at).getTime() - new Date(b.solved_at).getTime())
    );
    return result;
  }, [solves]);

  // Languages present in data (for filter dropdown)
  const availableLanguages = useMemo(() => {
    const langs = new Set<string>();
    groups.forEach(g => g.solves.forEach(s => { if (s.language) langs.add(s.language); }));
    return [...langs].sort();
  }, [groups]);

  // Topics present in data (for filter dropdown)
  const availableTopics = useMemo(() => {
    const s = new Set<string>();
    groups.forEach(g => g.problem.topics.forEach(t => s.add(t)));
    return [...s].sort();
  }, [groups]);

  // Apply global search + query builder before passing to table
  const filteredGroups = useMemo(() => {
    let result = groups;
    if (globalFilter) {
      const q = globalFilter.toLowerCase();
      result = result.filter(g =>
        g.problem.title.toLowerCase().includes(q) ||
        String(g.problem.leetcode_id).startsWith(q)
      );
    }
    if (queryGroup.rules.length > 0) {
      result = result.filter(g => evaluateGroup(queryGroup, g));
    }
    return result;
  }, [groups, globalFilter, queryGroup]);

  const table = useReactTable({
    data: filteredGroups,
    columns: COLUMNS,
    state: { sorting, pagination: { pageIndex, pageSize } },
    onSortingChange: (u) => { setSorting(u); setPageIndex(0); },
    onPaginationChange: (u) => {
      const next = typeof u === "function" ? u({ pageIndex, pageSize }) : u;
      setPageIndex(next.pageIndex);
      setPageSize(next.pageSize);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: false,
  });

  function handleSuccess(solved?: SearchResult) {
    // Instantly check off the matching to-do so the list updates without a refetch wait.
    if (solved) {
      queryClient.setQueryData<TodoItem[]>(["leetcode", "todo"], (old = []) =>
        old.map(t => t.problem.leetcode_id === solved.leetcode_id ? { ...t, done: true } : t));
    }
    queryClient.invalidateQueries({ queryKey: ["leetcode"] });
    modalRef.current?.close();
  }

  function exportSolves() {
    const data = groups.map(g => ({
      leetcode_id: g.problem.leetcode_id,
      title: g.problem.title,
      slug: g.problem.slug,
      difficulty: g.problem.difficulty,
      topics: g.problem.topics,
      solves: g.solves.map(s => ({
        language: s.language,
        time_complexity: s.time_complexity,
        space_complexity: s.space_complexity,
        confidence: s.confidence,
        notes: s.notes,
        code: s.code,
        solved_at: s.solved_at,
        is_imported: s.is_imported,
      })),
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shepherd-leetcode-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const { mutate: importSolves, isPending: importing } = useMutation<
    { imported: number; updated: number }, Error, File
  >({
    mutationFn: async (file) => {
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch {
        throw new Error("That file isn't valid JSON");
      }
      if (!Array.isArray(data)) throw new Error("Unrecognized export format");
      const r = await authFetch(`${API_URL}/api/leetcode/import-json`, token!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problems: data }),
      });
      if (!r.ok) throw new Error((await r.json()).detail ?? "Import failed");
      return r.json();
    },
    onSuccess: ({ imported, updated }) => {
      queryClient.invalidateQueries({ queryKey: ["leetcode"] });
      toast.success(`Imported ${imported} new solve${imported === 1 ? "" : "s"}, updated ${updated}`);
    },
    onError: (err) => toast.error(err.message),
  });

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) importSolves(file);
    e.target.value = "";
  }

  const { mutate: clearAllSolves, isPending: clearing } = useMutation<void, Error>({
    mutationFn: async () => {
      const r = await authFetch(`${API_URL}/api/leetcode/solves`, token!, { method: "DELETE" });
      if (!r.ok && r.status !== 204) throw new Error((await r.json()).detail ?? "Failed to clear solves");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leetcode"] });
      toast.success("All solves cleared");
      clearModalRef.current?.close();
    },
    onError: (err) => toast.error(err.message),
  });

  const activeRuleCount = useMemo(() => countRules(queryGroup), [queryGroup]);
  const filtersActive   = globalFilter !== "" || queryGroup.rules.length > 0;
  const visibleCount    = filteredGroups.length;
  const pageCount       = table.getPageCount();

  const total  = stats?.total ?? 0;
  const easy   = stats?.difficulty_breakdown?.easy   ?? 0;
  const medium = stats?.difficulty_breakdown?.medium ?? 0;
  const hard   = stats?.difficulty_breakdown?.hard   ?? 0;

  const currentSortId   = sorting[0]?.id ?? "lastSolved";
  const currentSortDesc = sorting[0]?.desc ?? true;

  function clearFilters() {
    setGlobalFilter("");
    setQueryGroup({ id: "root", combinator: "and", rules: [] });
    setPageIndex(0);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-8 py-10 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg p-1.5" style={{ backgroundColor: "color-mix(in srgb, var(--game-accent) 20%, transparent)" }}>
            <Code2 size={16} style={{ color: "var(--game-accent)" }} />
          </div>
          <h2 className="text-xl font-black text-base-content">LeetCode</h2>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportFile}
            className="hidden"
          />
          {/* Utility actions (overflow menu) */}
          <div className="dropdown dropdown-end">
            <div tabIndex={0} role="button"
              className="btn btn-sm btn-ghost border border-base-300 text-base-content/50 px-2"
              title="More actions">
              {importing ? <Loader2 size={15} className="animate-spin" /> : <MoreHorizontal size={15} />}
            </div>
            <ul tabIndex={0} className="dropdown-content menu menu-sm z-10 mt-1 w-44 rounded-xl bg-base-100 border border-base-300 p-1.5 shadow-lg">
              <li>
                <button onClick={() => fileInputRef.current?.click()} disabled={importing} className="font-bold gap-2">
                  <Upload size={14} /> Import JSON
                </button>
              </li>
              {groups.length > 0 && (
                <li>
                  <button onClick={exportSolves} className="font-bold gap-2">
                    <Download size={14} /> Export JSON
                  </button>
                </li>
              )}
              {groups.length > 0 && (
                <li>
                  <button onClick={() => clearModalRef.current?.showModal()} className="font-bold gap-2 text-error hover:bg-error/10">
                    <Trash2 size={14} /> Clear all
                  </button>
                </li>
              )}
            </ul>
          </div>
          <button onClick={() => openLog(null)}
            className="btn btn-sm gap-2 font-black text-white border-none"
            style={{ backgroundColor: "var(--game-accent)", boxShadow: "0 4px 0 color-mix(in srgb, var(--game-accent) 50%, #000)" }}>
            <Plus size={14} />
            Log Solve
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {total > 0 && (
        <div className="atmos-accent card-rise rounded-2xl border-2 border-base-300 px-6 py-5 flex items-center gap-6"
          style={{ boxShadow: "0 4px 0 rgba(0,0,0,0.08)" }}>
          {/* Hero total */}
          <div className="flex flex-col shrink-0">
            <span className="font-black text-4xl leading-none" style={{ color: "var(--game-accent)" }}>{total}</span>
            <span className="mt-1.5 text-[10px] font-black uppercase tracking-wider text-base-content/40">Solved</span>
          </div>

          <div className="h-12 w-px bg-base-300 shrink-0" />

          {/* Difficulty breakdown + proportion bar */}
          <div className="flex-1 flex flex-col gap-3 min-w-0">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Easy",   count: easy,   diff: "easy"   },
                { label: "Medium", count: medium, diff: "medium" },
                { label: "Hard",   count: hard,   diff: "hard"   },
              ].map(({ label, count, diff }) => (
                <div key={diff} className="flex items-center gap-2 min-w-0">
                  <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: DIFF_COLORS[diff].text }} />
                  <span className="font-black text-lg leading-none" style={{ color: DIFF_COLORS[diff].text }}>{count}</span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-base-content/35 truncate">{label}</span>
                </div>
              ))}
            </div>
            {/* Segmented proportion bar */}
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-base-300">
              {[
                { count: easy,   diff: "easy"   },
                { count: medium, diff: "medium" },
                { count: hard,   diff: "hard"   },
              ].map(({ count, diff }) => (
                count > 0 ? (
                  <div key={diff} style={{ width: `${(count / total) * 100}%`, backgroundColor: DIFF_COLORS[diff].text }} />
                ) : null
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Log Solve modal */}
      <dialog ref={modalRef} className="modal">
        <div className="modal-box w-[56rem] max-w-[95vw] h-[80vh] min-w-[24rem] min-h-[24rem] max-h-[92vh] p-0 flex flex-col resize overflow-auto">
          <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
            <p className="font-black text-sm text-base-content">Log a Solve</p>
            <button type="button" onClick={() => modalRef.current?.close()} className="text-base-content/30 hover:text-base-content/60 transition-colors">
              <X size={15} />
            </button>
          </div>
          <div className="overflow-y-auto min-h-0 flex-1 px-6 pb-6">
            {token && <LogSolveForm key={logInitial?.leetcode_id ?? "blank"} token={token} onSuccess={handleSuccess} initial={logInitial} />}
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      {/* Clear Solves confirm modal */}
      <dialog ref={clearModalRef} className="modal">
        <div className="modal-box max-w-md">
          <p className="font-black text-sm text-base-content mb-2">Clear all solves?</p>
          <p className="text-sm text-base-content/60 mb-6">
            This will permanently delete all {total} logged solve{total === 1 ? "" : "s"} across {groups.length} problem{groups.length === 1 ? "" : "s"}. This cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => clearModalRef.current?.close()} className="btn btn-ghost font-black">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => clearAllSolves()}
              disabled={clearing}
              className="btn btn-error font-black gap-2 text-white"
            >
              {clearing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {clearing ? "Clearing…" : "Delete All"}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      {/* Tab strip: Review vs Library */}
      <div className="flex items-center gap-1 border-b border-base-300">
        {([
          // Show what's left of today's goal, not the raw backlog wall.
          { id: "review",   label: "Review",   badge: Math.min(dueItems.length, Math.max(0, reviewGoal - (reviewStats?.done_today ?? 0))) },
          { id: "library",  label: "Library",  badge: 0 },
          { id: "todo",     label: "To Do",    badge: todos.filter(t => !t.done).length },
          { id: "insights", label: "Insights", badge: 0 },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-black transition-colors -mb-px border-b-2 ${
              tab === t.id
                ? "border-[var(--game-accent)] text-base-content"
                : "border-transparent text-base-content/40 hover:text-base-content/70"
            }`}
          >
            {t.id === "review" && <Brain size={14} />}
            {t.id === "todo" && <ListTodo size={14} />}
            {t.id === "insights" && <BarChart3 size={14} />}
            {t.label}
            {t.badge > 0 && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                style={{ color: "#fff", backgroundColor: "var(--game-accent)" }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "review" ? (
        <ReviewQueue
          items={dueItems}
          isLoading={dueLoading}
          token={token!}
          stats={reviewStats}
          goal={reviewGoal}
          onGoalChange={setReviewGoal}
          includeImported={includeImported}
          onToggleImported={setIncludeImported}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ["leetcode"] })}
        />
      ) : tab === "insights" ? (
        <InsightsTab groups={groups} token={token!} />
      ) : tab === "todo" ? (
        <TodoTab token={token!} todos={todos} isLoading={todosLoading} onLogProblem={openLog} />
      ) : (
        <>
      {/* Filter + Sort bar */}
      {groups.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            {/* Global search */}
            <div className="relative flex-1 min-w-[180px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/30 pointer-events-none" />
              <input
                value={globalFilter}
                onChange={e => { setGlobalFilter(e.target.value); setPageIndex(0); }}
                placeholder="Search title or #…"
                className="input input-bordered input-sm w-full pl-9"
              />
            </div>

            {/* Filters toggle button */}
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`btn btn-sm gap-1.5 font-bold ${
                showFilters || activeRuleCount > 0
                  ? "btn-primary"
                  : "btn-ghost border border-base-300"
              }`}
            >
              <SlidersHorizontal size={13} />
              Filters
              {activeRuleCount > 0 && (
                <span className="badge badge-xs badge-neutral font-black">{activeRuleCount}</span>
              )}
            </button>

            {/* Divider */}
            <div className="h-5 w-px bg-base-300 hidden sm:block" />

            {/* Sort column */}
            <select
              value={currentSortId}
              onChange={e => setSorting([{ id: e.target.value, desc: currentSortDesc }])}
              className="select select-bordered select-sm"
            >
              {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>

            {/* Sort direction */}
            <button
              onClick={() => setSorting([{ id: currentSortId, desc: !currentSortDesc }])}
              className="btn btn-sm btn-ghost p-2 text-base-content/50 hover:text-base-content"
              title={currentSortDesc ? "Descending" : "Ascending"}
            >
              {currentSortDesc ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
            </button>

            {/* Per-page chooser */}
            <div className="h-5 w-px bg-base-300 hidden sm:block" />
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPageIndex(0); }}
              className="select select-bordered select-sm"
            >
              {[10, 25, 50, 100].map(n => (
                <option key={n} value={n}>{n} / page</option>
              ))}
            </select>

            {/* Result count + clear */}
            {filtersActive && (
              <>
                <span className="text-xs font-semibold text-base-content/35 hidden sm:block">
                  {visibleCount} of {groups.length}
                </span>
                <button
                  onClick={clearFilters}
                  className="btn btn-sm btn-ghost gap-1 text-base-content/40 hover:text-base-content/70"
                >
                  <X size={12} />
                  Clear
                </button>
              </>
            )}
          </div>

          {/* Collapsible query builder panel */}
          {showFilters && (
            <div className="rounded-2xl bg-base-200 border border-base-300 p-4">
              <QueryBuilderGroup
                group={queryGroup}
                onChange={setQueryGroup}
                depth={0}
                availableLanguages={availableLanguages}
                availableTopics={availableTopics}
              />
            </div>
          )}
        </>
      )}

      {/* Solve groups */}
      <section className="flex flex-col gap-3">
        {isLoading ? (
          <p className="text-sm font-bold text-base-content/30 text-center py-10">Loading…</p>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-14 text-base-content/25">
            <Code2 size={40} />
            <div className="flex flex-col items-center gap-1">
              <p className="font-black text-sm">No solves yet</p>
              <p className="text-xs font-semibold">Log your first solve to start earning XP.</p>
            </div>
          </div>
        ) : visibleCount === 0 ? (
          <p className="text-sm font-bold text-base-content/30 text-center py-10">No problems match your filters.</p>
        ) : (
          table.getRowModel().rows.map((row, i) => (
            <SolveGroupCard
              key={row.original.problem.leetcode_id}
              group={row.original}
              index={i}
              token={token!}
              onUpdated={() => queryClient.invalidateQueries({ queryKey: ["leetcode"] })}
              availableTopics={availableTopics}
            />
          ))
        )}
      </section>

      {/* Pagination controls */}
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPageIndex(0)}
            disabled={pageIndex === 0}
            className="btn btn-xs btn-ghost font-black disabled:opacity-30"
          >«</button>
          <button
            onClick={() => setPageIndex(i => i - 1)}
            disabled={pageIndex === 0}
            className="btn btn-xs btn-ghost font-black disabled:opacity-30"
          >‹</button>

          {Array.from({ length: pageCount }, (_, i) => i)
            .filter(i => Math.abs(i - pageIndex) <= 2 || i === 0 || i === pageCount - 1)
            .reduce<(number | "…")[]>((acc, i, idx, arr) => {
              if (idx > 0 && i - (arr[idx - 1] as number) > 1) acc.push("…");
              acc.push(i);
              return acc;
            }, [])
            .map((item, i) =>
              item === "…" ? (
                <span key={`ellipsis-${i}`} className="text-xs text-base-content/30 px-1">…</span>
              ) : (
                <button
                  key={item}
                  onClick={() => setPageIndex(item as number)}
                  className={`btn btn-xs font-black ${pageIndex === item ? "btn-primary" : "btn-ghost"}`}
                >
                  {(item as number) + 1}
                </button>
              )
            )}

          <button
            onClick={() => setPageIndex(i => i + 1)}
            disabled={pageIndex >= pageCount - 1}
            className="btn btn-xs btn-ghost font-black disabled:opacity-30"
          >›</button>
          <button
            onClick={() => setPageIndex(pageCount - 1)}
            disabled={pageIndex >= pageCount - 1}
            className="btn btn-xs btn-ghost font-black disabled:opacity-30"
          >»</button>
        </div>
      )}
        </>
      )}

    </div>
  );
}
