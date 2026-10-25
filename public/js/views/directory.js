// Annuaire des membres actifs avec points et badges.
import { html, setHTML, $, empty } from "../lib.js";
import * as store from "../store.js";
import { avatar, badgesFor } from "./shared.js";

let query = "";

export default {
  deps: ["users", "league"],
  render() {
    return html`
      <header class="page-head"><h1>Annuaire</h1></header>
      <section class="card">
        <input type="search" placeholder="Rechercher un membre…" data-input="search" value="${query}" aria-label="Rechercher">
        <ul class="list members" id="dir-list"></ul></section>`;
  },
  update() {
    const q = query.toLowerCase();
    const list = store.activeMembers()
      .filter((u) => !q || u.display_name.toLowerCase().includes(q))
      .sort((a, b) => (b.role === "mod") - (a.role === "mod") || a.display_name.localeCompare(b.display_name));
    setHTML($("#dir-list"), list.length ? list.map((u) => {
      const pts = (store.db.league.get(u.id) || {}).pts || 0;
      return html`<li><div class="who">${avatar(u.id)}<div><b>${u.display_name}</b>${u.role === "mod" ? html` <span class="badge">⭐ modérateur</span>` : ""}
        <div class="muted small">${badgesFor(pts)}</div></div></div><b>${pts} pts</b></li>`;
    }) : empty("Aucun membre trouvé.", "📇"));
  },
  actions: {
    search(_, el) { query = el.value.trim(); this.update(); },
  },
};
