"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={handleCopy}
      className="shrink-0 p-1.5 rounded-lg transition-colors"
      style={{ color: copied ? "var(--game-accent)" : "rgba(var(--bc), 0.4)" }}
      title="Copy"
    >
      {copied ? <Check size={13} strokeWidth={3} /> : <Copy size={13} />}
    </button>
  );
}