// Flashcards personnelles : retourner, naviguer au clavier, filtrer par matière, mélanger.
import { html, setHTML, $, empty, shuffle, ask } from "../lib.js";
import * as store from "../store.js";

let order = [], index = 0, flipped = false, subject = "";

function deck() {
  const cards = store.rows("cards").filter((c) => !subject || c.subject === subject);
  const ids = new Set(cards.map((c) => c.id));
  // Garde l'ordre courant (mélangé ou non), ajoute les nouvelles fiches à la fin.
  order = order.filter((id) => ids.has(id));
  for (const c of cards.sort((a, b) => a.created - b.created)) if (!order.includes(c.id)) order.push(c.id);
  if (index >= order.length) index = Math.max(0, order.length - 1);
  return order.map((id) => store.db.cards.get(id));
}

function onKey(e) {
  if (!$("#flash") || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if (e.key === "ArrowRight") move(1);
  else if (e.key === "ArrowLeft") move(-1);
  else if (e.key === " ") { e.preventDefault(); flipped = !flipped; draw(); }
}
function move(step) {
  if (!order.length) return;
  index = (index + step + order.length) % order.length;
  flipped = false;
  draw();
}

function draw() {
  const cards = deck();
  const subjects = [...new Set(store.rows("cards").map((c) => c.subject))].sort();
  setHTML($("#card-subjects"), html`<option value="">Toutes les matières (${store.db.cards.size})</option>
    ${subjects.map((s) => html`<option ${s === subject ? "selected" : ""}>${s}</option>`)}`);
  const c = cards[index];
  setHTML($("#flash"), c
    ? html`<div class="muted small">${c.subject} · ${index + 1} / ${cards.length}</div>
      <button class="flashcard ${flipped ? "flipped" : ""}" data-act="flip" aria-label="Retourner la fiche">
        <span class="flash-side">${flipped ? "Réponse" : "Question"}</span>
        <span class="flash-text">${flipped ? c.answer : c.question}</span></button>
      <div class="actions center">
        <button data-act="prev" aria-label="Précédente">◀</button>
        <button class="btn-primary" data-act="flip">Retourner</button>
        <button data-act="next" aria-label="Suivante">▶</button>
        <button data-act="shuffle">🔀 Mélanger</button>
        <button data-act="del" data-id="${c.id}">Supprimer</button>
      </div>
      <p class="muted small center">Astuce : ← → pour naviguer, espace pour retourner.</p>`
    : empty("Aucune fiche. Ajoute ta première fiche ci-dessous.", "🃏"));
}

export default {
  deps: ["cards"],
  render() {
    return html`
      <header class="page-head"><h1>Révisions</h1><p class="muted">Tes fiches sont privées : personne d'autre ne les voit.</p></header>
      <section class="card"><div class="card-head"><h2>🃏 Flashcards</h2>
        <select id="card-subjects" data-change="subject" aria-label="Matière"></select></div>
        <div id="flash"></div></section>
      <section class="card"><h2>➕ Nouvelle fiche</h2>
        <form data-form="add" class="stack">
          <div class="inline-form"><input name="subject" maxlength="40" placeholder="Matière (ex. Histoire)" list="subjects-list">
            <datalist id="subjects-list">${[...new Set(store.rows("cards").map((c) => c.subject))].map((s) => html`<option value="${s}">`)}</datalist></div>
          <textarea name="question" required maxlength="300" rows="2" placeholder="Question"></textarea>
          <textarea name="answer" required maxlength="300" rows="2" placeholder="Réponse"></textarea>
          <button class="btn-primary" type="submit">Ajouter la fiche</button>
        </form></section>`;
  },
  update: draw,
  enter() { document.addEventListener("keydown", onKey); },
  leave() { document.removeEventListener("keydown", onKey); },
  forms: {
    add: (v) => store.act("card.create", v),
  },
  actions: {
    flip() { flipped = !flipped; draw(); },
    prev: () => move(-1),
    next: () => move(1),
    shuffle() { order = shuffle(order); index = 0; flipped = false; draw(); },
    subject(_, el) { subject = el.value; index = 0; flipped = false; order = []; draw(); },
    async del(d) {
      if (await ask({ title: "Supprimer cette fiche ?", confirm: "Supprimer", danger: true })) {
        flipped = false;
        await store.act("card.delete", { id: d.id });
      }
    },
  },
};
