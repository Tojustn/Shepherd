"use client";

import { useState, useEffect, useRef, useMemo } from "react";
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
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import {
  Code2, Search, Plus, ChevronDown, ChevronUp,
  X, Check, Loader2, Pencil, ArrowUp, ArrowDown, SlidersHorizontal, Trash2,
} from "lucide-react";

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
}

interface SolveGroup {
  problem: Problem;
  solves: Solve[]; // sorted oldest-first
}

// ── Query Builder Types ────────────────────────────────────────────────────

type Field    = "difficulty" | "language" | "confidence" | "topic" | "solveCount";
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
    g => new Date(g.solves[g.solves.length - 1]?.solved_at ?? 0).getTime(),
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

function LogSolveForm({ token, onSuccess }: { token: string; onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const [query,      setQuery]      = useState("");
  const [results,    setResults]    = useState<SearchResult[]>([]);
  const [searching,  setSearching]  = useState(false);
  const [selected,   setSelected]   = useState<SearchResult | null>(null);
  const [showDrop,   setShowDrop]   = useState(false);
  const [language,   setLanguage]   = useState("Python");
  const [timeC,      setTimeC]      = useState("");
  const [spaceC,     setSpaceC]     = useState("");
  const [notes,      setNotes]      = useState("");
  const [code,       setCode]       = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      onSuccess();
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

          <div className="flex flex-col gap-2">
            <label className="text-xs font-black text-base-content/40">Confidence <span className="font-normal opacity-60">(optional)</span></label>
            <div className="flex gap-2">
              {([1, 2, 3, 4, 5] as const).map(n => {
                const cl = CONFIDENCE_LABELS[n];
                const active = confidence === n;
                return (
                  <button key={n} type="button" onClick={() => setConfidence(active ? null : n)}
                    className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all text-[10px] font-black"
                    style={{
                      backgroundColor: active ? cl.color : "color-mix(in srgb, var(--color-base-content) 8%, transparent)",
                      color: active ? "#fff" : "color-mix(in srgb, var(--color-base-content) 45%, transparent)",
                    }}>
                    <span className="text-sm font-black">{n}</span>
                    <span className="uppercase tracking-wider leading-tight text-center">{cl.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-black text-base-content/40">Notes <span className="font-normal opacity-60">(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Key insight, approach, edge cases…" className="textarea textarea-bordered text-sm resize-none h-20 w-full" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-black text-base-content/40">Code</label>
            <textarea value={code} onChange={e => setCode(e.target.value)} placeholder="Paste your solution…" className="textarea textarea-bordered font-mono text-xs resize-none h-36 w-full" required />
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
};

function SolveAttempt({
  solve, attemptNumber, token,
}: {
  solve: Solve; attemptNumber: number; token: string; onUpdated: () => void;
}) {
  const { theme }   = useTheme();
  const queryClient = useQueryClient();
  const [expanded,  setExpanded]  = useState(false);
  const [editing,   setEditing]   = useState(false);
  const [editError, setEditError] = useState("");

  const [eLang,   setELang]   = useState(solve.language          ?? "Python");
  const [eTimeC,  setETimeC]  = useState(solve.time_complexity   ?? "");
  const [eSpaceC, setESpaceC] = useState(solve.space_complexity  ?? "");
  const [eConf,   setEConf]   = useState<number | null>(solve.confidence ?? null);
  const [eNotes,  setENotes]  = useState(solve.notes ?? "");
  const [eCode,   setECode]   = useState(solve.code  ?? "");

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
    setENotes(solve.notes ?? ""); setECode(solve.code ?? "");
    setEditError(""); setEditing(true); setExpanded(true);
  }

  function handleSave() {
    setEditError("");
    saveEdit({
      language: eLang || null,
      time_complexity: eTimeC || null,
      space_complexity: eSpaceC || null,
      confidence: eConf,
      notes: eNotes || null,
      code: eCode || null,
    });
  }

  return (
    <div className="border-t border-base-300/60">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <button
          onClick={() => !editing && hasDetails && setExpanded(v => !v)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <span className="text-[11px] font-black shrink-0" style={{ color: labelColor }}>{label}</span>
          <span className="text-[11px] font-semibold text-base-content/35 shrink-0">{timeAgo(solve.solved_at)}</span>
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

          <div className="flex flex-col gap-3">
            <label className="text-xs font-black text-base-content/40 uppercase tracking-wider">Confidence</label>
            <div className="flex gap-2">
              {([1, 2, 3, 4, 5] as const).map(n => {
                const cl = CONFIDENCE_LABELS[n]; const active = eConf === n;
                return (
                  <button key={n} type="button" onClick={() => setEConf(active ? null : n)}
                    className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all text-[10px] font-black"
                    style={{
                      backgroundColor: active ? cl.color : "color-mix(in srgb, var(--color-base-content) 8%, transparent)",
                      color: active ? "#fff" : "color-mix(in srgb, var(--color-base-content) 45%, transparent)",
                    }}>
                    <span className="text-sm font-black">{n}</span>
                    <span className="uppercase tracking-wider leading-tight text-center">{cl.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-black text-base-content/40 uppercase tracking-wider">Notes</label>
            <textarea value={eNotes} onChange={e => setENotes(e.target.value)} placeholder="Key insight, approach, edge cases…" className="textarea textarea-bordered text-sm resize-y w-full" rows={6} />
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
              <p className="text-xs text-base-content/70 leading-relaxed whitespace-pre-wrap">{solve.notes}</p>
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

function QuickSolveForm({ problem, token, onSuccess, onCancel }: {
  problem: Problem; token: string; onSuccess: () => void; onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [language,   setLanguage]   = useState("Python");
  const [timeC,      setTimeC]      = useState("");
  const [spaceC,     setSpaceC]     = useState("");
  const [notes,      setNotes]      = useState("");
  const [code,       setCode]       = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);

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

      <div className="flex flex-col gap-2">
        <label className="text-xs font-black text-base-content/40">Confidence <span className="font-normal opacity-60">(optional)</span></label>
        <div className="flex gap-2">
          {([1, 2, 3, 4, 5] as const).map(n => {
            const cl = CONFIDENCE_LABELS[n]; const active = confidence === n;
            return (
              <button key={n} type="button" onClick={() => setConfidence(active ? null : n)}
                className="flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-xl transition-all text-[10px] font-black"
                style={{
                  backgroundColor: active ? cl.color : "color-mix(in srgb, var(--color-base-content) 8%, transparent)",
                  color: active ? "#fff" : "color-mix(in srgb, var(--color-base-content) 45%, transparent)",
                }}>
                <span className="text-sm font-black">{n}</span>
                <span className="uppercase tracking-wider leading-tight text-center">{cl.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-black text-base-content/40">Notes <span className="font-normal opacity-60">(optional)</span></label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Key insight, approach, edge cases…" className="textarea textarea-bordered text-sm resize-none h-20 w-full" />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-black text-base-content/40">Code</label>
        <textarea value={code} onChange={e => setCode(e.target.value)} placeholder="Paste your solution…" className="textarea textarea-bordered font-mono text-xs resize-none h-36 w-full" required />
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

// ── SolveGroupCard ─────────────────────────────────────────────────────────

function SolveGroupCard({
  group, token, onUpdated,
}: {
  group: SolveGroup; token: string; onUpdated: () => void;
}) {
  const [expanded,      setExpanded]      = useState(false);
  const [addingResolve, setAddingResolve] = useState(false);

  const diff            = group.problem.difficulty.toLowerCase();
  const xp              = DIFF_XP[diff] ?? 20;
  const mostRecent      = group.solves[group.solves.length - 1];
  const solveCount      = group.solves.length;
  const confSolve       = [...group.solves].reverse().find(s => s.confidence != null);
  const latestConf      = confSolve?.confidence != null ? CONFIDENCE_LABELS[confSolve.confidence] : null;
  const usedLangs       = [...new Set(group.solves.map(s => s.language).filter(Boolean) as string[])];

  return (
    <div className="rounded-2xl bg-base-100 border-2 border-base-300 overflow-hidden"
      style={{ boxShadow: "0 4px 0 rgba(0,0,0,0.08)" }}>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <span className="font-mono text-xs text-base-content/30 shrink-0 w-10">{group.problem.leetcode_id}.</span>
          <span className="flex-1 font-black text-sm text-base-content truncate min-w-0">{group.problem.title}</span>
        </button>

        <DiffBadge difficulty={group.problem.difficulty} />

        {usedLangs.length > 0 && (
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            {usedLangs.map(lang => (
              <span key={lang} className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ color: langColor(lang), backgroundColor: `${langColor(lang)}20`, border: `1px solid ${langColor(lang)}44` }}>
                {lang}
              </span>
            ))}
          </div>
        )}

        {latestConf && (
          <span className="hidden sm:block text-[10px] font-black px-2 py-0.5 rounded-full shrink-0"
            style={{ color: latestConf.color, backgroundColor: `${latestConf.color}20` }}>
            {confSolve!.confidence} — {latestConf.label}
          </span>
        )}

        <span className="font-black text-xs shrink-0" style={{ color: "var(--game-accent)" }}>+{xp} XP</span>

        {solveCount > 1 && (
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-base-300 text-base-content/50 shrink-0">
            {solveCount}×
          </span>
        )}

        <button onClick={() => setExpanded(v => !v)} className="shrink-0 text-base-content/30">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {group.problem.topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          {group.problem.topics.map(t => (
            <span key={t} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-base-200 text-base-content/45">{t}</span>
          ))}
        </div>
      )}

      {expanded && (
        <div className="border-t border-base-300">
          {group.solves.map((solve, idx) => (
            <SolveAttempt key={solve.id} solve={solve} attemptNumber={idx + 1} token={token} onUpdated={onUpdated} />
          ))}

          {addingResolve ? (
            <QuickSolveForm
              problem={group.problem}
              token={token}
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

// ── Page ──────────────────────────────────────────────────────────────────

export default function LeetCodePage() {
  const { token }   = useAuth();
  const queryClient = useQueryClient();
  const modalRef    = useRef<HTMLDialogElement>(null);

  // Filter / sort state
  const [globalFilter, setGlobalFilter] = useState("");
  const [queryGroup,   setQueryGroup]   = useState<FilterGroup>({ id: "root", combinator: "and", rules: [] });
  const [showFilters,  setShowFilters]  = useState(false);
  const [sorting,      setSorting]      = useState<SortingState>([{ id: "lastSolved", desc: true }]);

  const { data: solves = [], isLoading } = useQuery<Solve[]>({
    queryKey: ["leetcode", "solves"],
    queryFn:  () => authFetch(`${API_URL}/api/leetcode/solves`, token!).then(r => r.json()),
    enabled:  !!token,
  });

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
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  function handleSuccess() {
    queryClient.invalidateQueries({ queryKey: ["leetcode"] });
    modalRef.current?.close();
  }

  const activeRuleCount = useMemo(() => countRules(queryGroup), [queryGroup]);
  const filtersActive   = globalFilter !== "" || queryGroup.rules.length > 0;
  const visibleCount    = table.getRowModel().rows.length;

  const total  = stats?.total ?? 0;
  const easy   = stats?.difficulty_breakdown?.easy   ?? 0;
  const medium = stats?.difficulty_breakdown?.medium ?? 0;
  const hard   = stats?.difficulty_breakdown?.hard   ?? 0;

  const currentSortId   = sorting[0]?.id ?? "lastSolved";
  const currentSortDesc = sorting[0]?.desc ?? true;

  function clearFilters() {
    setGlobalFilter("");
    setQueryGroup({ id: "root", combinator: "and", rules: [] });
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-8 py-10 flex flex-col gap-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg p-1.5" style={{ backgroundColor: "color-mix(in srgb, var(--game-accent) 20%, transparent)" }}>
            <Code2 size={16} style={{ color: "var(--game-accent)" }} />
          </div>
          <h2 className="text-xl font-black text-base-content">LeetCode</h2>
        </div>
        <button onClick={() => modalRef.current?.showModal()}
          className="btn btn-sm gap-2 font-black text-white border-none"
          style={{ backgroundColor: "var(--game-accent)", boxShadow: "0 4px 0 color-mix(in srgb, var(--game-accent) 50%, #000)" }}>
          <Plus size={14} />
          Log Solve
        </button>
      </div>

      {/* Stats bar */}
      {total > 0 && (
        <div className="rounded-2xl bg-base-100 border-2 border-base-300 px-5 py-4 grid grid-cols-4 gap-4"
          style={{ boxShadow: "0 4px 0 rgba(0,0,0,0.08)" }}>
          <div className="flex flex-col items-center gap-1">
            <span className="font-black text-2xl text-base-content">{total}</span>
            <span className="text-[10px] font-black uppercase tracking-wider text-base-content/40">Total</span>
          </div>
          {[
            { label: "Easy",   count: easy,   diff: "easy"   },
            { label: "Medium", count: medium, diff: "medium" },
            { label: "Hard",   count: hard,   diff: "hard"   },
          ].map(({ label, count, diff }) => (
            <div key={diff} className="flex flex-col items-center gap-1">
              <span className="font-black text-2xl" style={{ color: DIFF_COLORS[diff].text }}>{count}</span>
              <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: DIFF_COLORS[diff].text, opacity: 0.7 }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Log Solve modal */}
      <dialog ref={modalRef} className="modal">
        <div className="modal-box w-full max-w-2xl p-0 flex flex-col">
          <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
            <p className="font-black text-sm text-base-content">Log a Solve</p>
            <button type="button" onClick={() => modalRef.current?.close()} className="text-base-content/30 hover:text-base-content/60 transition-colors">
              <X size={15} />
            </button>
          </div>
          <div className="overflow-y-auto min-h-0 px-6 pb-6">
            {token && <LogSolveForm token={token} onSuccess={handleSuccess} />}
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      {/* Filter + Sort bar */}
      {groups.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            {/* Global search */}
            <div className="relative flex-1 min-w-[180px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/30 pointer-events-none" />
              <input
                value={globalFilter}
                onChange={e => setGlobalFilter(e.target.value)}
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
          table.getRowModel().rows.map(row => (
            <SolveGroupCard
              key={row.original.problem.leetcode_id}
              group={row.original}
              token={token!}
              onUpdated={() => queryClient.invalidateQueries({ queryKey: ["leetcode"] })}
            />
          ))
        )}
      </section>

    </div>
  );
}
