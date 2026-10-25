// Échange scolaire : donner, prêter, chercher du matériel.
import { html, setHTML, $, empty, ago, ask } from "../lib.js";
import * as store from "../store.js";

const KINDS = ["Je donne", "Je prête", "Je cherche"];
let kind = "";

export default {
  deps: ["market", "users"],
  render() {
    return html`
      <header class="page-head"><h1>Échange</h1><p class="muted">Rencontrez-vous toujours à l'école, jamais en privé.</p></header>
      <section class="card">
        <form data-form="create" class="inline-form">
          <select name="kind" aria-label="Type">${KINDS.map((k) => html`<option>${k}</option>`)}</select>
          <input name="body" required minlength="2" maxlength="120" placeholder="Ex. manuel de maths, calculatrice…">
          <button class="btn-primary" type="submit">Publier</button>
        </form></section>
      <section class="card">
        <div class="segmented" id="market-filter"></div>
        <ul class="list" id="market-list"></ul></section>`;
  },
  update() {
    const me = store.me();
    setHTML($("#market-filter"), ["", ...KINDS].map((k) =>
      html`<button class="${kind === k ? "on" : ""}" data-act="filter" data-kind="${k}">${k || "Tout"}</button>`));
    const list = store.rows("market").filter((m) => !kind || m.kind === kind).sort((a, b) => a.done - b.done || b.created - a.created);
    setHTML($("#market-list"), list.length ? list.map((m) => html`<li class="${m.done ? "done" : ""}">
      <div><span class="badge">${m.kind}</span> ${m.body}
        <div class="muted small">${store.nameOf(m.uid)} · ${ago(m.created)}${m.done ? " · réglé" : ""}</div></div>
      <div class="actions">
        ${m.uid === me.id ? html`<button class="btn-sm" data-act="toggle" data-id="${m.id}">${m.done ? "Rouvrir" : "✓ Réglé"}</button>` : ""}
        ${m.uid === me.id || store.isStaff() ? html`<button class="icon-btn" data-act="del" data-id="${m.id}" aria-label="Supprimer">✕</button>` : ""}
      </div></li>`) : empty("Aucune annonce.", "🔄"));
  },
  forms: {
    create: (v) => store.act("market.create", v),
  },
  actions: {
    filter(d) { kind = d.kind; this.update(); },
    toggle: (d) => store.act("market.toggle", { id: d.id }),
    async del(d) {
      if (await ask({ title: "Supprimer cette annonce ?", confirm: "Supprimer", danger: true })) await store.act("market.delete", { id: d.id });
    },
  },
};
