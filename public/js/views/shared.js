// Fonctions communes à plusieurs vues.
import { html } from "../lib.js";
import * as store from "../store.js";

export const BASE_ROOMS = [
  ["gen", "# Général"], ["dev", "# Devoirs"], ["jeu", "# Jeux"], ["pro", "# Projets"],
  ["mat", "Maths"], ["fra", "Français"], ["his", "Histoire"], ["sci", "Sciences"],
];

// Salons visibles : salons de base + groupes dont on est membre (tous pour le staff).
export function rooms() {
  const groups = store.isStaff() ? store.rows("groups") : store.myGroups();
  return [...BASE_ROOMS, ...groups.sort((a, b) => a.name.localeCompare(b.name)).map((g) => ["g:" + g.id, "👥 " + g.name])];
}

export function unreadByRoom() {
  const me = store.me();
  const { seen } = store.prefs();
  const visible = new Set(rooms().map((r) => r[0]));
  const out = {};
  for (const m of store.db.messages.values()) {
    if (m.uid !== me.id && visible.has(m.room) && m.created > (seen[m.room] || 0)) out[m.room] = (out[m.room] || 0) + 1;
  }
  return out;
}
export const unreadCount = () => Object.values(unreadByRoom()).reduce((a, b) => a + b, 0);

export function leaderboard() {
  return store.rows("league").filter((l) => l.pts > 0 && (l.uid === store.me().id || store.user(l.uid))).sort((a, b) => b.pts - a.pts);
}
export function rank(uid) {
  const i = leaderboard().findIndex((l) => l.uid === uid);
  return i < 0 ? 0 : i + 1;
}

const BADGES = [[30, "🥉 Débutant"], [100, "🥈 Challenger"], [250, "🥇 Champion"], [500, "👑 Légende"]];
export const badgesFor = (pts) => BADGES.filter(([n]) => pts >= n).map(([, b]) => b).join(" · ") || "pas encore de badge";

export function avatar(uid, size = "") {
  const u = store.user(uid) || (store.me() && uid === store.me().id ? { emoji: store.me().emoji, color: store.me().color } : null);
  return html`<span class="avatar ${size}" style="--c:${(u && u.color) || "#868e96"}" aria-hidden="true">${(u && u.emoji) || "👤"}</span>`;
}
