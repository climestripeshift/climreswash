import { useState } from "react";
import { Button } from "@/components/ui/button";
import { loginBeta,loginBetaAdmin } from "@/lib/betaApi";

export function BetaLogin({ onDone,admin=false }: { onDone: () => void; admin?:boolean }) {
  const [email,setEmail] = useState(""), [code,setCode] = useState(""), [error,setError] = useState(""), [busy,setBusy] = useState(false);
  return <form className="space-y-3 max-w-sm mt-4" onSubmit={async e=>{
    e.preventDefault(); setBusy(true); setError("");
    try { if(admin)await loginBetaAdmin(email,code);else await loginBeta(code); onDone(); }
    catch(e) { setError((e as Error).message); }
    finally { setCode(""); setBusy(false); }
  }}>
    <h1 className="text-lg font-semibold">Bhoomi AI · private research beta</h1>
    <p className="text-xs">{admin?'Use your existing administrator email and private access code.':'Enter the shared 6-digit access PIN.'}</p>
    {admin&&<label className="block">Administrator email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} className="block border rounded p-2 w-full" /></label>}
    <label className="block">{admin?'Access code':'6-digit PIN'}<input type="password" autoComplete={admin?'current-password':'off'} inputMode={admin?undefined:'numeric'} pattern={admin?undefined:'[0-9]{6}'} required minLength={admin?undefined:6} maxLength={admin?128:6} value={code} onChange={e=>setCode(admin?e.target.value:e.target.value.replace(/\D/g,''))} className="block border rounded p-2 w-full" /></label>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <Button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
  </form>;
}
