// Données locales synchronisées avec le serveur : seules les modifications sont téléchargées.
import { api } from "./lib.js";

const KEYS = {
  users: "id", messages: "id", groups: "id", group_members: ["group_id", "uid"], events: "id",
  polls: "id", poll_votes: ["poll_id", "uid"], announcements: "id", outings: "id",
  outing_rsvps: ["outing_id", "uid"], ideas: "id", idea_votes: ["idea_id", "uid"], market: "id",
  cards: "id", prefs: "uid", league: "uid", settings: "id",
};
export const db = Object.fromEntries(Object.keys(KEYS).map((t) => [t, new Map()]));
const keyOf = (t, row) => (Array.isArray(KEYS[t]) ? KEYS[t].map((k) => row[k]).join("|") : row[KEYS[t]]);

export const state = { me: null, online: true, loaded: false };
const listeners = new Set();
export const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = (changed) => { for (const fn of listeners) fn(changed); };
export const notify = (...names) => emit(new Set(names));

let cursor = 0, timer = null, inflight = null, again = false, failures = 0, started = false, fast = false;

function merge(changes) {
  const changed = new Set();
  for (const [table, rows] of Object.entries(changes || {})) {
    const map = db[table];
    if (!map) continue;
    for (const row of rows) {
      const k = keyOf(table, row);
      const old = map.get(k);
      // Préférences modifiées localement (upd négatif) : on ignore les versions serveur plus anciennes.
      if (old && old.upd < 0 && row.upd < -old.upd) continue;
      if (row.del) {
        if (map.delete(k)) changed.add(table);
      } else if (!old || old.upd !== row.upd) {
        map.set(k, row);
        changed.add(table);
      }
    }
  }
  return changed;
}

export function reset() {
  cursor = 0;
  for (const map of Object.values(db)) map.clear();
  state.loaded = false;
}

export function sync() {
  if (inflight) { again = true; return inflight; }
  inflight = (async () => {
    try {
      const r = await api(`/api/data?since=${cursor}`);
      const prev = state.me;
      const changed = new Set();
      // Changement de statut ou de rôle : on recharge tout (la visibilité des données change).
      if (prev && r.me && (prev.status !== r.me.status || prev.role !== r.me.role)) {
        reset();
        again = true;
      } else {
        for (const t of merge(r.changes)) changed.add(t);
        cursor = r.cursor || 0;
      }
      if (JSON.stringify(prev) !== JSON.stringify(r.me)) { state.me = r.me; changed.add("me"); }
      if (!state.loaded && r.me && r.me.status === "active" && !again) { state.loaded = true; changed.add("loaded"); }
      if (!state.online) { state.online = true; changed.add("online"); }
      failures = 0;
      if (changed.size) emit(changed);
    } catch (e) {
      failures++;
      if (e.status === 401) { state.me = null; emit(new Set(["me"])); }
      else if (state.online) { state.online = false; emit(new Set(["online"])); }
    } finally {
      inflight = null;
      if (again) { again = false; sync(); } else schedule();
    }
  })();
  return inflight;
}

function schedule() {
  clearTimeout(timer);
  if (!started || document.hidden) return;
  const pending = state.me && state.me.status !== "active";
  const base = pending ? 8000 : fast ? 2500 : 6000;
  timer = setTimeout(sync, Math.min(30000, base * 2 ** Math.min(failures, 3)));
}

// Rythme rapide pendant qu'un salon de chat est ouvert.
export function setFast(value) {
  if (fast === value) return;
  fast = value;
  if (value) sync(); else schedule();
}

export function start() {
  if (!started) {
    started = true;
    document.addEventListener("visibilitychange", () => (document.hidden ? clearTimeout(timer) : sync()));
    window.addEventListener("online", () => sync());
  }
  return sync();
}
export function stop() {
  started = false;
  clearTimeout(timer);
  reset();
}

// Envoie une action au serveur puis synchronise immédiatement.
export async function act(action, payload = {}) {
  const r = await api("/api/data", { action, ...payload });
  sync();
  return r;
}

/* ---------- Sélecteurs ---------- */
export const rows = (table) => [...db[table].values()];
export const me = () => state.me;
export const isStaff = () => !!state.me && (state.me.isSA || state.me.role === "mod");
export const isAdmin = () => !!state.me && state.me.isSA;
export function user(uid) {
  if (uid === "sa") return { id: "sa", display_name: "Professeur", emoji: "👑", color: "#7048e8", role: "admin" };
  return db.users.get(uid) || null;
}
export function nameOf(uid, fallback = "Ancien membre") {
  if (state.me && uid === state.me.id) return state.me.displayName;
  const u = user(uid);
  return u ? u.display_name : fallback;
}
export const settings = () => (db.settings.get("main") || {}).data || {};
export function prefs() {
  const p = state.me && db.prefs.get(state.me.id);
  return { seen: { ...((p && p.data.seen) || {}) }, done: { ...((p && p.data.done) || {}) } };
}
// Modifie les préférences tout de suite en local, puis les enregistre (groupé, toutes les 1,5 s).
let prefsTimer = null;
export function updatePrefs(fn, { silent = false } = {}) {
  if (!state.me) return;
  const p = prefs();
  fn(p);
  db.prefs.set(state.me.id, { uid: state.me.id, data: p, upd: -Date.now() });
  if (!silent) emit(new Set(["prefs"]));
  clearTimeout(prefsTimer);
  prefsTimer = setTimeout(() => {
    api("/api/data", { action: "prefs.save", data: prefs() }).catch(() => {});
  }, 1500);
}
export const activeMembers =() => rows("users").filter((u) => !u.status || u.status === "active");
export function myGroups() {
  const uid = state.me && state.me.id;
  const ids = new Set(rows("group_members").filter((m) => m.uid === uid).map((m) => m.group_id));
  return rows("groups").filter((g) => ids.has(g.id));
}
