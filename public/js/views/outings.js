// Sorties laser game : inscriptions, équipes tirées au sort, manches et scores.
import { html, setHTML, $, empty, dueLabel, daysUntil, longDate, plural, ask } from "../lib.js";
import * as store from "../store.js";

const TEAMS = [["Rouge", "#e03131"], ["Bleue", "#1c7ed6"], ["Verte", "#2f9e44"], ["Jaune", "#f08c00"]];
const MISSIONS = [
  "⚔️ Équipe contre équipe : la base adverse doit tomber en premier.",
  "🚩 Capture de base : protège la tienne, prends celle des autres.",
  "👑 Le VIP : une personne par équipe est protégée, elle vaut double.",
  "🤫 Mission furtive : on joue sans parler, uniquement par signes.",
  "🎯 Chacun pour soi : le meilleur score individuel gagne.",
  "🛡️ Survivant : le dernier de l'équipe encore actif rapporte un bonus.",
];

function outing(o, rsvps) {
  const me = store.me();
  const staff = store.isStaff();
  const list = rsvps.filter((r) => r.outing_id === o.id);
  const going = list.some((r) => r.uid === me.id);
  const past = daysUntil(o.day) < 0;
  const pts = o.teams.map((_, i) => o.rounds.filter((r) => r.team === i).reduce((a, r) => a + r.points, 0));
  const best = Math.max(0, ...pts);
  return html`<article class="card outing">
    <div class="card-head"><h3>🎯 ${o.place}</h3>${past ? html`<span class="badge badge-off">terminée</span>` : html`<span class="badge badge-ok">${dueLabel(o.day)}</span>`}</div>
    <p class="muted">${longDate(new Date(o.day + "T00:00:00").getTime())}${o.hour ? ` à ${o.hour}` : ""}</p>
    ${o.note ? html`<p>${o.note}</p>` : ""}
    <div class="inline-form">
      ${past ? "" : html`<button class="${going ? "on" : "btn-primary"}" data-act="rsvp" data-id="${o.id}">${going ? "✓ Inscrit(e)" : "Je participe"}</button>`}
      <span class="muted small">${plural(list.length, "inscrit")}${list.length ? " : " + list.map((r) => store.nameOf(r.uid)).join(", ") : ""}</span>
    </div>
    ${o.teams.length ? html`<div class="teams">${o.teams.map((t, i) => html`
      <div class="team" style="--c:${TEAMS[i][1]}"><b>Équipe ${TEAMS[i][0]} · ${pts[i]} pts ${pts[i] === best && best > 0 ? "🏅" : ""}</b>
        <div class="small">${t.members.map((u) => store.nameOf(u)).join(", ")}</div></div>`)}</div>` : ""}
    ${staff ? html`<div class="staff-tools">
      <form data-form="teams" data-keep class="inline-form"><input type="hidden" name="id" value="${o.id}">
        <select name="count" aria-label="Nombre d'équipes"><option value="2">2 équipes</option><option value="3">3 équipes</option><option value="4">4 équipes</option></select>
        <button type="submit">🎲 Former les équipes</button>
        <button type="button" data-act="del" data-id="${o.id}">Supprimer la sortie</button></form>
      ${o.teams.length ? html`<form data-form="round" class="inline-form"><input type="hidden" name="id" value="${o.id}">
        <select name="team" aria-label="Équipe">${o.teams.map((_, i) => html`<option value="${i}">${TEAMS[i][0]}</option>`)}</select>
        <input name="points" type="number" required min="-1000" max="1000" placeholder="Points de la manche">
        <button class="btn-primary" type="submit">Ajouter la manche</button></form>` : ""}
    </div>` : ""}
  </article>`;
}

export default {
  deps: ["outings", "outing_rsvps", "users"],
  render() {
    return html`
      <header class="page-head"><h1>Sorties</h1></header>
      ${store.isStaff() ? html`<section class="card"><h2>Planifier une sortie laser game</h2>
        <form data-form="create" class="stack">
          <div class="inline-form"><input name="place" required minlength="2" maxlength="60" placeholder="Lieu (ex. Laser Arena)">
            <input name="day" type="date" required aria-label="Date"><input name="hour" type="time" aria-label="Heure"></div>
          <input name="note" maxlength="200" placeholder="Infos : rendez-vous, prix, autorisation parentale…">
          <button class="btn-primary" type="submit">Planifier</button>
        </form></section>` : ""}
      <div id="outings-list" class="stack"></div>
      <div class="grid-2">
        <section class="card"><h2>🎲 Mission laser game</h2><p id="mission" class="big-text">Prêt pour la mission ?</p>
          <button class="btn-primary" data-act="mission">Tirer une mission</button></section>
        <section class="card"><h2>🛡️ Règles et sécurité</h2><ul class="bullets">
          <li>Écoute le briefing de l'animateur.</li><li>On marche, on ne court pas, aucun contact physique.</li>
          <li>Respecte les zones interdites et les autres joueurs.</li>
          <li>Vérifie l'autorisation de l'établissement et des parents avant de partir.</li></ul></section>
      </div>`;
  },
  update() {
    const rsvps = store.rows("outing_rsvps");
    const list = store.rows("outings").sort((a, b) => (daysUntil(a.day) < 0) - (daysUntil(b.day) < 0) || a.day.localeCompare(b.day));
    setHTML($("#outings-list"), list.length ? list.map((o) => outing(o, rsvps)) : html`<section class="card">${empty("Aucune sortie prévue pour l'instant.", "🎯")}</section>`);
  },
  forms: {
    create: (v) => store.act("outing.create", v),
    teams: (v) => store.act("outing.teams", { id: v.id, count: Number(v.count) }),
    round: (v) => store.act("outing.round", { id: v.id, team: Number(v.team), points: Number(v.points) }),
  },
  actions: {
    rsvp: (d) => store.act("outing.rsvp", { id: d.id }),
    mission() { $("#mission").textContent = MISSIONS[Math.floor(Math.random() * MISSIONS.length)]; },
    async del(d) {
      if (await ask({ title: "Supprimer cette sortie ?", confirm: "Supprimer", danger: true })) await store.act("outing.delete", { id: d.id });
    },
  },
};
