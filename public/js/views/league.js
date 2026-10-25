// League : défi de la semaine, quiz solo noté par le serveur, classement et badges.
import { html, setHTML, $, api, empty } from "../lib.js";
import * as store from "../store.js";
import { questionBlock, review } from "./quiz.js";
import { leaderboard, badgesFor, avatar } from "./shared.js";

const WEEKLY = [
  "Poser une question utile dans le salon Devoirs",
  "Expliquer une notion à un camarade",
  "Créer trois fiches de révision",
  "Gagner un duel contre un camarade",
  "Proposer une idée dans la boîte à idées",
  "Répondre à tous les sondages de la semaine",
];
let solo = null, feedback = null, busy = false;

function drawQuiz() {
  const el = $("#solo");
  if (!el) return;
  if (!solo) {
    setHTML(el, html`<p class="muted">6 questions de culture générale. Chaque bonne réponse rapporte 10 points.</p>
      <button class="btn-primary" data-act="start">Commencer le quiz</button>`);
    return;
  }
  if (solo.status === "complete" && !feedback) {
    const me = solo.players[0];
    setHTML(el, html`<div class="result"><div class="big">${me.score / 10} / ${solo.total}</div>
      <p>${me.score >= 50 ? "Excellent ! 🌟" : me.score >= 30 ? "Bien joué ! 👏" : "Continue de t'entraîner 💪"} · +${me.score} points</p>
      ${review(solo)}
      <button class="btn-primary" data-act="start">Rejouer</button></div>`);
    return;
  }
  setHTML(el, questionBlock(solo, feedback));
}

function drawBoard() {
  const me = store.me();
  const board = leaderboard();
  const mine = store.db.league.get(me.id);
  setHTML($("#board"), html`
    ${mine ? html`<p class="muted small">Toi : <b>${mine.pts} pts</b> · ${badgesFor(mine.pts)}</p>` : ""}
    ${board.length ? html`<ol class="leaderboard">${board.slice(0, 20).map((l, i) => html`
      <li class="${l.uid === me.id ? "me" : ""}">
        <span class="rank">${["🥇", "🥈", "🥉"][i] || i + 1}</span>${avatar(l.uid, "sm")}
        <span class="name">${store.nameOf(l.uid)}${l.uid === me.id ? " (toi)" : ""}</span>
        <span class="muted small">${l.played} partie${l.played > 1 ? "s" : ""}</span><b>${l.pts} pts</b></li>`)}</ol>`
      : empty("Joue un quiz pour apparaître dans le classement.", "🏆")}`);
}

export default {
  deps: ["league", "users"],
  render() {
    const week = WEEKLY[Math.floor(Date.now() / 6048e5) % WEEKLY.length];
    return html`
      <header class="page-head"><h1>League</h1><p class="muted">Gagne des points avec les quiz et les défis, débloque des badges.</p></header>
      <section class="card highlight"><h2>🎯 Défi de la semaine</h2><p>${week}</p></section>
      <div class="grid-2">
        <section class="card"><h2>🧠 Quiz solo</h2><div id="solo"></div></section>
        <section class="card"><h2>🏆 Classement</h2><div id="board"></div></section>
      </div>`;
  },
  update() { drawQuiz(); drawBoard(); },
  leave() { feedback = null; },
  actions: {
    async start() {
      const r = await api("/api/game", { action: "create", type: "solo" });
      solo = (await api("/api/game?id=" + r.game.id)).state;
      feedback = null;
      drawQuiz();
    },
    async answer(d) {
      if (busy || !solo || !solo.question) return;
      busy = true;
      document.querySelectorAll("#solo .option").forEach((b) => (b.disabled = true));
      try {
        const question = solo.question;
        const r = await api("/api/game", { action: "answer", id: solo.id, choice: Number(d.choice) });
        feedback = { index: question.index, question, choice: Number(d.choice), answer: r.answer, correct: r.correct };
        solo = r.state;
        drawQuiz();
        store.sync();
      } finally {
        busy = false;
      }
    },
    nextQuestion() { feedback = null; drawQuiz(); },
  },
};
