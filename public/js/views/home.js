// Accueil : bienvenue, nouveautés, annonces, échéances.
import { html, setHTML, $, ago, dueLabel, daysUntil, empty } from "../lib.js";
import * as store from "../store.js";
import { unreadCount, rank, badgesFor } from "./shared.js";

export default {
  deps: ["announcements", "messages", "polls", "poll_votes", "events", "prefs", "users", "league", "outings"],
  render() {
    const me = store.me();
    return html`
      <section class="hero card">
        <div><div class="eyebrow">Espace de classe</div>
          <h1>Bonjour ${me.displayName} ${me.emoji}</h1>
          <p class="muted">Retrouve les annonces, discute avec la classe et lance un défi quand tu veux.</p></div>
        <div class="stats compact" id="home-stats"></div>
      </section>
      <div class="grid-2">
        <section class="card"><h2>🔔 Pour toi</h2><div id="home-news"></div></section>
        <section class="card"><h2>📅 Prochaines échéances</h2><div id="home-due"></div></section>
      </div>
      <section class="card"><h2>📢 Annonces</h2>
        ${store.isStaff() ? html`<form data-form="ann" class="inline-form">
          <input name="body" required maxlength="300" placeholder="Publier une annonce pour toute la classe">
          <button class="btn-primary" type="submit">Publier</button></form>` : ""}
        <div id="home-ann"></div></section>`;
  },
  update() {
    const me = store.me();
    const league = store.db.league.get(me.id);
    const pos = rank(me.id);
    setHTML($("#home-stats"), html`
      <div class="stat"><span class="stat-n">${store.activeMembers().length}</span><span class="stat-l">membres</span></div>
      <div class="stat"><span class="stat-n">${league ? league.pts : 0}</span><span class="stat-l">mes points</span></div>
      <div class="stat"><span class="stat-n">${pos ? "#" + pos : "—"}</span><span class="stat-l">classement</span></div>`);

    const unread = unreadCount();
    const votes = new Set(store.rows("poll_votes").filter((v) => v.uid === me.id).map((v) => v.poll_id));
    const openPolls = store.rows("polls").filter((p) => !votes.has(p.id)).length;
    const { done } = store.prefs();
    const soon = store.rows("events").filter((e) => { const n = daysUntil(e.due); return n >= 0 && n <= 3 && !done[e.id]; });
    const outings = store.rows("outings").filter((o) => daysUntil(o.day) >= 0).length;
    const items = [
      ["💬", "Messages non lus", unread, "chat"],
      ["🗳️", "Sondages sans ton vote", openPolls, "sondages"],
      ["📅", "Échéances dans les 3 jours", soon.length, "planning"],
      ["🎯", "Sorties à venir", outings, "sorties"],
    ];
    setHTML($("#home-news"), html`<ul class="list">${items.map(([icon, label, n, route]) => html`
      <li><a href="#/${route}" class="list-link"><span>${icon} ${label}</span><span class="count ${n ? "hot" : ""}">${n}</span></a></li>`)}</ul>
      ${league ? html`<p class="muted small">Tes badges : ${badgesFor(league.pts)}</p>` : ""}`);

    const upcoming = store.rows("events").filter((e) => daysUntil(e.due) >= 0).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);
    setHTML($("#home-due"), upcoming.length
      ? html`<ul class="list">${upcoming.map((e) => html`<li class="${done[e.id] ? "done" : ""}">
          <span>${e.kind === "Contrôle" ? "📝" : e.kind === "Événement" ? "🎉" : "✏️"} ${e.title}</span>
          <span class="muted small">${dueLabel(e.due)}</span></li>`)}</ul>`
      : empty("Rien de prévu pour l'instant.", "🌤️"));

    const ann = store.rows("announcements").sort((a, b) => b.created - a.created);
    setHTML($("#home-ann"), ann.length
      ? html`<ul class="list">${ann.map((a) => html`<li><div><div>${a.body}</div>
          <div class="muted small">${a.author} · ${ago(a.created)}</div></div>
          ${store.isStaff() ? html`<button class="icon-btn" data-act="delAnn" data-id="${a.id}" aria-label="Supprimer">✕</button>` : ""}</li>`)}</ul>`
      : empty("Aucune annonce pour le moment.", "📭"));
  },
  forms: {
    ann: (v) => store.act("ann.create", { body: v.body }),
  },
  actions: {
    delAnn: (d) => store.act("ann.delete", { id: d.id }),
  },
};
