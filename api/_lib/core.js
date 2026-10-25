// Code partagé par toutes les fonctions API : base de données, schéma, sessions, validation.
import crypto from "node:crypto";
import { promisify } from "node:util";
import postgres from "postgres";

/* ---------- Erreurs ---------- */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function fail(status, message) {
  throw new HttpError(status, message);
}

/* ---------- Base de données ---------- */
const DATABASE_URL = process.env.DATABASE_URL;
export const sql = DATABASE_URL
  ? postgres(DATABASE_URL, {
      ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
      max: 1,
      prepare: false, // compatible avec les poolers Supabase / Neon
      idle_timeout: 20,
      connect_timeout: 10,
      // Les horodatages (ms) sont des bigint : on les lit directement comme nombres.
      types: { bigint: { to: 20, from: [20], serialize: (x) => String(x), parse: (x) => Number(x) } },
    })
  : null;

const SCHEMA_VERSION = 1;
const SYNCED = [
  "class_groups", "group_members", "events", "polls", "poll_votes", "announcements",
  "outings", "outing_rsvps", "ideas", "idea_votes", "market", "prefs", "league", "settings",
];
const DDL = [
  `create table if not exists users(
    id text primary key,
    username text not null unique,
    display_name text not null,
    salt text not null,
    hash text not null,
    role text not null default 'member' check (role in ('member','mod')),
    status text not null default 'pending' check (status in ('pending','active','disabled')),
    emoji text not null default '🙂',
    color text not null default '#3b5bdb',
    muted boolean not null default false,
    sv int not null default 0,
    created bigint not null,
    approved_at bigint,
    approved_by text,
    last_seen bigint,
    upd bigint not null,
    del boolean not null default false)`,
  `create index if not exists users_upd on users(upd)`,
  `create table if not exists messages(
    id text primary key, room text not null, uid text not null, author text not null, body text not null,
    reply jsonb, pinned boolean not null default false, reported boolean not null default false,
    reactions jsonb not null default '{}'::jsonb,
    created bigint not null, upd bigint not null, del boolean not null default false)`,
  `create index if not exists messages_upd on messages(upd)`,
  `create index if not exists messages_created on messages(created desc)`,
  `create index if not exists messages_uid on messages(uid, created)`,
  `create table if not exists class_groups(
    id text primary key, uid text not null, name text not null, descr text not null default '',
    created bigint not null, upd bigint not null, del boolean not null default false)`,
  `create table if not exists group_members(
    group_id text not null, uid text not null,
    created bigint not null, upd bigint not null, del boolean not null default false,
    primary key(group_id, uid))`,
  `create table if not exists events(
    id text primary key, uid text not null, kind text not null, title text not null, due text not null,
    created bigint not null, upd bigint not null, del boolean not null default false)`,
  `create table if not exists polls(
    id text primary key, uid text not null, question text not null, options jsonb not null,
    created bigint not null, upd bigint not null, del boolean not null default false)`,
  `create table if not exists poll_votes(
    poll_id text not null, uid text not null, choice int not null,
    created bigint not null, upd bigint not null, del boolean not null default false,
    primary key(poll_id, uid))`,
  `create table if not exists announcements(
    id text primary key, uid text not null, author text not null, body text not null,
    created bigint not null, upd bigint not null, del boolean not null default false)`,
  `create table if not exists outings(
    id text primary key, uid text not null, place text not null, day text not null,
    hour text not null default '', note text not null default '',
    teams jsonb not null default '[]'::jsonb, rounds jsonb not null default '[]'::jsonb,
    created bigint not null, upd bigint not null, del boolean not null default false)`,
  `create table if not exists outing_rsvps(
    outing_id text not null, uid text not null,
    created bigint not null, upd bigint not null, del boolean not null default false,
    primary key(outing_id, uid))`,
  `create table if not exists ideas(
    id text primary key, uid text not null, author text not null, body text not null,
    anon boolean not null default true, retained boolean not null default false,
    created bigint not null, upd bigint not null, del boolean not null default false)`,
  `create table if not exists idea_votes(
    idea_id text not null, uid text not null,
    created bigint not null, upd bigint not null, del boolean not null default false,
    primary key(idea_id, uid))`,
  `create table if not exists market(
    id text primary key, uid text not null, kind text not null, body text not null,
    done boolean not null default false,
    created bigint not null, upd bigint not null, del boolean not null default false)`,
  `create table if not exists cards(
    id text primary key, uid text not null, subject text not null, question text not null, answer text not null,
    created bigint not null, upd bigint not null, del boolean not null default false)`,
  `create index if not exists cards_uid on cards(uid, upd)`,
  `create table if not exists prefs(
    uid text primary key, data jsonb not null default '{}'::jsonb,
    upd bigint not null, del boolean not null default false)`,
  `create table if not exists league(
    uid text primary key, pts int not null default 0, played int not null default 0,
    upd bigint not null, del boolean not null default false)`,
  `create table if not exists settings(
    id text primary key, data jsonb not null default '{}'::jsonb,
    upd bigint not null, del boolean not null default false)`,
  `create table if not exists logs(id bigserial primary key, at bigint not null, actor text not null, msg text not null)`,
  `create table if not exists quiz_games(
    id text primary key, type text not null, status text not null, uids text[] not null,
    data jsonb not null, created bigint not null, upd bigint not null)`,
  `create index if not exists quiz_games_list on quiz_games(status, created desc)`,
  `create table if not exists rate_limits(k text primary key, n int not null, reset_at bigint not null)`,
  ...SYNCED.map((t) => `create index if not exists ${t}_upd on ${t}(upd)`),
  `insert into settings(id, data, upd) values('main', '{}'::jsonb, (extract(epoch from now()) * 1000)::bigint) on conflict do nothing`,
];

let ready = null;
export function ensureSchema() {
  if (!sql) return Promise.reject(new HttpError(500, "DATABASE_URL n'est pas configurée sur le serveur."));
  if (!ready) ready = migrate().catch((e) => { ready = null; throw e; });
  return ready;
}

async function migrate() {
  await sql`create table if not exists meta(k text primary key, v text not null)`;
  const [row] = await sql`select v from meta where k = 'schema'`;
  if (row && Number(row.v) >= SCHEMA_VERSION) return;
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(732001)`;
    const [again] = await tx`select v from meta where k = 'schema'`;
    if (again && Number(again.v) >= SCHEMA_VERSION) return;
    for (const stmt of DDL) await tx.unsafe(stmt);
    await migrateLegacyAccounts(tx);
    await tx`insert into meta(k, v) values('schema', ${String(SCHEMA_VERSION)})
      on conflict(k) do update set v = excluded.v`;
  });
}

// Reprend les comptes de l'ancienne version (tables accounts + docs) : mêmes pseudos, mêmes mots de passe.
async function migrateLegacyAccounts(tx) {
  const [{ hasAccounts, hasDocs }] = await tx`
    select to_regclass('public.accounts') is not null as "hasAccounts",
           to_regclass('public.docs') is not null as "hasDocs"`;
  if (!hasAccounts) return;
  const now = Date.now();
  if (hasDocs) {
    await tx`
      insert into users(id, username, display_name, salt, hash, role, status, emoji, color, created, approved_at, upd)
      select a.uid, a.username, coalesce(nullif(d.data->>'nm', ''), a.username), a.salt, a.password_hash,
             case when d.data->>'role' = 'mod' then 'mod' else 'member' end,
             case d.data->>'st' when 'on' then 'active' when 'off' then 'disabled' else 'pending' end,
             coalesce(nullif(d.data->>'e', ''), '🙂'), coalesce(nullif(d.data->>'c', ''), '#3b5bdb'),
             a.created_at, case when d.data->>'st' = 'on' then a.created_at end, ${now}
      from accounts a
      left join (
        -- L'ancienne version enregistrait parfois le JSON sous forme de texte : on le décode.
        select id, case when jsonb_typeof(data) = 'string' then (data #>> '{}')::jsonb else data end as data
        from docs where col = 'members'
      ) d on d.id = a.uid
      on conflict do nothing`;
  } else {
    await tx`
      insert into users(id, username, display_name, salt, hash, created, upd)
      select uid, username, username, salt, password_hash, created_at, ${now} from accounts
      on conflict do nothing`;
  }
}

/* ---------- Mots de passe ---------- */
const scrypt = promisify(crypto.scrypt);
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = (await scrypt(password, salt, 64)).toString("hex");
  return { salt, hash };
}
export async function checkPassword(password, salt, hash) {
  const actual = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}
export function safeEqual(a, b) {
  const h = (s) => crypto.createHash("sha256").update(String(s ?? "")).digest();
  return crypto.timingSafeEqual(h(a), h(b));
}
export function validPassword(value) {
  const password = typeof value === "string" ? value : "";
  if (password.length < 8 || password.length > 128) {
    fail(400, "Le mot de passe doit contenir entre 8 et 128 caractères.");
  }
  return password;
}

/* ---------- Sessions (cookie signé HMAC) ---------- */
const COOKIE = "ccs";
const SECRET = process.env.SESSION_SECRET;
const mac = (s) => crypto.createHmac("sha256", SECRET).update(s).digest("base64url");

function signToken(payload) {
  if (!SECRET) fail(500, "SESSION_SECRET n'est pas configuré sur le serveur.");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return body + "." + mac(body);
}
function verifyToken(token) {
  if (!token || !SECRET) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = mac(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}
// Empreinte du code professeur : si le code change, les anciennes sessions professeur expirent.
export const adminKey = (code) => crypto.createHash("sha256").update("cc-admin:" + code).digest("base64url").slice(0, 12);

const secureFlag = (req) => (/^(localhost|127\.0\.0\.1)(:|$)/.test(req.headers.host || "") ? "" : " Secure;");
export function setSession(req, res, payload, days = 30) {
  const token = signToken({ ...payload, exp: Date.now() + days * 864e5 });
  res.setHeader("Set-Cookie", [
    `${COOKIE}=${token}; Path=/; HttpOnly;${secureFlag(req)} SameSite=Lax; Max-Age=${days * 86400}`,
    `cc=; Path=/; HttpOnly;${secureFlag(req)} SameSite=Lax; Max-Age=0`, // ancien cookie
  ]);
}
export function clearSession(req, res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly;${secureFlag(req)} SameSite=Lax; Max-Age=0`);
}

export const ADMIN_USER = Object.freeze({
  id: "sa", isSA: true, username: "professeur", displayName: "Professeur",
  role: "admin", status: "active", emoji: "👑", color: "#7048e8", muted: false,
});

export function toMe(u) {
  return {
    id: u.id, isSA: false, username: u.username, displayName: u.display_name,
    role: u.role, status: u.status, emoji: u.emoji, color: u.color, muted: u.muted,
    created: u.created,
  };
}

export async function currentUser(req) {
  const m = (req.headers.cookie || "").match(/(?:^|;\s*)ccs=([^;]+)/);
  const p = verifyToken(m && m[1]);
  if (!p) return null;
  if (p.sa) {
    const code = process.env.SUPERADMIN_CODE;
    return code && p.k === adminKey(code) ? ADMIN_USER : null;
  }
  const [u] = await sql`
    select id, username, display_name, role, status, emoji, color, muted, sv, created, last_seen
    from users where id = ${p.uid} and not del`;
  if (!u || u.sv !== p.sv) return null;
  const me = toMe(u);
  Object.defineProperty(me, "lastSeen", { value: u.last_seen, enumerable: false });
  return me;
}

export const isActive = (me) => !!me && me.status === "active";
export const isStaff = (me) => isActive(me) && (me.isSA || me.role === "mod");
export function requireActive(me) {
  if (!me) fail(401, "Connecte-toi pour continuer.");
  if (me.status === "pending") fail(403, "Ton compte attend la validation du professeur.");
  if (me.status !== "active") fail(403, "Ton compte est désactivé.");
  return me;
}
export function requireStaff(me) {
  requireActive(me);
  if (!isStaff(me)) fail(403, "Réservé aux modérateurs et au professeur.");
  return me;
}
export function requireAdmin(me) {
  if (!me || !me.isSA) fail(403, "Réservé au professeur.");
  return me;
}

/* ---------- Validation ---------- */
export function str(value, max, { min = 0, label = "Ce champ" } = {}) {
  const s = String(value ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, max);
  if (s.length < min) fail(400, min <= 1 ? `${label} est obligatoire.` : `${label} doit contenir au moins ${min} caractères.`);
  return s;
}
export function int(value, min, max, label = "La valeur") {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, `${label} doit être un entier entre ${min} et ${max}.`);
  return n;
}
export function id(value) {
  const s = String(value ?? "");
  if (!/^[\w-]{1,40}$/.test(s)) fail(400, "Identifiant invalide.");
  return s;
}
export const newId = () => crypto.randomBytes(9).toString("base64url");
export const clientIp = (req) => String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim().slice(0, 64);

/* ---------- Limitation des essais ---------- */
export async function limit(key, max, windowMs) {
  const now = Date.now();
  const [r] = await sql`
    insert into rate_limits(k, n, reset_at) values(${key}, 1, ${now + windowMs})
    on conflict(k) do update set
      n = case when rate_limits.reset_at < ${now} then 1 else rate_limits.n + 1 end,
      reset_at = case when rate_limits.reset_at < ${now} then ${now + windowMs} else rate_limits.reset_at end
    returning n, reset_at`;
  if (r.n > max) {
    const minutes = Math.max(1, Math.ceil((r.reset_at - now) / 60000));
    fail(429, `Trop d'essais. Réessaie dans ${minutes} min.`);
  }
}
export const clearLimit = (key) => sql`delete from rate_limits where k = ${key}`;

/* ---------- Journal ---------- */
export function log(actor, msg) {
  return sql`insert into logs(at, actor, msg) values(${Date.now()}, ${String(actor).slice(0, 40)}, ${String(msg).slice(0, 300)})`;
}

/* ---------- Enveloppe des fonctions API ---------- */
export function api(methods) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    try {
      const fn = methods[req.method];
      if (!fn) fail(405, "Méthode non autorisée.");
      let body = {};
      if (req.method !== "GET") {
        // Protection CSRF : un formulaire d'un autre site ne peut pas envoyer de JSON.
        if (!String(req.headers["content-type"] || "").includes("application/json")) fail(415, "Requête invalide.");
        body = req.body && typeof req.body === "object" ? req.body : safeJson(req.body);
        if (JSON.stringify(body).length > 20000) fail(413, "Contenu trop volumineux.");
      }
      await ensureSchema();
      const me = await currentUser(req);
      const out = await fn({ req, res, me, body, query: req.query || {} });
      res.status(200).json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
      console.error(e);
      const db = /connect|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|password authentication|getaddrinfo/i.test(String(e && e.message));
      res.status(500).json({
        error: db ? "Base de données injoignable. Vérifie DATABASE_URL dans Vercel." : "Erreur serveur. Réessaie dans un instant.",
      });
    }
  };
}
function safeJson(s) {
  try {
    const v = JSON.parse(s || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function actions(map) {
  return (ctx) => {
    const fn = map[ctx.body.action];
    if (!fn) fail(400, "Action inconnue.");
    return fn(ctx);
  };
}
