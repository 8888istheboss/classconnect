// Boîte à idées : anonyme pour les élèves, votes, idées retenues par l'équipe.
import { html, setHTML, $, empty, ago, ask } from "../lib.js";
import * as store from "../store.js";

export default {
  deps: ["ideas", "idea_votes", "users"],
  render() {
    return html`
      <header class="page-head"><h1>Boîte à idées</h1><p class="muted">Propose une sortie, un jeu, une amélioration… et vote pour les idées des autres.</p></header>
      <section class="card">
        <form data-form="create" class="stack">
          <textarea name="body" required minlength="3" maxlength="200" rows="2" placeholder="Ton idée"></textarea>
          <div class="inline-form"><label class="check"><input type="checkbox" name="anon" checked> Rester anonyme auprès des élèves</label>
            <button class="btn-primary" type="submit">Proposer</button></div>
        </form></section>
      <div id="ideas-list" class="stack"></div>`;
  },
  update() {
    const me = store.me();
    const votes = store.rows("idea_votes");
    const count = (id) => votes.filter((v) => v.idea_id === id).length;
    const ideas = store.rows("ideas").sort((a, b) => b.retained - a.retained || count(b.id) - count(a.id) || b.created - a.created);
    setHTML($("#ideas-list"), ideas.length ? ideas.map((i) => {
      const voted = votes.some((v) => v.idea_id === i.id && v.uid === me.id);
      const who = i.anon ? (i.author ? `Anonyme (${i.author})` : "Anonyme") : store.nameOf(i.uid, i.author);
      return html`<article class="card idea ${i.retained ? "retained" : ""}">
        <p>${i.body}</p>
        <div class="card-foot"><span class="muted small">${who} · ${ago(i.created)}${i.retained ? html` · <b class="ok">✓ Retenue</b>` : ""}</span>
          <div class="actions">
            <button class="btn-sm ${voted ? "on" : ""}" data-act="vote" data-id="${i.id}" aria-pressed="${voted}">👍 ${count(i.id)}</button>
            ${store.isStaff() ? html`<button class="btn-sm" data-act="retain" data-id="${i.id}">${i.retained ? "Ne plus retenir" : "Retenir"}</button>` : ""}
            ${i.uid === me.id || store.isStaff() ? html`<button class="icon-btn" data-act="del" data-id="${i.id}" aria-label="Supprimer">✕</button>` : ""}
          </div></div></article>`;
    }) : empty("Aucune idée pour l'instant. Lance-toi !", "💡"));
  },
  forms: {
    create: (v) => store.act("idea.create", { body: v.body, anon: v.anon === "on" }),
  },
  actions: {
    vote: (d) => store.act("idea.vote", { id: d.id }),
    retain: (d) => store.act("idea.retain", { id: d.id }),
    async del(d) {
      if (await ask({ title: "Supprimer cette idée ?", confirm: "Supprimer", danger: true })) await store.act("idea.delete", { id: d.id });
    },
  },
};
