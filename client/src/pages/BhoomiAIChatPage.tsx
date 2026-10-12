import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowLeft, FlaskConical, Loader2, Send, ThumbsDown, ThumbsUp, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SafeMarkdown } from "@/components/SafeMarkdown";
import {
  BhoomiAiError, STATUS_LABEL, answerBasis, getStatus, safeAppLink, sendFeedback, sendMessage,
  type BhoomiModelInfo, type BhoomiReply, type BhoomiStatus, type ModelId,
} from "@/lib/bhoomiAi";

type Cell = { reply?: BhoomiReply; error?: string; rated?: "up" | "down"; pending?: boolean };
type Msg =
  | { role: "user"; text: string }
  | { role: "assistant"; model: ModelId; cell: Cell }
  | { role: "compare"; question: string; cells: Record<ModelId, Cell> };

const SUGGESTIONS = [
  "What is the overall hazard index of Kota?",
  "Compare historical rainfall variability for Jaipur and Jodhpur.",
  "Which three Rajasthan districts have the highest drought screening index?",
  "Show monsoon indicators for Jaisalmer in 2009.",
  "Give me all the WASH survey indicators for Jaipur.",
];

const FALLBACK_MODELS: BhoomiModelInfo[] = [
  { id: "qwen25", label: "Qwen2.5-3B (stable local agent)", experimental: false, enabled: true, upstream_ok: false },
  { id: "bhoomi_v1", label: "Bhoomi-LLM v1 (experimental fine-tune)", experimental: true, enabled: false, upstream_ok: false },
];

const UNAVAILABLE_EXPLAIN: Record<string, string> = {
  no_evidence: "No tool result could support an answer, so none is given. Nothing was estimated or guessed.",
  unsupported: "This kind of question is outside what the data and tools can support (for example predictions, causes or village-level results).",
  clarification: "More detail is needed before any tool can be run.",
  tool_failure: "The model could not produce a valid tool call, so no data was retrieved.",
  model_error: "The language model could not be reached.",
  resource_limit: "The machine is low on memory; try again shortly.",
  invalid: "The request was not valid.",
};

function ExperimentalChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-amber-500/60 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
      <FlaskConical className="h-3 w-3" />EXPERIMENTAL · not approved for deployment
    </span>
  );
}

export function AssistantCard({ reply, error, rated, pending, modelId, onRate }: {
  reply?: BhoomiReply; error?: string; rated?: "up" | "down"; pending?: boolean; modelId: ModelId; onRate: (r: "up" | "down") => void;
}) {
  if (pending) return <div className="rounded-lg border px-3 py-3 text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-1" />Working… a local model can take up to a minute.</div>;
  if (error || !reply) return <div className="rounded border border-destructive/50 px-3 py-2 text-sm text-destructive" role="alert">{error ?? "No reply."}</div>;
  const experimental = reply.model?.experimental === true || modelId === "bhoomi_v1";
  const basis = answerBasis(reply);
  const explain = UNAVAILABLE_EXPLAIN[reply.status];
  const issues = reply.verification?.violations ?? [];
  return (
    <div className="rounded-lg border px-3 py-3 space-y-2" data-testid="assistant-msg" data-model={modelId}>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={reply.status === "verified" ? "default" : "secondary"}>{STATUS_LABEL[reply.status] ?? reply.status}</Badge>
        <Badge variant="outline" data-testid="model-name">{reply.model?.name ?? "unknown model"}</Badge>
        {experimental && <ExperimentalChip />}
        {reply.repaired && <span className="text-xs text-muted-foreground">rewritten once after verification</span>}
        {reply.latency_s !== undefined && <span className="text-xs text-muted-foreground">{reply.latency_s.toFixed(0)} s</span>}
      </div>

      <SafeMarkdown text={reply.answer} className="text-sm" />

      {explain && (
        <div className="flex gap-2 rounded border border-amber-500/40 bg-amber-500/5 px-2 py-1.5 text-xs" role="status">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" /><span>{explain}</span>
        </div>
      )}
      {basis.unavailable.length > 0 && (
        <div className="rounded border border-amber-500/40 bg-amber-500/5 px-2 py-1.5 text-xs" data-testid="unavailable">
          <p className="font-medium">Data not available or not usable:</p>
          <ul className="list-disc pl-5">{basis.unavailable.map(u => <li key={u}>{u}</li>)}</ul>
        </div>
      )}

      {(basis.places.length > 0 || basis.indicators.length > 0 || basis.periods.length > 0) && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded bg-muted/50 px-2 py-1.5 text-xs" data-testid="answer-basis">
          {basis.places.length > 0 && (<><dt className="text-muted-foreground">Place</dt><dd>{basis.places.join(" · ")}</dd></>)}
          {basis.indicators.length > 0 && (<><dt className="text-muted-foreground">Looked up</dt><dd>{basis.indicators.join(" · ")}</dd></>)}
          {basis.periods.length > 0 && (<><dt className="text-muted-foreground">Period</dt><dd>{basis.periods.join(" · ")}</dd></>)}
          <dt className="text-muted-foreground">Check</dt>
          <dd>{basis.verified
            ? "Every figure was checked against the tool results."
            : issues.length ? `Verification flagged ${issues.length} issue(s); only verified tool results are shown.` : "Not a figure-bearing answer."}</dd>
        </dl>
      )}

      {(reply.notes ?? []).length > 0 && (
        <p className="text-xs text-muted-foreground">Filters taken from your question: {reply.notes!.join("; ")}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {(reply.links ?? []).map(safeAppLink).filter((l): l is string => !!l).map(l => (
          <Link key={l} href={l}><Button size="sm" variant="outline">Open in ClimResWASH</Button></Link>
        ))}
      </div>
      {reply.evidence && (
        <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Evidence, sources and limitations</summary>
          <pre className="whitespace-pre-wrap mt-1 rounded bg-muted p-2">{reply.evidence}</pre></details>
      )}
      {(reply.tool_trace ?? []).length > 0 && (
        <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Tool calls chosen by the model</summary>
          <pre className="whitespace-pre-wrap mt-1 rounded bg-muted p-2">{reply.tool_trace!.map(s =>
            `step ${s.step}: ` + (s.calls.length ? s.calls.map(c => `${c.name}(${JSON.stringify(c.arguments)}) → ${c.status ?? (c.errors ? "invalid" : "?")}`).join(" | ") : "answer drafted")).join("\n")}</pre></details>
      )}
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" aria-label="Helpful" disabled={!!rated} onClick={() => onRate("up")}><ThumbsUp className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label="Not helpful" disabled={!!rated} onClick={() => onRate("down")}><ThumbsDown className="h-4 w-4" /></Button>
        {rated && <span className="text-xs text-muted-foreground">Recorded as feedback only; not used for training or benchmarks without expert review.</span>}
      </div>
    </div>
  );
}

export default function BhoomiAIChatPage() {
  const [status, setStatus] = useState<BhoomiStatus | null | undefined>(undefined);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<ModelId>("qwen25");
  const [compare, setCompare] = useState(false);
  const [sessions, setSessions] = useState<Partial<Record<ModelId, string>>>({});
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getStatus().then(setStatus).catch(() => setStatus({ enabled: true, upstream_ok: false }));
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const models = status?.models ?? FALLBACK_MODELS;
  const info = (id: ModelId) => models.find(m => m.id === id) ?? FALLBACK_MODELS.find(m => m.id === id)!;
  const usable = (id: ModelId) => info(id).enabled && info(id).upstream_ok;
  const expUsable = usable("bhoomi_v1");
  const selected = info(model);
  const comparing = compare && expUsable && usable("qwen25");

  async function ask(q: string, id: ModelId, sid: string | undefined): Promise<Cell & { session?: string }> {
    try {
      const reply = await sendMessage(q, sid, fetch, id);
      return { reply, session: reply.session_id };
    } catch (e) {
      const err = e as BhoomiAiError;
      return { error: err.message + (err.hint ? ` — ${err.hint}` : "") };
    }
  }

  async function send(q: string) {
    const message = q.trim();
    if (!message || busy) return;
    setText("");
    setBusy(true);
    setMsgs(m => [...m, { role: "user", text: message }]);
    try {
      if (comparing) {
        const ids: ModelId[] = ["qwen25", "bhoomi_v1"];
        const cells: Record<ModelId, Cell> = { qwen25: { pending: true }, bhoomi_v1: { pending: true } };
        setMsgs(m => [...m, { role: "compare", question: message, cells: { ...cells } }]);
        let sess = { ...sessions };
        for (const id of ids) {                       // sequential on purpose: one model in memory at a time on an 8 GB machine
          const r = await ask(message, id, sess[id]);
          if (r.session) sess = { ...sess, [id]: r.session };
          cells[id] = { reply: r.reply, error: r.error };
          setMsgs(m => m.map((x, i) => (i === m.length - 1 && x.role === "compare" ? { ...x, cells: { ...cells } } : x)));
        }
        setSessions(sess);
      } else {
        const r = await ask(message, model, sessions[model]);
        if (r.session) setSessions(s => ({ ...s, [model]: r.session }));
        setMsgs(m => [...m, { role: "assistant", model, cell: { reply: r.reply, error: r.error } }]);
      }
    } finally {
      setBusy(false);
    }
  }

  async function rate(i: number, id: ModelId, r: "up" | "down") {
    const m = msgs[i];
    const cell = m.role === "assistant" ? m.cell : m.role === "compare" ? m.cells[id] : undefined;
    if (!cell?.reply || cell.rated) return;
    try {
      await sendFeedback(cell.reply.interaction_id, r, fetch, id);
      setMsgs(all => all.map((x, j) => {
        if (j !== i) return x;
        if (x.role === "assistant") return { ...x, cell: { ...x.cell, rated: r } };
        if (x.role === "compare") return { ...x, cells: { ...x.cells, [id]: { ...x.cells[id], rated: r } } };
        return x;
      }));
    } catch { /* feedback is best-effort */ }
  }

  const reset = () => { setMsgs([]); setSessions({}); };
  const showExperimentalBanner = model === "bhoomi_v1" || comparing;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col" data-testid="bhoomi-ai-chat">
      <header className="border-b px-4 py-3 space-y-2">
        <div className="flex items-center gap-3">
          <Link href="/"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Home</Button></Link>
          <div className="flex-1">
            <h1 className="text-base font-semibold">Bhoomi AI <span className="text-xs font-normal text-muted-foreground">development preview</span></h1>
            <p className="text-xs text-muted-foreground">
              Answers use ClimResWASH tools and are verified before display. Risk values are screening indices, not probabilities.
            </p>
          </div>
          {selected.model && <Badge variant="outline" data-testid="serving-model">{selected.model}</Badge>}
          <Button variant="ghost" size="sm" onClick={reset} disabled={busy || msgs.length === 0}><RotateCcw className="h-4 w-4 mr-1" />New</Button>
          <ThemeToggle />
        </div>
        {status?.models && (
          <div className="flex items-center gap-2 flex-wrap text-xs" role="radiogroup" aria-label="Language model">
            <span className="text-muted-foreground">Model:</span>
            {models.map(m => (
              <button key={m.id} role="radio" aria-checked={model === m.id} disabled={busy || !m.enabled}
                title={!m.enabled ? "Not enabled in this session. Start with: bash scripts/dev-bhoomi-ai.sh up --experimental"
                  : !m.upstream_ok ? "Enabled but not reachable (still loading, or stopped)" : undefined}
                onClick={() => setModel(m.id)}
                className={`rounded border px-2 py-1 disabled:opacity-50 ${model === m.id ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"}`}>
                {m.label}{m.experimental ? " · experimental" : ""}{m.enabled && !m.upstream_ok ? " (not reachable)" : ""}
              </button>
            ))}
            <label className={`ml-2 flex items-center gap-1 ${expUsable ? "" : "opacity-50"}`}>
              <input type="checkbox" checked={compare} disabled={busy || !expUsable} onChange={e => setCompare(e.target.checked)} />
              Ask both and compare
            </label>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-4 space-y-3">
        {showExperimentalBanner && (
          <div className="rounded border border-amber-500/50 bg-amber-500/5 p-3 text-xs space-y-1" role="note" data-testid="experimental-banner">
            <p className="font-medium flex items-center gap-1"><FlaskConical className="h-4 w-4" />Experimental model: Bhoomi-LLM v1 (Qwen3-4B-Instruct-2507 + LoRA checkpoint-160)</p>
            <p>
              Trained only on synthetic, machine-verified examples; no expert has reviewed them and it is <b>not approved for deployment</b>.
              It uses the same scientific tools, prompts and verifier as the stable model, runs locally in a quantized form that has not been
              separately validated, and its answers should be treated as exploratory. Chats are logged as development interactions and are
              never used as benchmark or training data.
            </p>
          </div>
        )}
        {status === undefined && <p className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-1" />Checking service…</p>}
        {status === null && (
          <div className="rounded border p-4 text-sm" role="status">
            Bhoomi AI chat is disabled. Enable it for local development with <code>BHOOMI_AI_ENABLED=1</code> (server) and <code>VITE_BHOOMI_AI_CHAT=1</code> (client).
          </div>
        )}
        {status && !usable(model) && (
          <div className="rounded border border-amber-500/50 p-4 text-sm" role="status">
            {model === "bhoomi_v1"
              ? <>The experimental model is not reachable. Start it with <code>bash scripts/dev-bhoomi-ai.sh up --experimental</code> (needs about 3 GB of free memory).</>
              : <>The local Bhoomi AI service is not reachable. Run <code>bash scripts/dev-bhoomi-ai.sh</code> (needs Ollama running locally).</>}
          </div>
        )}
        {status && msgs.length === 0 && (
          <div className="space-y-2 max-w-3xl">
            <p className="text-sm text-muted-foreground">Try a question:</p>
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => send(s)} disabled={busy || !usable(model)}
                className="block w-full text-left text-sm rounded border px-3 py-2 hover:bg-muted disabled:opacity-50">{s}</button>
            ))}
          </div>
        )}

        {msgs.map((m, i) => m.role === "user" ? (
          <div key={i} className="max-w-3xl rounded-lg border-l-4 border-primary bg-muted/40 px-3 py-2 text-sm" data-testid="user-msg">{m.text}</div>
        ) : m.role === "assistant" ? (
          <div key={i} className="max-w-3xl">
            <AssistantCard reply={m.cell.reply} error={m.cell.error} rated={m.cell.rated} modelId={m.model} onRate={r => rate(i, m.model, r)} />
          </div>
        ) : (
          <div key={i} className="grid gap-3 md:grid-cols-2" data-testid="compare-group">
            {(["qwen25", "bhoomi_v1"] as ModelId[]).map(id => (
              <div key={id} className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{info(id).label}{info(id).experimental ? " · experimental" : ""}</p>
                <AssistantCard reply={m.cells[id].reply} error={m.cells[id].error} rated={m.cells[id].rated} pending={m.cells[id].pending}
                  modelId={id} onRate={r => rate(i, id, r)} />
              </div>
            ))}
          </div>
        ))}
        {busy && msgs[msgs.length - 1]?.role === "user" && (
          <p className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-1" />Working… a local model can take up to a minute.</p>
        )}
        <div ref={end} />
      </main>

      <form className="border-t px-4 py-3 max-w-5xl w-full mx-auto flex gap-2" onSubmit={e => { e.preventDefault(); send(text); }}>
        <textarea value={text} onChange={e => setText(e.target.value)} maxLength={1500} rows={2} aria-label="Question"
          placeholder="Ask about a district: hazards, forecast, rainfall, reported floods, WASH…"
          className="flex-1 rounded border bg-background px-3 py-2 text-sm"
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }} />
        <Button type="submit" disabled={busy || !text.trim() || !status || !usable(model)}><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
