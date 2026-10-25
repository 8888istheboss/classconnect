// Administration (professeur) : réglages globaux, signalements, outils, journal.
import { html, setHTML, $, api, toast, ask, empty, fullDate } from "../lib.js";
import * as store from "../store.js";
import { rooms } from "./shared.js";

let tabsList = []; // fourni par app.js : [[id, libellé], ...] des sections masquables

async function loadLogs() {
  try {
    const { logs } = await api("/api/admin?op=logs");
    setHTML($("#admin-logs"), logs.length ? html`<ul class="list compact">${logs.map((l) => html`
      <li><span>${l.msg}</span><span class="muted small">${l.actor} · ${fullDate(l.at)}</span></li>`)}</ul>` : empty("Aucune activité.", "📜"));
  } catch (e) {
    setHTML($("#admin-logs"), empty(e.message, "⚠️"));
  }
}

async function admin(action, payload, message) {
  await api("/api/admin", { action, ...payload });
  if (message) toast(message, "success");
  store.sync();
  loadLogs();
}

function drawSettings() {
  const s = store.settings();
  const hidden = new Set(s.hiddenTabs || []);
  setHTML($("#admin-settings"), html`<form data-form="settings" data-keep class="stack">
    <label class="check"><input type="checkbox" name="chatLocked" ${s.chatLocked ? "checked" : ""}> 🔒 Verrouiller le chat (seuls les modérateurs peuvent écrire)</label>
    <label class="field"><span>Bannière d'alerte affichée à tous</span>
      <input name="banner" maxlength="160" value="${s.banner || ""}" placeholder="Laisser vide pour ne rien afficher"></label>
    <fieldset><legend>Sections visibles par les élèves</legend><div class="checks">
      ${tabsList.map(([k, label]) => html`<label class="check"><input type="checkbox" name="tab:${k}" ${hidden.has(k) ? "" : "checked"}> ${label}</label>`)}
    </div></fieldset>
    <button class="btn-primary" type="submit">Enregistrer les réglages</button></form>`);
}

// Remplit une liste déroulante en gardant l'option choisie.
function fillSelect(el, options) {
  if (!el) return;
  const value = el.value;
  setHTML(el, options.map(([k, label]) => html`<option value="${k}">${label}</option>`));
  if (options.some(([k]) => k === value)) el.value = value;
}

function drawReports() {
  const reported = store.rows("messages").filter((m) => m.reported).sort((a, b) => b.created - a.created);
  setHTML($("#admin-reports"), reported.length ? html`<ul class="list">${reported.map((m) => html`<li>
    <div><b>${store.nameOf(m.uid, m.author)}</b> : ${m.body}<div class="muted small">${fullDate(m.created)}</div></div>
    <div class="actions">
      <button class="btn-sm" data-act="clearReport" data-id="${m.id}">Valider</button>
      <button class="btn-sm" data-act="delMsg" data-id="${m.id}">Supprimer</button>
      ${m.uid !== "sa" ? html`<button class="btn-sm" data-act="mute" data-uid="${m.uid}">Rendre muet</button>` : ""}
    </div></li>`)}</ul>` : empty("Aucun signalement.", "✅"));

  const muted = store.rows("users").filter((u) => u.muted && !u.del);
  setHTML($("#admin-muted"), muted.length ? html`<ul class="list">${muted.map((u) => html`<li><span>🔇 ${u.display_name}</span>
    <button class="btn-sm" data-act="unmute" data-uid="${u.id}">Rendre la parole</button></li>`)}</ul>` : empty("Personne n'est muet.", "🔊"));

  const members = store.activeMembers().sort((a, b) => a.display_name.localeCompare(b.display_name));
  fillSelect($("#bonus-user"), members.map((u) => [u.id, u.display_name]));
  fillSelect($("#purge-room"), rooms());

  const count = (t) => store.db[t].size;
  setHTML($("#admin-stats"), [
    ["Membres actifs", store.activeMembers().length], ["En attente", store.rows("users").filter((u) => u.status === "pending").length],
    ["Messages", count("messages")], ["Groupes", count("groups")], ["Sondages", count("polls")], ["Sorties", count("outings")],
  ].map(([l, n]) => html`<div class="stat"><span class="stat-n">${n}</span><span class="stat-l">${l}</span></div>`));
}

export default {
  deps: ["settings", "messages", "users", "groups", "polls", "outings"],
  setTabs(list) { tabsList = list; },
  render() {
    return html`
      <header class="page-head"><h1>Administration</h1><p class="muted">Contrôle global de ClassConnect. Les comptes se gèrent dans l'onglet <a href="#/comptes">Comptes</a>.</p></header>
      <div class="stats" id="admin-stats"></div>
      <div class="grid-2">
        <section class="card"><h2>⚡ Réglages globaux</h2><div id="admin-settings"></div></section>
        <section class="card"><h2>🚩 Signalements</h2><div id="admin-reports"></div>
          <h3>🔇 Membres muets</h3><div id="admin-muted"></div></section>
      </div>
      <section class="card"><h2>🧰 Outils</h2>
        <form data-form="purge" data-keep class="inline-form"><select id="purge-room" name="room" aria-label="Salon"></select>
          <button type="submit">🧹 Vider ce salon</button></form>
        <form data-form="bonus" class="inline-form"><select id="bonus-user" name="id" aria-label="Membre"></select>
          <input name="points" type="number" required min="-1000" max="1000" placeholder="Points (ex. 20 ou -10)">
          <button type="submit">🏅 Donner des points</button></form>
        <div class="inline-form"><button data-act="resetLeague">♻️ Remettre le classement à zéro</button></div>
      </section>
      <section class="card"><div class="card-head"><h2>📜 Journal d'activité</h2><button class="btn-sm" data-act="logs">Actualiser</button></div>
        <div id="admin-logs"><div class="loading">Chargement…</div></div></section>`;
  },
  enter() { loadLogs(); },
  update(changed) {
    if (!changed || changed.has("settings") || changed.has("all")) drawSettings();
    drawReports();
  },
  forms: {
    settings(v) {
      const hiddenTabs = tabsList.map(([k]) => k).filter((k) => v["tab:" + k] !== "on");
      return admin("settings", { chatLocked: v.chatLocked === "on", banner: v.banner, hiddenTabs }, "Réglages enregistrés.");
    },
    async purge(v) {
      if (await ask({ title: "Vider ce salon ?", message: "Tous ses messages seront supprimés.", confirm: "Vider", danger: true }))
        await admin("purgeRoom", { room: v.room }, "Salon vidé.");
    },
    bonus: (v) => admin("bonus", { id: v.id, points: Number(v.points) }, "Points attribués."),
  },
  actions: {
    logs: loadLogs,
    clearReport: (d) => store.act("msg.clearReport", { id: d.id }),
    delMsg: (d) => store.act("msg.delete", { id: d.id }),
    mute: (d) => admin("mute", { id: d.uid, muted: true }, "Membre rendu muet."),
    unmute: (d) => admin("mute", { id: d.uid, muted: false }, "Le membre peut de nouveau écrire."),
    async resetLeague() {
      if (await ask({ title: "Remettre le classement à zéro ?", message: "Tous les points seront effacés.", confirm: "Remettre à zéro", danger: true }))
        await admin("resetLeague", {}, "Classement remis à zéro.");
    },
  },
};
