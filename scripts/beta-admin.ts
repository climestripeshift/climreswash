// Run on the beta host with its secret environment. No token/key is accepted as a command-line argument.
import { BetaStore } from "../server/beta/store";
const [action, email, value] = process.argv.slice(2);
if (!process.env.BETA_DB_PATH || !process.env.BETA_HASH_KEY) throw new Error("Configure BETA_DB_PATH and BETA_HASH_KEY in the host secret environment");
const store = new BetaStore(process.env.BETA_DB_PATH, process.env.BETA_HASH_KEY);
const actor = process.env.BETA_OPERATOR_ID;
if (!actor) throw new Error("BETA_OPERATOR_ID is required for audit attribution");
try {
  switch (action) {
    case "invite": store.invite(email, value === "admin" ? "admin" : "user", actor); break;
    case "revoke": store.manageUser(email, { status: "suspended" }, actor); break;
    case "restore": store.manageUser(email, { status: "active" }, actor); break;
    case "role": store.manageUser(email, { role: value as "admin" | "user" }, actor); break;
    case "quota": store.manageUser(email, { quota: Number(value) }, actor); break;
    case "list": console.log(JSON.stringify(store.listUsers(), null, 2)); break;
    case "pause": store.setSetting("paused", "true"); store.audit(store.hash(actor), "cli_pause"); break;
    case "resume": store.setSetting("paused", "false"); store.audit(store.hash(actor), "cli_resume"); break;
    default: throw new Error("Usage: beta-admin.ts invite EMAIL [user|admin] | revoke EMAIL | restore EMAIL | role EMAIL ROLE | quota EMAIL N | list | pause | resume");
  }
  if (action !== "list") console.log("Saved locally; no email sent and no Cloudflare policy changed.");
} finally { store.close(); }
