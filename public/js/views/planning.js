// Planning partagé : devoirs, contrôles, événements. Les cases « fait » sont personnelles.
import { html, setHTML, $, empty, dueLabel, daysUntil, longDate, ask } from "../lib.js";
import * as store from "../store.js";

const ICON = { Devoir: "✏️", Contrôle: "📝", Événement: "🎉" };
let showPast = false;

function item(e, done) {
  const n = daysUntil(e.due);
  const canDelete = e.uid === store.me().id || store.isStaff();
  return html`<li class="event ${done ? "done" : ""} ${n >= 0 && n <= 2 && !done ? "urgent" : ""}">
    <label class="check"><input type="checkbox" data-change="done" data-id="${e.id}" ${done ? "checked" : ""}>
      <span>${ICON[e.kind] || "✏️"} <b>${e.title}</b></span></label>
    <span class="muted small">${e.kind} · ${longDate(new Date(e.due + "T00:00:00").getTime())} · ${dueLabel(e.due)}</span>
    ${canDelete ? html`<button class="icon-btn" data-act="del" data-id="${e.id}" aria-label="Supprimer">✕</button>` : ""}
  </li>`;
}

export default {
  deps: ["events", "prefs"],
  render() {
    const today = new Date().toLocaleDateString("sv-SE"); // AAAA-MM-JJ en heure locale
    return html`
      <header class="page-head"><h1>Planning</h1><p class="muted">Le planning est partagé avec toute la classe. Coche ce que tu as terminé.</p></header>
      <section class="card"><h2>➕ Ajouter</h2>
        <form data-form="add" class="inline-form">
          <select name="kind" aria-label="Type"><option>Devoir</option><option>Contrôle</option><option>Événement</option></select>
          <input name="title" required maxlength="80" placeholder="Matière / titre">
          <input name="due" type="date" required min="${today}" aria-label="Date">
          <button class="btn-primary" type="submit">Ajouter</button>
        </form></section>
      <section class="card"><div class="card-head"><h2>📅 À venir</h2>
        <label class="small"><input type="checkbox" data-change="past" ${showPast ? "checked" : ""}> Afficher les échéances passées</label></div>
        <ul class="list" id="plan-list"></ul></section>`;
  },
  update() {
    const { done } = store.prefs();
    const list = store.rows("events")
      .filter((e) => showPast || daysUntil(e.due) >= 0)
      .sort((a, b) => a.due.localeCompare(b.due));
    setHTML($("#plan-list"), list.length ? list.map((e) => item(e, !!done[e.id])) : empty("Rien de prévu. Profite !", "🌤️"));
  },
  forms: {
    add: (v) => store.act("event.create", v),
  },
  actions: {
    done(d, el) { store.updatePrefs((p) => { if (el.checked) p.done[d.id] = true; else delete p.done[d.id]; }); },
    past(_, el) { showPast = el.checked; this.update(); },
    async del(d) {
      if (await ask({ title: "Supprimer cette échéance ?", confirm: "Supprimer", danger: true })) await store.act("event.delete", { id: d.id });
    },
  },
};
