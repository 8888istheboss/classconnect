// Groupes de travail avec salon de discussion privé.
import { html, setHTML, $, empty, ask, plural } from "../lib.js";
import * as store from "../store.js";

export default {
  deps: ["groups", "group_members", "users"],
  render() {
    return html`
      <header class="page-head"><h1>Groupes</h1><p class="muted">Crée un groupe pour un exposé ou un projet : il aura son propre salon de discussion.</p></header>
      <section class="card"><h2>➕ Nouveau groupe</h2>
        <form data-form="create" class="inline-form">
          <input name="name" required minlength="2" maxlength="40" placeholder="Nom (ex. Exposé d'histoire)">
          <input name="descr" maxlength="120" placeholder="Description (facultatif)">
          <button class="btn-primary" type="submit">Créer</button>
        </form></section>
      <section id="groups-list" class="cards-grid"></section>`;
  },
  update() {
    const me = store.me();
    const members = store.rows("group_members");
    const groups = store.rows("groups").sort((a, b) => b.created - a.created);
    setHTML($("#groups-list"), groups.length ? groups.map((g) => {
      const list = members.filter((m) => m.group_id === g.id);
      const inside = list.some((m) => m.uid === me.id);
      const canDelete = g.uid === me.id || store.isStaff();
      return html`<article class="card group">
        <h3>👥 ${g.name}</h3>
        ${g.descr ? html`<p class="muted">${g.descr}</p>` : ""}
        <p class="small">${plural(list.length, "membre")} : ${list.map((m) => store.nameOf(m.uid)).join(", ") || "—"}</p>
        <div class="actions">
          ${inside
            ? html`<a class="btn btn-primary btn-sm" href="#/chat" data-act="open" data-id="${g.id}">Ouvrir le salon</a>
                   <button class="btn-sm" data-act="leave" data-id="${g.id}">Quitter</button>`
            : html`<button class="btn-sm btn-primary" data-act="join" data-id="${g.id}">Rejoindre</button>`}
          ${canDelete ? html`<button class="btn-sm" data-act="del" data-id="${g.id}">Supprimer</button>` : ""}
        </div></article>`;
    }) : empty("Aucun groupe pour l'instant. Crée le premier !", "👥"));
  },
  forms: {
    create: (v) => store.act("group.create", { name: v.name, descr: v.descr }),
  },
  actions: {
    open(d) { sessionStorage.setItem("cc-room", "g:" + d.id); location.hash = "#/chat"; },
    async join(d) {
      await store.act("group.join", { id: d.id });
      // Recharge pour récupérer l'historique du salon du groupe.
      store.reset();
      await store.sync();
    },
    leave: (d) => store.act("group.leave", { id: d.id }),
    async del(d) {
      if (await ask({ title: "Supprimer ce groupe ?", message: "Son salon ne sera plus accessible.", confirm: "Supprimer", danger: true }))
        await store.act("group.delete", { id: d.id });
    },
  },
};
