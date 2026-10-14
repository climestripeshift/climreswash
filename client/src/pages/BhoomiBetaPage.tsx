import { BetaLogin } from "@/components/BetaLogin";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, FlaskConical, Loader2, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AssistantCard } from "@/pages/BhoomiAIChatPage";
import { BetaError, betaHistory, logoutBeta, acceptConsent, askBeta, askDemo, stopDemo, getMe, sendBetaFeedback, type BetaMe, type BetaReply } from "@/lib/betaApi";

type Msg = { role: "user"; text: string } | { role: "assistant"; reply?: BetaReply; error?: string; rated?: "up" | "down" };

const SUGGESTIONS = [
  "What is the overall hazard index of Kota?",
  "Compare historical rainfall variability for Jaipur and Jodhpur.",
  "Which three Rajasthan districts have the highest drought screening index?",
  "Give me the WASH survey indicators for Jaipur.",
];

export function BetaNotice({ me }: { me: BetaMe }) {
  if (me.demo?.configured) return (
    <div className="rounded border border-amber-500/50 bg-amber-500/5 p-3 text-xs space-y-1" role="note" data-testid="demo-notice">
      <p className="font-semibold">Bhoomi AI SHOWCASE DEMO · {me.demo.enabled ? "Active" : "Off"}</p>
      <p>{me.demo.label}</p>
      <p>The fine-tuned model calls read-only synthetic tools. The backend displays approved tool results and explanations. No real scientific data, forecasts or operational advice.</p>
      <p>Messages are sent to the authenticated Runpod model endpoint. Conversation context is held briefly in server memory, without research feedback or training records. Do not enter personal or confidential information.</p>
      <p>Shared limits: {me.demo.limits.concurrent} concurrent conversation request; {me.demo.limits.minute} requests per minute; {me.demo.limits.total} requests for the supervised demo.</p>
    </div>
  );
  return (
    <div className="rounded border border-amber-500/50 bg-amber-500/5 p-3 text-xs space-y-1" role="note" data-testid="beta-notice">
      <p className="font-medium flex items-center gap-1"><FlaskConical className="h-4 w-4" />Research beta · {me.model.label}</p>
      <p>
        Base model {me.model.baseModel}. {me.model.note} Do not use it for operational or life-safety decisions. Figures come from ClimResWASH tools and are checked against them before display, but answers can still be
        incomplete or wrong; screening indices are not probabilities. Only a subset of data is available in this beta: flood-event,
        monsoon-rainfall and forecast values are not included.
      </p>
      {me.privacy?.attributions?.length ? <p>Sources: {me.privacy.attributions.join("; ")}</p> : null}
    </div>
  );
}

function Consent({ me, onDone }: { me: BetaMe; onDone: () => void }) {
  const [training, setTraining] = useState(false);
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="max-w-2xl mx-auto space-y-3 text-sm" data-testid="consent">
      <h2 className="text-lg font-semibold flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Before you start: research-beta terms</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li><b>What this is.</b> A private research beta of an experimental language model for climate, GIS and WASH questions about Indian districts.</li>
        <li><b>What we store.</b> Your questions, the answers shown, the model version, verification results, tool provenance and any feedback you give, linked to a pseudonymous browser ID. Ordinary PIN access does not collect your email.</li>
        <li><b>Who sees it.</b> The research team. Text you type is processed by our GPU hosting provider to produce answers. {me.privacy && <>Processors: {me.privacy.processors.join(", ")}. Processing regions: {me.privacy.regions.join(", ")}. </>}Do not enter personal, confidential or sensitive information.</li>
        <li><b>How it is used.</b> To evaluate and improve the system. Feedback is <b>never</b> used to train a model automatically: any such use needs expert review, a provenance and licence check, and your separate consent below.</li>
        <li><b>Limits.</b> Daily question quotas apply. PIN users also share a daily allowance. Answers are research outputs, not advice.</li>
        <li><b>Retention and deletion.</b> Records are kept for the pilot and up to 90 days afterwards, with backup expiry within 30 further days. Request deletion or withdraw optional training consent at any time: {me.privacy?.contact || "contact the research team"}.</li>
      </ul>
      <label className="flex gap-2 items-start"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-1" />
        <span>I understand and agree to the above, including research use of my questions and feedback.</span></label>
      <label className="flex gap-2 items-start"><input type="checkbox" checked={training} onChange={e => setTraining(e.target.checked)} className="mt-1" />
        <span>Optional: my reviewed feedback may be <i>considered</i> for future model training, subject to review. (Not required.)</span></label>
      {err && <p className="text-destructive" role="alert">{err}</p>}
      <Button disabled={!agree} onClick={async () => {
        try { await acceptConsent(me.consent.required_version, training); onDone(); } catch (e) { setErr((e as Error).message); }
      }}>Accept and continue</Button>
    </div>
  );
}

function FeedbackForm({ reply, me }: { reply: BetaReply; me: BetaMe }) {
  const [cats, setCats] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [corr, setCorr] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const toggle = (id: string) => setCats(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id]));
  if (state === "sent") return <p className="text-xs text-muted-foreground">Thank you: feedback recorded for review.</p>;
  return (
    <details className="text-xs rounded border p-2" data-testid="feedback-form">
      <summary className="cursor-pointer font-medium">Give feedback on this answer</summary>
      <div className="mt-2 space-y-2">
        <div className="grid gap-1 sm:grid-cols-2">
          {me.feedback_categories.map(c => (
            <label key={c.id} className="flex gap-1.5 items-start"><input type="checkbox" checked={cats.includes(c.id)} onChange={() => toggle(c.id)} className="mt-0.5" />{c.label}</label>
          ))}
        </div>
        <textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={1500} rows={2} placeholder="What was wrong or missing?" className="w-full rounded border bg-background p-2" />
        <textarea value={corr} onChange={e => setCorr(e.target.value)} maxLength={2000} rows={2} placeholder="Suggested correction (optional): the right value, place or wording" className="w-full rounded border bg-background p-2" />
        {state === "error" && <p className="text-destructive" role="alert">Could not send feedback.</p>}
        <Button size="sm" disabled={state === "sending" || (cats.length === 0 && !comment.trim() && !corr.trim())} onClick={async () => {
          setState("sending");
          try {
            await sendBetaFeedback({ interaction_id: reply.interaction_id, categories: cats, comment: comment.trim() || undefined, suggested_correction: corr.trim() || undefined });
            setState("sent");
          } catch { setState("error"); }
        }}>Send feedback</Button>
      </div>
    </details>
  );
}

export default function BhoomiBetaPage() {
  const [me, setMe] = useState<BetaMe | null | undefined>(undefined);
  const [blocked, setBlocked] = useState<string>("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [history, setHistory] = useState<Awaited<ReturnType<typeof betaHistory>>["items"]>([]);
  const [busy, setBusy] = useState(false);
  const [sid, setSid] = useState<string | undefined>();
  const [wait, setWait] = useState<string>("");
  const end = useRef<HTMLDivElement>(null);

  const refresh = () => getMe().then(setMe).catch((e: BetaError) => {
    setMe(null);
    setBlocked(e.status === 401 ? "Sign in with the shared access PIN." : "Private beta access is unavailable. Contact the research team.");
  });
  useEffect(() => { refresh(); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  async function send(q: string) {
    const message = q.trim();
    if (!message || busy || !me || (me.demo?.configured && !me.demo.enabled)) return;
    setText(""); setWait(""); setBusy(true);
    setMsgs(m => [...m, { role: "user", text: message }]);
    try {
      const reply = await (me.demo?.configured ? askDemo : askBeta)(message, sid);
      setSid(reply.session_id);
      setMsgs(m => [...m, { role: "assistant", reply }]);
      refresh();
    } catch (e) {
      const err = e as BetaError;
      if (err.status === 428 || (me.demo?.configured && err.status === 503)) { refresh(); }
      if (err.retryAfter) setWait(`Please wait about ${err.retryAfter} s.`);
      setMsgs(m => [...m, { role: "assistant", error: err.message }]);
    } finally { setBusy(false); }
  }

  if (me === undefined) return <div className="p-6 text-sm"><Loader2 className="inline h-4 w-4 animate-spin mr-1" />Loading…</div>;
  if (me === null) return <div className="p-6 max-w-xl mx-auto text-sm"><p>{blocked}</p><BetaLogin onDone={refresh} /><a className="underline block mt-4" href="/">ClimResWASH home</a></div>;
  const demo = me.demo?.configured === true;
  const consented = demo || me.consent.accepted_version === me.consent.required_version && me.consent.research;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col" data-testid="beta-page">
      <header className="border-b px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex-1">
          <h1 className="text-base font-semibold">Bhoomi AI <Badge variant="outline">{demo ? "Showcase demo" : "Research beta"}</Badge></h1>
          <p className="text-xs text-muted-foreground">{demo ? "PIN access · DEMONSTRATION DATA · synthetic tools only" : "Invitation-only · experimental model · answers are verified against ClimResWASH tools"}</p>
        </div>
        <Badge variant="outline" data-testid="serving-model">{demo ? "Bhoomi-LLM v1 checkpoint-160" : me.model.label}</Badge>
        {!demo && <span className="text-xs text-muted-foreground" data-testid="quota">{me.quota.remaining_today} of {me.quota.daily_limit} questions left today</span>}
        <a className="text-xs underline" href="/">ClimResWASH home</a>
        <button className="text-xs underline" onClick={async () => { const result = await logoutBeta(); setMsgs([]); setHistory([]); window.location.assign(result.redirect); }}>Sign out</button>
        {demo && me.role === "admin" && <button className="text-xs underline" onClick={async () => { await stopDemo(); refresh(); }}>Emergency demo off</button>}
        {me.role === "admin" && <a className="text-xs underline" href="/bhoomiai/admin">Admin</a>}
      </header>
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-4 space-y-3">
        <BetaNotice me={me} />
        {!consented ? <Consent me={me} onDone={refresh} /> : (
          <>
            {!demo && <details className="text-sm rounded border p-2"><summary onClick={() => betaHistory().then(r => setHistory(r.items)).catch(() => setHistory([]))}>Your recent questions</summary>
              {history.map(item => <div className="border-t py-2" key={item.interaction_id}><p>{item.question}</p><p className="text-muted-foreground whitespace-pre-wrap">{item.answer}</p></div>)}
            </details>}
            {msgs.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Try a question:</p>
                {(demo ? ["What is the invented overall screening index for SYNTHETIC District Alpha in SYNTHETIC State?", "Why is this synthetic screening index not a probability?", "What can this demo show?"] : SUGGESTIONS).map(s => <button key={s} onClick={() => send(s)} disabled={busy || (demo && !me.demo?.enabled)} className="block w-full text-left text-sm rounded border px-3 py-2 hover:bg-muted">{s}</button>)}
              </div>
            )}
            {msgs.map((m, i) => m.role === "user" ? (
              <div key={i} className="rounded-lg border-l-4 border-primary bg-muted/40 px-3 py-2 text-sm" data-testid="user-msg">{m.text}</div>
            ) : (
              <div key={i} className="space-y-2">
                {demo ? <div className="rounded-lg border p-3 text-sm whitespace-pre-wrap" data-testid="demo-answer" role={m.error ? "alert" : undefined}>
                  {m.error || m.reply?.answer}
                  {m.reply && <p className="mt-2 text-xs text-muted-foreground">Real model tool calls: {m.reply.tool_trace?.flatMap(t => t.calls.map(c => c.name)).join(", ")}</p>}
                </div> : <AssistantCard reply={m.reply} error={m.error} modelId="bhoomi_v1" rated={m.rated}
                  onRate={r => {
                    const reply = m.reply;
                    if (!reply) return;
                    setMsgs(all => all.map((x, j) => (j === i && x.role === "assistant" ? { ...x, rated: r } : x)));
                    sendBetaFeedback({ interaction_id: reply.interaction_id, rating: r, categories: [] }).catch(() => {
                      setMsgs(all => all.map((x, j) => (j === i && x.role === "assistant" ? { ...x, rated: undefined } : x)));
                    });
                  }} />}
                {!demo && m.reply && <FeedbackForm reply={m.reply} me={me} />}
              </div>
            ))}
            {busy && <p className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-1" />Working… this can take up to a minute.</p>}
            {wait && <p className="text-xs flex gap-1 items-center"><AlertTriangle className="h-4 w-4" />{wait}</p>}
            <div ref={end} />
          </>
        )}
      </main>
      {consented && (
        <form className="border-t px-4 py-3 max-w-3xl w-full mx-auto flex gap-2" onSubmit={e => { e.preventDefault(); send(text); }}>
          <textarea value={text} onChange={e => setText(e.target.value)} maxLength={1000} rows={2} aria-label="Question"
            placeholder={demo ? "Ask about SYNTHETIC District Alpha or demo limitations…" : "Ask about a district: hazards, rainfall variability, WASH indicators… (no personal information)"}
            className="flex-1 rounded border bg-background px-3 py-2 text-sm"
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }} />
          <Button type="submit" disabled={busy || !text.trim() || (demo && !me.demo?.enabled)}><Send className="h-4 w-4" /></Button>
        </form>
      )}
    </div>
  );
}
