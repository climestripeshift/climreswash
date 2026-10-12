import type { ReactNode } from "react";

/**
 * Minimal, dependency-free Markdown for model answers: paragraphs, #-headings, bullet and numbered lists, bold, italic
 * and inline code. It builds React elements only (no innerHTML, no links, no images), so model text can never inject
 * markup. [F3]-style fact citations are rendered as small muted tags and are otherwise left untouched.
 */
const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\s][^*\n]*\*|\[F\d+(?:\s*,\s*F\d+)*\])/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).filter(p => p !== "").map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={i} className="rounded bg-muted px-1 text-[0.9em]">{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    if (/^\[F\d+/.test(part)) return <span key={i} className="text-[0.75em] text-muted-foreground align-baseline">{part}</span>;
    return <span key={i}>{part}</span>;
  });
}

export function parseBlocks(src: string): { kind: "p" | "ul" | "ol" | "h"; lines: string[]; level?: number }[] {
  const out: { kind: "p" | "ul" | "ol" | "h"; lines: string[]; level?: number }[] = [];
  let cur: { kind: "p" | "ul" | "ol"; lines: string[] } | null = null;
  const flush = () => { if (cur) out.push(cur); cur = null; };
  for (const raw of src.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { flush(); out.push({ kind: "h", lines: [h[2]], level: h[1].length }); continue; }
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const kind = ul ? "ul" : ol ? "ol" : "p";
    if (!cur || cur.kind !== kind) { flush(); cur = { kind, lines: [] }; }
    cur.lines.push(ul ? ul[1] : ol ? ol[1] : line.trim());
  }
  flush();
  return out;
}

export function SafeMarkdown({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} data-testid="markdown">
      {parseBlocks(text).map((b, i) => {
        if (b.kind === "h") return <p key={i} className="font-semibold">{inline(b.lines[0])}</p>;
        if (b.kind === "ul") return <ul key={i} className="list-disc pl-5 space-y-0.5">{b.lines.map((l, j) => <li key={j}>{inline(l)}</li>)}</ul>;
        if (b.kind === "ol") return <ol key={i} className="list-decimal pl-5 space-y-0.5">{b.lines.map((l, j) => <li key={j}>{inline(l)}</li>)}</ol>;
        return <p key={i}>{b.lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l)}</span>)}</p>;
      })}
    </div>
  );
}
