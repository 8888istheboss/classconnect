import postgres from "postgres";
import crypto from "node:crypto";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL manquant dans les variables d'environnement");
export const sql = postgres(databaseUrl, { ssl: "require", max: 1, prepare: false });
const SECRET = process.env.SESSION_SECRET;
let ready;

// Crée les tables au premier appel (une seule fois par instance)
export const init = () => (ready ||= (async () => {
  await sql`create table if not exists docs(col text not null, id text not null, data jsonb not null, uid text, t bigint not null, upd bigint not null, primary key(col,id))`;
  await sql`create table if not exists attempts(ip text primary key, n int not null default 0, until bigint not null default 0)`;
  const now = Date.now();
  await sql`insert into docs(col,id,data,uid,t,upd) values('cfg','main','{"appr":true}'::jsonb,'sa',${now},${now}) on conflict do nothing`;
})());

const mac = (b) => crypto.createHmac("sha256", SECRET).update(b).digest("base64url");
export function sign(p) {
  if (!SECRET) throw new Error("SESSION_SECRET manquant dans les variables d'environnement");
  const b = Buffer.from(JSON.stringify(p)).toString("base64url");
  return b + "." + mac(b);
}
function verify(tok) {
  if (!tok || !SECRET) return null;
  const [b, s] = tok.split(".");
  if (!b || !s) return null;
  const e = mac(b);
  if (s.length !== e.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(e))) return null;
  try { const p = JSON.parse(Buffer.from(b, "base64url").toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}
export const setCookie = (res, p) =>
  res.setHeader("Set-Cookie", `cc=${sign(p)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);

// Qui est la personne qui appelle ? (le rôle vient TOUJOURS de la base, jamais du navigateur)
export async function who(req, res) {
  await init();
  const m = (req.headers.cookie || "").match(/(?:^|; )cc=([^;]+)/);
  let p = verify(m && m[1]);
  if (!p) {
    p = { uid: "u" + crypto.randomBytes(8).toString("hex"), sa: false, exp: Date.now() + 30 * 864e5 };
    setCookie(res, p);
  }
  let role = p.sa ? "sa" : "none", st = null, name = p.sa ? "Super admin" : "", emoji = "🙂", color = "#3b5bdb";
  if (!p.sa) {
    const r = await sql`select data from docs where col='members' and id=${p.uid}`;
    if (r[0]) { st = r[0].data.st; name = r[0].data.nm; emoji = r[0].data.e || emoji; color = r[0].data.c || color; if (st === "on") role = r[0].data.role === "mod" ? "mod" : "member"; }
  }
  return { uid: p.uid, sa: !!p.sa, role, st, name, emoji, color };
}
export const body = (req) => (req.body && typeof req.body === "object" ? req.body : (() => { try { return JSON.parse(req.body || "{}"); } catch { return {}; } })());
export const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, n);
export const log = (tx) => { const t = Date.now(); return sql`insert into docs(col,id,data,uid,t,upd) values('logs',${"l" + t + Math.random().toString(36).slice(2, 6)},${JSON.stringify({ tx, by: "Serveur", t })}::jsonb,'sa',${t},${t})`; };
