// Gestion des comptes : nouvelles inscriptions, état actif / inactif, validation par l'admin.
import { html, api, toast, ask, ago, fullDate, setHTML, $, empty, plural } from "../lib.js";
import * as store from "../store.js";

let users = [];
let filter = null; // null = choix automatique au premier chargement
let search = "";
const selected = new Set();
let timer = null, loading = false;

const FILTERS = [
  ["pending", "Nouveaux (en attente)"],
  ["active", "Actifs"],
  ["inactive", "Inactifs"],
  ["all", "Tous"],
];
const matches = (u) =>
  (filter === "all" ||
    (filter === "pending" && u.status === "pending") ||
    (filter === "active" && u.status === "active") ||
    (filter === "inactive" && u.status !== "active")) &&
  (!search || (u.display_name + " " + u.username).toLowerCase().includes(search));

function stateBadge(u) {
  if (u.status === "active") return html`<span class="badge badge-ok">● Actif</span>`;
  if (u.status === "pending") return html`<span class="badge badge-warn">● Inactif · en attente</span>`;
  return html`<span class="badge badge-off">● Inactif · désactivé</span>`;
}

function actionsFor(u) {
  const admin = store.isAdmin();
  const buttons = [];
  if (u.status === "pending") {
    buttons.push(html`<button class="btn-sm btn-primary" data-act="approve" data-id="${u.id}">✓ Accepter</button>`);
    buttons.push(html`<button class="btn-sm" data-act="reject" data-id="${u.id}">Refuser</button>`);
  } else if (u.status === "disabled" && admin) {
    buttons.push(html`<button class="btn-sm btn-primary" data-act="approve" data-id="${u.id}">Réactiver</button>`);
  } else if (u.status === "active" && admin) {
    buttons.push(html`<button class="btn-sm" data-act="disable" data-id="${u.id}">Désactiver</button>`);
  }
  const menu = [];
  if (u.status === "active" && (admin || u.role !== "mod")) {
    menu.push(html`<button data-act="mute" data-id="${u.id}" data-muted="${u.muted ? "" : "1"}">${u.muted ? "🔊 Rendre la parole" : "🔇 Rendre muet (chat)"}</button>`);
  }
  if (admin) {
    if (u.status === "active") menu.push(html`<button data-act="role" data-id="${u.id}" data-role="${u.role === "mod" ? "member" : "mod"}">${u.role === "mod" ? "⬇ Rétrograder en membre" : "⭐ Promouvoir modérateur"}</button>`);
    menu.push(html`<button data-act="password" data-id="${u.id}">🔑 Nouveau mot de passe</button>`);
    if (u.status !== "pending") menu.push(html`<button class="danger" data-act="remove" data-id="${u.id}">🗑 Supprimer le compte</button>`);
  }
  if (menu.length) {
    buttons.push(html`<details class="menu"><summary class="btn-sm" aria-label="Plus d'actions">⋯</summary><div class="menu-list">${menu}</div></details>`);
  }
  return buttons;
}

function row(u) {
  const isNew = Date.now() - u.created < 7 * 864e5;
  const selectable = u.status !== "active" && (store.isAdmin() || u.status === "pending");
  return html`<tr class="${u.status}">
    <td class="col-check">${selectable ? html`<input type="checkbox" aria-label="Sélectionner ${u.display_name}" data-change="select" data-id="${u.id}" ${selected.has(u.id) ? "checked" : ""}>` : ""}</td>
    <td data-label="Compte"><div class="who">
      <span class="avatar" style="--c:${u.color}">${u.emoji}</span>
      <div><b>${u.display_name}</b>${isNew ? html` <span class="badge badge-new">Nouveau</span>` : ""}
        <div class="muted small">@${u.username}${u.muted ? " · 🔇 muet" : ""}</div></div></div></td>
    <td data-label="Inscription" title="${fullDate(u.created)}">${ago(u.created)}</td>
    <td data-label="Dernière visite" title="${fullDate(u.last_seen)}">${ago(u.last_seen)}</td>
    <td data-label="Rôle">${u.role === "mod" ? "⭐ Modérateur" : "Membre"}</td>
    <td data-label="État">${stateBadge(u)}${u.status === "active" && u.approved_by ? html`<div class="muted small">par ${u.approved_by}</div>` : ""}</td>
    <td class="col-actions"><div class="row-actions">${actionsFor(u)}</div></td>
  </tr>`;
}

function draw() {
  const count = (fn) => users.filter(fn).length;
  const pending = count((u) => u.status === "pending");
  if (filter === null) filter = pending ? "pending" : "all";
  const stats = [
    ["pending", "En attente", pending, "warn"],
    ["active", "Actifs", count((u) => u.status === "active"), "ok"],
    ["inactive", "Inactifs", count((u) => u.status !== "active"), "off"],
    ["all", "Total", users.length, ""],
  ];
  setHTML($("#acc-stats"), stats.map(([k, label, n, tone]) => html`
    <button class="stat stat-${tone} ${filter === k ? "on" : ""}" data-act="filter" data-filter="${k}">
      <span class="stat-n">${n}</span><span class="stat-l">${label}</span></button>`));

  setHTML($("#acc-filters"), FILTERS.map(([k, label]) =>
    html`<button class="${filter === k ? "on" : ""}" data-act="filter" data-filter="${k}">${label}</button>`));

  for (const idSel of [...selected]) if (!users.some((u) => u.id === idSel && u.status !== "active")) selected.delete(idSel);
  setHTML($("#acc-bulk"), html`
    ${pending ? html`<button class="btn-primary" data-act="approveAll">✓ Accepter tous les nouveaux (${pending})</button>` : ""}
    ${selected.size ? html`<button data-act="approveSelected">Accepter la sélection (${selected.size})</button>` : ""}`);

  const list = users.filter(matches);
  setHTML($("#acc-list"), list.length
    ? html`<table class="table accounts">
        <thead><tr><th class="col-check"></th><th>Compte</th><th>Inscription</th><th>Dernière visite</th><th>Rôle</th><th>État</th><th class="col-actions">Actions</th></tr></thead>
        <tbody>${list.map(row)}</tbody></table>`
    : empty(filter === "pending" ? "Aucune nouvelle inscription à valider." : "Aucun compte ne correspond.", filter === "pending" ? "🎉" : "🔍"));
}

async function load() {
  if (loading) return;
  loading = true;
  try {
    users = (await api("/api/admin?op=users")).users;
    draw();
  } catch (e) {
    setHTML($("#acc-list"), empty("Impossible de charger les comptes : " + e.message, "⚠️"));
  } finally {
    loading = false;
  }
}

async function admin(action, payload, message) {
  await api("/api/admin", { action, ...payload });
  if (message) toast(message, "success");
  await load();
  store.sync();
}
const find = (id) => users.find((u) => u.id === id) || {};

export default {
  deps: ["users"],
  render() {
    return html`
      <header class="page-head"><h1>Comptes</h1>
        <p class="muted">Les élèves s'inscrivent avec un pseudo et un mot de passe. Leur compte reste <b>inactif</b> tant que tu ne l'as pas accepté.</p></header>
      <div class="stats" id="acc-stats"></div>
      <section class="card">
        <div class="toolbar">
          <div class="segmented" id="acc-filters"></div>
          <input type="search" placeholder="Rechercher un pseudo…" data-input="search" value="${search}" aria-label="Rechercher">
        </div>
        <div class="bulk" id="acc-bulk"></div>
        <div id="acc-list"><div class="loading">Chargement des comptes…</div></div>
      </section>`;
  },
  enter() {
    load();
    timer = setInterval(() => { if (!document.hidden) load(); }, 20000);
  },
  leave() { clearInterval(timer); timer = null; },
  update(changed) { if (changed.has("users")) load(); },
  actions: {
    filter(d) { filter = d.filter; draw(); },
    select(d, el) { el.checked ? selected.add(d.id) : selected.delete(d.id); draw(); },
    search(_, el) { search = el.value.trim().toLowerCase(); draw(); },
    approve(d) { return admin("approve", { ids: [d.id] }, `${find(d.id).display_name} peut maintenant accéder à la classe.`); },
    async approveAll() {
      const n = users.filter((u) => u.status === "pending").length;
      if (await ask({ title: "Accepter tous les nouveaux comptes ?", message: `${plural(n, "compte")} vont être activés.`, confirm: "Tout accepter" }))
        return admin("approveAll", {}, `${plural(n, "compte activé", "comptes activés")}.`);
    },
    approveSelected() {
      const ids = [...selected];
      selected.clear();
      return admin("approve", { ids }, `${plural(ids.length, "compte activé", "comptes activés")}.`);
    },
    async reject(d) {
      const u = find(d.id);
      if (await ask({ title: `Refuser l'inscription de ${u.display_name} ?`, message: "Le compte sera supprimé et le pseudo redeviendra disponible.", confirm: "Refuser", danger: true }))
        return admin("reject", { id: d.id }, "Inscription refusée.");
    },
    async disable(d) {
      const u = find(d.id);
      if (await ask({ title: `Désactiver ${u.display_name} ?`, message: "Le compte devient inactif et l'élève est déconnecté. Tu pourras le réactiver plus tard.", confirm: "Désactiver", danger: true }))
        return admin("disable", { id: d.id }, "Compte désactivé.");
    },
    async remove(d) {
      const u = find(d.id);
      if (await ask({ title: `Supprimer définitivement ${u.display_name} ?`, message: "Ses messages restent visibles mais le compte ne pourra plus se connecter.", confirm: "Supprimer", danger: true }))
        return admin("remove", { id: d.id }, "Compte supprimé.");
    },
    role(d) { return admin("role", { id: d.id, role: d.role }, d.role === "mod" ? "Promu modérateur." : "Rétrogradé en membre."); },
    mute(d) { return admin("mute", { id: d.id, muted: !!d.muted }, d.muted ? "Ne peut plus écrire dans le chat." : "Peut de nouveau écrire."); },
    async password(d) {
      const u = find(d.id);
      const pw = await ask({ title: `Nouveau mot de passe pour ${u.display_name}`, message: "Communique-le à l'élève : il pourra le changer dans ses réglages.", confirm: "Enregistrer", input: { type: "text", minlength: 8, maxlength: 128, placeholder: "8 caractères minimum" } });
      if (pw) return admin("resetPassword", { id: d.id, password: pw }, "Mot de passe modifié.");
    },
  },
};
