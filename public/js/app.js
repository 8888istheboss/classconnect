// Point d'entrée : écran de connexion ou application, navigation, délégation des événements.
import { html, setHTML, $, api, toast } from "./lib.js";
import * as store from "./store.js";
import auth from "./views/auth.js";
import home from "./views/home.js";
import chat from "./views/chat.js";
import groups from "./views/groups.js";
import games from "./views/games.js";
import planning from "./views/planning.js";
import cards from "./views/cards.js";
import league from "./views/league.js";
import polls from "./views/polls.js";
import outings from "./views/outings.js";
import ideas from "./views/ideas.js";
import market from "./views/market.js";
import directory from "./views/directory.js";
import accounts from "./views/accounts.js";
import admin from "./views/admin.js";
import settings, { applyTheme, getTheme } from "./views/settings.js";
import { unreadCount } from "./views/shared.js";

// fixed : ne peut pas être masquée ; staff : modérateurs + professeur ; admin : professeur seulement.
const ROUTES = [
  { id: "accueil", icon: "🏠", label: "Accueil", view: home, fixed: true },
  { id: "chat", icon: "💬", label: "Chat", view: chat },
  { id: "groupes", icon: "👥", label: "Groupes", view: groups },
  { id: "defis", icon: "🎮", label: "Défis", view: games },
  { id: "planning", icon: "📅", label: "Planning", view: planning },
  { id: "revisions", icon: "📚", label: "Révisions", view: cards },
  { id: "league", icon: "🏆", label: "League", view: league },
  { id: "sondages", icon: "🗳️", label: "Sondages", view: polls },
  { id: "sorties", icon: "🎯", label: "Sorties", view: outings },
  { id: "idees", icon: "💡", label: "Idées", view: ideas },
  { id: "echange", icon: "🔄", label: "Échange", view: market },
  { id: "annuaire", icon: "📇", label: "Annuaire", view: directory },
  { id: "comptes", icon: "🛂", label: "Comptes", view: accounts, staff: true, fixed: true },
  { id: "admin", icon: "👑", label: "Administration", view: admin, admin: true, fixed: true },
  { id: "reglages", icon: "⚙️", label: "Réglages", view: settings, fixed: true },
];
admin.setTabs(ROUTES.filter((r) => !r.fixed).map((r) => [r.id, `${r.icon} ${r.label}`]));

const root = $("#app");
let mode = "boot";
let current = null; // route affichée
let appReady = false;

/* ---------- Modes ---------- */
function computeMode() {
  const me = store.me();
  if (!me || me.status !== "active") return "auth";
  return appReady || store.state.loaded ? "app" : "loading";
}

function switchMode(next) {
  if (current) { current.view.leave?.(); current = null; }
  mode = next;
  if (next === "auth") {
    appReady = false;
    renderAuth();
  } else if (next === "loading") {
    setHTML(root, html`<div class="boot"><span class="brand-mark big">C</span><p>Chargement de ta classe…</p></div>`);
  } else if (next === "app") {
    appReady = true;
    setHTML(root, html`<div class="shell">
      <header class="topbar">
        <a class="brand" href="#/accueil"><span class="brand-mark" aria-hidden="true">C</span><span class="brand-name">ClassConnect</span></a>
        <span id="net" class="net" role="status"></span>
        <div class="topbar-right"><a href="#/reglages" class="me-chip" id="me-chip"></a>
          <button class="btn-sm" data-act="logout">Quitter</button></div>
      </header>
      <div id="banner"></div>
      <div class="layout">
        <nav class="nav" id="nav" aria-label="Navigation principale"></nav>
        <main id="view" class="view" tabindex="-1"></main>
      </div>
    </div>`);
    renderTop();
    renderBanner();
    renderNet();
    navigate();
  }
}

function renderAuth() {
  setHTML(root, html`<div class="auth-screen">${auth.render()}</div>`);
}

/* ---------- Coque de l'application ---------- */
function visibleRoutes() {
  const me = store.me();
  const hidden = me.isSA ? [] : store.settings().hiddenTabs || [];
  return ROUTES.filter((r) =>
    (!r.staff || store.isStaff()) && (!r.admin || store.isAdmin()) && (r.fixed || !hidden.includes(r.id)));
}

function renderTop() {
  const me = store.me();
  const role = me.isSA ? "Professeur" : me.role === "mod" ? "Modérateur" : "Membre";
  setHTML($("#me-chip"), html`<span class="avatar sm" style="--c:${me.color}">${me.emoji}</span>
    <span class="me-name">${me.displayName}</span><span class="badge">${role}</span>`);
}

function renderBanner() {
  const text = store.settings().banner;
  setHTML($("#banner"), text ? html`<div class="banner" role="alert">📢 ${text}</div>` : "");
}

function renderNet() {
  const el = $("#net");
  if (el) setHTML(el, store.state.online ? "" : html`<span class="badge badge-warn">Hors ligne · reconnexion…</span>`);
}

function badges() {
  const out = { chat: unreadCount() };
  const me = store.me();
  const voted = new Set(store.rows("poll_votes").filter((v) => v.uid === me.id).map((v) => v.poll_id));
  out.sondages = store.rows("polls").filter((p) => !voted.has(p.id)).length;
  if (store.isStaff()) out.comptes = store.rows("users").filter((u) => u.status === "pending").length;
  return out;
}

let navSig = "";
function renderNav() {
  const b = badges();
  const list = visibleRoutes();
  const sig = JSON.stringify([b, list.map((r) => r.id), current && current.id]);
  if (sig === navSig) return;
  navSig = sig;
  setHTML($("#nav"), list.map((r) => html`<a href="#/${r.id}" class="nav-item ${current && current.id === r.id ? "on" : ""}"
      ${current && current.id === r.id ? html`aria-current="page"` : ""}>
      <span class="nav-icon" aria-hidden="true">${r.icon}</span><span class="nav-label">${r.label}</span>
      ${b[r.id] ? html`<span class="count ${r.id === "comptes" ? "warn" : "hot"}">${b[r.id] > 99 ? "99+" : b[r.id]}</span>` : ""}</a>`));
}

function navigate() {
  if (mode !== "app") return;
  const wanted = location.hash.replace(/^#\/?/, "").split(/[/?]/)[0] || "accueil";
  const list = visibleRoutes();
  const route = list.find((r) => r.id === wanted) || list[0];
  if (route.id !== wanted) history.replaceState(null, "", "#/" + route.id);
  if (current === route) return;
  if (current) current.view.leave?.();
  current = route;
  showView(route.view);
  route.view.enter?.();
  renderNav();
  document.title = `${route.label} · ClassConnect`;
  window.scrollTo(0, 0);
}

function showView(view) {
  setHTML($("#view"), view.render());
  view.update?.(new Set(["all", ...(view.deps || [])]));
}

// Chaque vue peut se redessiner entièrement.
for (const r of ROUTES) r.view.rerender = () => { if (current && current.view === r.view) showView(r.view); };
auth.rerender = () => mode === "auth" && renderAuth();

/* ---------- Réactions aux données ---------- */
store.onChange((changed) => {
  const next = computeMode();
  if (next !== mode) return switchMode(next);
  if (mode === "auth") { if (changed.has("me")) renderAuth(); return; }
  if (mode !== "app" || !current) return;
  if (changed.has("me")) renderTop();
  if (changed.has("online")) renderNet();
  if (changed.has("settings") || changed.has("me")) {
    renderBanner();
    if (!visibleRoutes().includes(current)) { navigate(); return; }
  }
  renderNav();
  const deps = current.view.deps || [];
  if (changed.has("loaded") || changed.has("me") || deps.some((d) => changed.has(d))) current.view.update?.(changed);
});
window.addEventListener("hashchange", navigate);

/* ---------- Délégation des événements ---------- */
const shellActions = {
  async logout() {
    try { await api("/api/auth", { action: "logout" }); } catch { /* déconnexion locale quand même */ }
    store.stop();
    store.state.me = null;
    switchMode("auth");
  },
};
const activeView = () => (mode === "app" && current ? current.view : auth);

async function run(fn, busyEl) {
  if (busyEl) busyEl.disabled = true;
  try {
    return await fn();
  } catch (e) {
    toast(e.message || "Une erreur est survenue.", "error");
    throw e;
  } finally {
    if (busyEl && busyEl.isConnected) busyEl.disabled = false;
  }
}

root.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || !root.contains(el)) return;
  const view = activeView();
  const fn = (view.actions && view.actions[el.dataset.act]) || shellActions[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  const menu = el.closest("details.menu");
  if (menu) menu.open = false;
  run(() => fn.call(view, el.dataset, el, e), el.tagName === "BUTTON" ? el : null).catch(() => {});
});

for (const [type, attr] of [["change", "change"], ["input", "input"]]) {
  root.addEventListener(type, (e) => {
    const el = e.target.closest(`[data-${attr}]`);
    if (!el) return;
    const view = activeView();
    const fn = view.actions && view.actions[el.dataset[attr]];
    if (fn) run(() => fn.call(view, el.dataset, el, e)).catch(() => {});
  });
}

root.addEventListener("submit", (e) => {
  const form = e.target.closest("form[data-form]");
  if (!form) return;
  e.preventDefault();
  const view = activeView();
  const fn = view.forms && view.forms[form.dataset.form];
  if (!fn) return;
  const values = Object.fromEntries(new FormData(form));
  run(async () => {
    await fn.call(view, values, form);
    if (!("keep" in form.dataset) && form.isConnected) form.reset();
  }, form.querySelector("[type=submit]")).catch(() => {});
});

// Ferme les menus « ⋯ » quand on clique ailleurs.
document.addEventListener("click", (e) => {
  for (const d of document.querySelectorAll("details.menu[open]")) if (!d.contains(e.target)) d.open = false;
});

/* ---------- Démarrage ---------- */
applyTheme(getTheme());
(async function boot() {
  try {
    const { user } = await api("/api/auth");
    store.state.me = user;
    switchMode(computeMode());
    if (user) await store.start();
  } catch (e) {
    setHTML(root, html`<div class="boot"><span class="brand-mark big">C</span>
      <h2>Impossible de joindre le serveur</h2><p class="muted">${e.message}</p>
      <a class="btn btn-primary" href="">Réessayer</a></div>`);
  }
})();
