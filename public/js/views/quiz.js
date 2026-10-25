// Affichage commun des questions de quiz (défis et League).
import { html } from "../lib.js";

// feedback = { index, choice, answer, correct } après une réponse.
export function questionBlock(s, feedback) {
  if (feedback && (!s.question || s.question.index !== feedback.index)) {
    const q = feedback.question;
    return html`<div class="quiz">
      <div class="muted small">Question ${feedback.index + 1}${s.total ? ` / ${s.total}` : ""}</div>
      <h3>${q.prompt}</h3>
      <div class="options">${q.options.map((o, i) => html`
        <button class="option ${i === feedback.answer ? "good" : i === feedback.choice ? "bad" : ""}" disabled>${o}</button>`)}</div>
      <p class="feedback ${feedback.correct ? "ok" : "ko"}">${feedback.correct ? "✓ Bonne réponse ! +10 points" : "✗ Raté… la bonne réponse est en vert."}</p>
      <button class="btn-primary" data-act="nextQuestion">${s.status === "complete" ? "Voir le résultat →" : s.question ? "Question suivante →" : "Continuer"}</button>
    </div>`;
  }
  if (!s.question) return "";
  const q = s.question;
  return html`<div class="quiz">
    <div class="muted small">${s.type === "daily" ? `Jour ${q.index + 1} / ${s.total}` : `Question ${q.index + 1} / ${s.total}`}</div>
    <h3>${q.prompt}</h3>
    <div class="options">${q.options.map((o, i) => html`<button class="option" data-act="answer" data-choice="${i}">${o}</button>`)}</div>
  </div>`;
}

export function review(s) {
  if (!s.review) return "";
  return html`<details class="review"><summary>Voir la correction</summary><ol>${s.review.map((r) => html`
    <li><b>${r.prompt}</b><br>
      <span class="ok">✓ ${r.options[r.answer]}</span>
      ${r.choice != null && r.choice !== r.answer ? html` · <span class="ko">ta réponse : ${r.options[r.choice]}</span>` : ""}
      ${r.choice == null ? html` · <span class="muted">sans réponse</span>` : ""}</li>`)}</ol></details>`;
}
