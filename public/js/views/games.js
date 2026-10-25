// Défis multijoueurs : duel de 6 questions ou défi quotidien sur plusieurs jours.
import { html, setHTML, $, api, toast, empty, longDate, plural, ask } from "../lib.js";
import * as store from "../store.js";
import { questionBlock, review } from "./quiz.js";

let current = "", timer = null, busy = false, feedback = null, lastState = null;

function statusLabel(g) {
  if (g.status === "waiting") return "En attente d'un adversaire";
  if (g.status === "complete") return g.winner ? (g.winner.draw ? "Terminé · égalité" : `Terminé · victoire de ${g.winner.name}`) : "Terminé";
  return "En cours";
}

async function loadList() {
  try {
    const { games } = await api("/api/game?op=list");
    const el = $("#game-list");
    if (!el) return;
    const mine = games.filter((g) => g.mine), open = games.filter((g) => !g.mine);
    const item = (g) => html`<li>
      <div><b>${g.type === "duel" ? "⚡ Duel" : `📅 Défi ${plural(g.days, "jour")}`}</b>
        <div class="muted small">${statusLabel(g)} · ${g.players.map((p) => `${p.name} (${p.score} pts)`).join(" vs ")}</div></div>
      <div class="actions">
        ${g.canJoin ? html`<button class="btn-sm btn-primary" data-act="join" data-id="${g.id}">Rejoindre</button>` : ""}
        ${g.mine ? html`<button class="btn-sm ${g.id === current ? "on" : ""}" data-act="open" data-id="${g.id}">${g.status === "complete" ? "Résultat" : "Ouvrir"}</button>` : ""}
        ${g.canCancel ? html`<button class="btn-sm" data-act="cancel" data-id="${g.id}">Annuler</button>` : ""}
      </div></li>`;
    setHTML(el, html`
      <h3>Défis à rejoindre</h3>
      ${open.length ? html`<ul class="list">${open.map(item)}</ul>` : empty("Aucun défi en attente. Lance le tien !", "🎮")}
      <h3>Mes parties</h3>
      ${mine.length ? html`<ul class="list">${mine.map(item)}</ul>` : empty("Tu n'as pas encore joué.", "🕹️")}`);
  } catch (e) {
    setHTML($("#game-list"), empty("Impossible de charger les défis : " + e.message, "⚠️"));
  }
}

async function refresh() {
  if (!current) { setHTML($("#game-detail"), ""); return; }
  try {
    const { state } = await api("/api/game?id=" + encodeURIComponent(current));
    draw(state);
  } catch (e) {
    current = "";
    setHTML($("#game-detail"), "");
    toast(e.message, "error");
  }
}

function draw(s) {
  lastState = s;
  const el = $("#game-detail");
  if (!el) return;
  const me = s.players[s.myIndex], opp = s.players[1 - s.myIndex];
  const daily = s.type === "daily";
  let info = "";
  if (s.status === "waiting") info = "En attente d'un autre membre… Partage le défi avec la classe !";
  else if (s.status === "complete") info = s.winner ? (s.winner.draw ? "🤝 Match nul !" : s.winner.uid === store.me().id ? "🎉 Tu as gagné !" : `🏅 Victoire de ${s.winner.name}`) : "Défi terminé.";
  else if (s.myProgress >= s.total) info = "Tu as terminé ! En attente de ton adversaire.";
  else if (daily && s.answered && !feedback) info = "Réponse du jour enregistrée. Reviens demain pour la suivante !";
  setHTML(el, html`<section class="card game">
    <div class="card-head"><h2>${daily ? "📅 Défi quotidien" : "⚡ Duel quiz"}</h2>
      <button class="icon-btn" data-act="close" aria-label="Fermer">✕</button></div>
    <div class="scoreboard">
      <div class="player"><span class="muted small">Toi</span><b>${me.name}</b><span class="score">${me.score} pts</span><span class="muted small">${me.progress} / ${s.total}</span></div>
      <div class="vs">VS</div>
      <div class="player"><span class="muted small">Adversaire</span><b>${opp ? opp.name : "?"}</b><span class="score">${opp ? opp.score + " pts" : "—"}</span><span class="muted small">${opp ? `${opp.progress} / ${s.total}` : "en attente"}</span></div>
    </div>
    ${daily && s.endsAt ? html`<p class="muted small center">Se termine le ${longDate(s.endsAt)}</p>` : ""}
    ${info ? html`<p class="game-info ${s.status === "complete" ? "big" : ""}">${info}</p>` : ""}
    ${questionBlock(s, feedback)}
    ${s.status === "complete" && !feedback ? review(s) : ""}
  </section>`);
}

function tick() {
  if (document.hidden || busy) return;
  loadList();
  // Pendant la correction d'une réponse, on ne remplace pas l'écran.
  if (current && !feedback) refresh();
}

export default {
  render() {
    return html`
      <header class="page-head"><h1>Défis</h1><p class="muted">Affronte un camarade. Chaque bonne réponse rapporte 10 points au classement de la League.</p></header>
      <section class="card"><h2>Nouveau défi</h2>
        <div class="inline-form">
          <button class="btn-primary" data-act="create" data-type="duel">⚡ Duel (6 questions)</button>
          <select id="game-days" aria-label="Durée du défi quotidien">
            <option value="1">1 jour</option><option value="3" selected>3 jours</option><option value="5">5 jours</option><option value="7">7 jours</option></select>
          <button data-act="create" data-type="daily">📅 Défi quotidien</button>
        </div></section>
      <div id="game-detail"></div>
      <section class="card" id="game-list"><div class="loading">Chargement…</div></section>`;
  },
  enter() {
    loadList();
    refresh();
    timer = setInterval(tick, 3000);
  },
  leave() { clearInterval(timer); timer = null; feedback = null; },
  actions: {
    async create(d) {
      const r = await api("/api/game", { action: "create", type: d.type, days: Number($("#game-days").value) });
      current = r.game.id;
      feedback = null;
      toast("Défi créé ! En attente d'un adversaire.", "success");
      await Promise.all([loadList(), refresh()]);
    },
    async join(d) {
      await api("/api/game", { action: "join", id: d.id });
      current = d.id;
      feedback = null;
      toast("C'est parti !", "success");
      await Promise.all([loadList(), refresh()]);
    },
    async cancel(d) {
      if (!(await ask({ title: "Annuler ce défi ?", confirm: "Annuler le défi", danger: true }))) return;
      await api("/api/game", { action: "cancel", id: d.id });
      if (current === d.id) current = "";
      await Promise.all([loadList(), refresh()]);
    },
    open(d) { current = d.id; feedback = null; refresh(); },
    close() { current = ""; feedback = null; setHTML($("#game-detail"), ""); },
    async answer(d) {
      if (busy || !lastState || !lastState.question) return;
      busy = true;
      document.querySelectorAll("#game-detail .option").forEach((b) => (b.disabled = true));
      try {
        const question = lastState.question;
        const r = await api("/api/game", { action: "answer", id: current, choice: Number(d.choice) });
        feedback = { index: question.index, question, choice: Number(d.choice), answer: r.answer, correct: r.correct };
        draw(r.state);
        store.sync(); // met à jour les points de League
        loadList();
      } finally {
        busy = false;
      }
    },
    nextQuestion() { feedback = null; lastState && draw(lastState); refresh(); },
  },
};
