import { useState } from "react";
import { Button } from "@/components/ui/button";
import { loginBeta } from "@/lib/betaApi";

export function BetaLogin({ onDone }: { onDone: () => void }) {
  const [email,setEmail] = useState(""), [code,setCode] = useState(""), [error,setError] = useState(""), [busy,setBusy] = useState(false);
  return <form className="space-y-3 max-w-sm mt-4" onSubmit={async e=>{
    e.preventDefault(); setBusy(true); setError("");
    try { await loginBeta(email,code); onDone(); }
    catch(e) { setError((e as Error).message); }
    finally { setCode(""); setBusy(false); }
  }}>
    <h1 className="text-lg font-semibold">Bhoomi AI · private research beta</h1>
    <p className="text-xs">Use the email and private access code shared with you by the research team. Keep your code private.</p>
    <label className="block">Invited email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} className="block border rounded p-2 w-full" /></label>
    <label className="block">Access code<input type="password" autoComplete="current-password" required maxLength={128} value={code} onChange={e=>setCode(e.target.value)} className="block border rounded p-2 w-full" /></label>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <Button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
  </form>;
}
