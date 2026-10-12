import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SafeMarkdown } from "@/components/SafeMarkdown";
import {
  BetaError, adminSuspend, adminUser, adminFeedback, adminInvite, adminKill, adminReview, adminUsage, adminUsers, exportUrl, getMe,
  type AdminFeedbackItem,
} from "@/lib/betaApi";

type Usage = Awaited<ReturnType<typeof adminUsage>>;
type Users = Awaited<ReturnType<typeof adminUsers>>["users"];
const fmt = (ts: number) => new Date(ts * (ts < 1e12 ? 1000 : 1)).toISOString().replace("T", " ").slice(0, 16) + "Z";

export default function BhoomiBetaAdminPage() {
  const [allowed, setAllowed] = useState<boolean | undefined>();
  const [items, setItems] = useState<AdminFeedbackItem[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [f, setF] = useState<Record<string, string>>({ status: "", rating: "", category: "", verified: "", model: "", from: "", to: "", offset: "0" });
  const [usage, setUsage] = useState<Usage | null>(null);
  const [users, setUsers] = useState<Users>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const active = Object.fromEntries(Object.entries(f).filter(([, v]) => v).map(([k, v]) => [k, k === "from" || k === "to" ? String(new Date(v).getTime()) : v]));

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [fb, u, us] = await Promise.all([adminFeedback(active), adminUsage(), adminUsers()]);
      setItems(fb.items); setStatuses(fb.review_statuses); setUsage(u); setUsers(us.users);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }, [JSON.stringify(active)]);

  useEffect(() => { getMe().then(m => setAllowed(m.role === "admin")).catch(() => setAllowed(false)); }, []);
  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  if (allowed === undefined) return <div className="p-6 text-sm"><Loader2 className="inline h-4 w-4 animate-spin mr-1" />Loading…</div>;
  if (!allowed) return <div className="p-6 text-sm" role="alert"><ShieldAlert className="inline h-4 w-4 mr-1" />Administrator access required.</div>;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); setMsg(ok); await load(); } catch (e) { setMsg(e instanceof BetaError ? e.message : "Failed."); }
  };
  const today = usage?.days?.[0];

  return (
    <div className="min-h-screen bg-background text-foreground p-4 max-w-6xl mx-auto space-y-4" data-testid="beta-admin">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold flex-1">Bhoomi AI research beta · feedback review</h1>
        <a className="text-xs underline" href="/bhoomiai">← Chat</a>
      </header>
      {msg && <p className="text-xs rounded border px-2 py-1" role="status">{msg}</p>}

      <section className="grid gap-3 sm:grid-cols-3 text-sm">
        <div className="rounded border p-3"><p className="text-xs text-muted-foreground">Latest day{today ? ` (${today.day})` : ""}</p>
          <p>{today ? `${today.requests} requests · ${today.users} users · ${Math.round(today.gpu_seconds)} reserved / estimated compute-seconds` : "no usage yet"}</p></div>
        <div className="rounded border p-3 flex items-center gap-2"><div className="flex-1"><p className="text-xs text-muted-foreground">Kill switch</p>
          <p>{usage?.killed ? <Badge variant="destructive">Chat disabled</Badge> : <Badge variant="outline">Chat enabled</Badge>}</p></div>
          <Button size="sm" variant={usage?.killed ? "default" : "destructive"} onClick={() => act(() => adminKill(!usage?.killed), usage?.killed ? "Chat re-enabled." : "Chat disabled.")}>
            {usage?.killed ? "Enable" : "Disable chat"}</Button></div>
        <form className="rounded border p-3 flex gap-2 items-end" onSubmit={e => { e.preventDefault(); if (email.trim()) act(() => adminInvite(email.trim(), "user").then(r => setMsg(r.reminder)), "Invited."); setEmail(""); }}>
          <label className="flex-1 text-xs">Invite (gateway allowlist)<input value={email} onChange={e => setEmail(e.target.value)} type="email" className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm" /></label>
          <Button size="sm" type="submit">Add</Button></form>
      </section>

      <p className="text-xs text-muted-foreground">Inviting here updates the gateway allowlist. Add the exact address to Cloudflare Access and send the invitation separately; no email is sent automatically.</p>
      <section className="flex flex-wrap gap-2 items-end text-xs">
        {([["status", "Review status", statuses], ["rating", "Rating", ["up", "down"]], ["category", "Category", ["incorrect_figure", "wrong_geography", "wrong_indicator_or_period", "incomplete_answer", "unclear_explanation", "missing_data_not_explained", "overconfident_or_unsafe", "other"]], ["verified", "Verifier", ["true", "false"]]] as [string, string, string[]][]).map(([k, label, opts]) => (
          <label key={k}>{label}
            <select value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} className="block mt-1 rounded border bg-background px-2 py-1">
              <option value="">any</option>{opts.map(o => <option key={o} value={o}>{k === "verified" ? (o === "true" ? "passed" : "not passed") : o}</option>)}
            </select></label>
        ))}
        <label>Model version<input aria-label="Model filter" value={f.model} onChange={e => setF({ ...f, model: e.target.value, offset: "0" })} className="block border rounded p-1" /></label>
        {(["from", "to"] as const).map(k => <label key={k}>{k === "from" ? "From date" : "To date"}<input type="date" value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value, offset: "0" })} className="block border rounded p-1" /></label>)}
        <Button size="sm" disabled={Number(f.offset) === 0} onClick={() => setF({ ...f, offset: String(Math.max(0, Number(f.offset) - 200)) })}>Previous</Button>
        <Button size="sm" disabled={items.length < 200} onClick={() => setF({ ...f, offset: String(Number(f.offset) + 200) })}>Next</Button>
        <a href={exportUrl("csv", active)}><Button size="sm" variant="outline" type="button"><Download className="h-3 w-3 mr-1" />CSV</Button></a>
        <a href={exportUrl("jsonl", active)}><Button size="sm" variant="outline" type="button"><Download className="h-3 w-3 mr-1" />JSONL</Button></a>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        <span className="text-muted-foreground">Exports include only records with research consent. Exporting never authorises training use.</span>
      </section>

      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">{items.length} feedback item(s)</p>
        {items.map(it => (
          <article key={it.feedback_id} className="rounded border p-3 text-sm space-y-1" data-testid="fb-item">
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant={it.rating === "down" ? "destructive" : "outline"}>{it.rating ?? "no rating"}</Badge>
              <Badge variant={it.verified ? "default" : "secondary"}>{it.verified ? "verifier passed" : `verifier: ${it.answer_status}`}</Badge>
              <Badge variant="outline">{it.review_status}</Badge>
              {it.categories.map(c => <Badge key={c} variant="secondary">{c}</Badge>)}
              <span className="text-xs text-muted-foreground ml-auto">{fmt(it.ts)} · {it.user_hash.slice(0, 8)} · {it.interaction_id.slice(0, 8)}</span>
            </div>
            <p><b>Q:</b> {it.question}</p>
            {it.comment && <p><b>Comment:</b> {it.comment}</p>}
            {it.suggested_correction && <p><b>Suggested correction:</b> {it.suggested_correction}</p>}
            <Button size="sm" variant="ghost" onClick={() => { setOpen(open === it.feedback_id ? null : it.feedback_id); setNotes(it.reviewer_notes ?? ""); }}>
              {open === it.feedback_id ? "Close" : "Review"}</Button>
            {open === it.feedback_id && (
              <div className="rounded bg-muted/50 p-2 space-y-2">
                <div><p className="font-medium">Answer shown:</p><SafeMarkdown text={it.answer} className="text-sm" /></div>
                {it.unavailable_data.length > 0 && <p className="text-xs"><b>Unavailable data:</b> {it.unavailable_data.join("; ")}</p>}
                <details className="text-xs"><summary className="cursor-pointer">Tool provenance</summary>
                  <pre className="whitespace-pre-wrap">{JSON.stringify(it.tool_calls, null, 1)}</pre></details>
                <p className="text-xs">Consent: research {it.consent_research ? "yes" : "no"} · training {it.consent_training ? "yes (still needs review)" : "no"}</p>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Reviewer notes" className="w-full rounded border bg-background p-2 text-xs" />
                <div className="flex flex-wrap gap-1">
                  {statuses.map(s => (
                    <Button key={s} size="sm" variant={it.review_status === s ? "default" : "outline"}
                      disabled={s === "candidate_for_training_review" && !it.consent_training}
                      title={s === "candidate_for_training_review" && !it.consent_training ? "User has not given training consent" : undefined}
                      onClick={() => act(() => adminReview(it.feedback_id, s, notes), `Saved: ${s}`)}>{s}</Button>
                  ))}
                </div>
              </div>
            )}
          </article>
        ))}
      </section>

      <section className="text-xs">
        <h2 className="font-medium mb-1">Invited users ({users.length})</h2>
        <ul className="grid gap-x-4 sm:grid-cols-2">
          {users.map(u => <li key={u.email} className="border-t py-2 flex gap-2 flex-wrap items-center">
            <span>{u.email} · {u.status} · consent {u.consent_version ?? "pending"}</span>
            <label>Role <select aria-label={`Role for ${u.email}`} value={u.role} onChange={e => act(() => adminUser(u.email, { role: e.target.value }), "Role updated.")} className="border rounded"><option value="user">User</option><option value="admin">Admin</option></select></label>
            <label>Daily quota <input aria-label={`Quota for ${u.email}`} type="number" min={0} max={120} defaultValue={u.daily_quota ?? usage?.limits?.perDay ?? 40} key={`${u.email}-${u.daily_quota}`} onBlur={e => { const n = Number(e.target.value); if (n !== (u.daily_quota ?? usage?.limits?.perDay ?? 40)) act(() => adminUser(u.email, { quota: n }), "Quota updated."); }} className="border rounded w-16" /></label>
            <Button size="sm" variant={u.status === "suspended" ? "outline" : "destructive"} onClick={() => act(() => adminSuspend(u.email, u.status !== "suspended"), u.status === "suspended" ? "Access restored; fresh sign-in required." : "Access revoked immediately.")}>{u.status === "suspended" ? "Restore access" : "Revoke access"}</Button>
          </li>)}
        </ul>
      </section>
    </div>
  );
}
