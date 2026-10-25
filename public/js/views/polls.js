// Sondages : un vote par personne, modifiable ; recliquer retire le vote.
import { html, setHTML, $, empty, ago, plural, ask } from "../lib.js";
import * as store from "../store.js";

export default {
  deps: ["polls", "poll_votes", "users"],
  render() {
    return html`
      <header class="page-head"><h1>Sondages</h1></header>
      <section class="card"><h2>➕ Nouveau sondage</h2>
        <form data-form="create" class="stack">
          <input name="question" required minlength="3" maxlength="140" placeholder="Question (ex. Où va-t-on en sortie ?)">
          <textarea name="options" required rows="3" placeholder="Une option par ligne (2 à 8 options)"></textarea>
          <button class="btn-primary" type="submit">Créer le sondage</button>
        </form></section>
      <div id="polls-list" class="stack"></div>`;
  },
  update() {
    const me = store.me();
    const votes = store.rows("poll_votes");
    const polls = store.rows("polls").sort((a, b) => b.created - a.created);
    setHTML($("#polls-list"), polls.length ? polls.map((p) => {
      const vs = votes.filter((v) => v.poll_id === p.id);
      const mine = vs.find((v) => v.uid === me.id);
      const max = Math.max(0, ...p.options.map((_, i) => vs.filter((v) => v.choice === i).length));
      return html`<article class="card poll">
        <div class="card-head"><h3>${p.question}</h3>
          ${p.uid === me.id || store.isStaff() ? html`<button class="icon-btn" data-act="del" data-id="${p.id}" aria-label="Supprimer">✕</button>` : ""}</div>
        <p class="muted small">par ${store.nameOf(p.uid)} · ${ago(p.created)} · ${plural(vs.length, "vote")}${mine ? "" : " · tu n'as pas encore voté"}</p>
        <div class="poll-options">${p.options.map((o, i) => {
          const n = vs.filter((v) => v.choice === i).length;
          const pct = vs.length ? Math.round((n / vs.length) * 100) : 0;
          return html`<button class="poll-option ${mine && mine.choice === i ? "on" : ""} ${n && n === max ? "lead" : ""}" data-act="vote" data-id="${p.id}" data-choice="${i}">
            <span class="poll-bar" style="width:${pct}%"></span>
            <span class="poll-label">${mine && mine.choice === i ? "✓ " : ""}${o}</span><span class="poll-pct">${pct}% · ${n}</span></button>`;
        })}</div></article>`;
    }) : empty("Aucun sondage pour le moment.", "🗳️"));
  },
  forms: {
    create: (v) => store.act("poll.create", { question: v.question, options: v.options.split("\n") }),
  },
  actions: {
    vote: (d) => store.act("poll.vote", { id: d.id, choice: Number(d.choice) }),
    async del(d) {
      if (await ask({ title: "Supprimer ce sondage ?", confirm: "Supprimer", danger: true })) await store.act("poll.delete", { id: d.id });
    },
  },
};
