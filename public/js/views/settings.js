// Réglages : profil, mot de passe, thème, règles de la classe.
import { html, api, toast } from "../lib.js";
import * as store from "../store.js";

const EMOJIS = ["🙂", "😎", "🤓", "🦊", "🐼", "🐱", "🦁", "🐸", "🚀", "⚽", "🏀", "🎨", "🎵", "🎮", "📚", "🌟", "🔥", "🌈"];
const THEMES = [["auto", "Automatique"], ["light", "Clair"], ["dark", "Sombre"]];

export function applyTheme(theme) {
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
export function getTheme() {
  try { return localStorage.getItem("cc-theme") || "auto"; } catch { return "auto"; }
}

export default {
  render() {
    const me = store.me();
    const theme = getTheme();
    return html`
      <header class="page-head"><h1>Réglages</h1></header>
      ${me.isSA ? html`<section class="card"><h2>👑 Compte professeur</h2>
        <p class="muted">Tu es connecté avec le code professeur. Gère les élèves dans l'onglet <a href="#/comptes">Comptes</a>.</p></section>`
      : html`<section class="card"><h2>👤 Mon profil</h2>
        <form data-form="profile" data-keep class="stack">
          <label class="field"><span>Nom affiché</span><input name="displayName" required minlength="2" maxlength="20" value="${me.displayName}"></label>
          <p class="hint">Ton identifiant de connexion reste <b>${me.username}</b>. Utilise un pseudo, pas ton vrai nom.</p>
          <fieldset><legend>Avatar</legend><div class="emoji-grid">
            ${EMOJIS.map((e) => html`<label class="emoji-pick"><input type="radio" name="emoji" value="${e}" ${e === me.emoji ? "checked" : ""}><span>${e}</span></label>`)}
          </div></fieldset>
          <label class="field inline"><span>Couleur</span><input name="color" type="color" value="${me.color}"></label>
          <button class="btn-primary" type="submit">Enregistrer le profil</button>
        </form></section>
      <section class="card"><h2>🔑 Mot de passe</h2>
        <form data-form="password" class="stack">
          <input type="text" name="username" value="${me.username}" autocomplete="username" hidden>
          <label class="field"><span>Mot de passe actuel</span><input name="current" type="password" required autocomplete="current-password"></label>
          <label class="field"><span>Nouveau mot de passe</span><input name="next" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label>
          <label class="field"><span>Confirmer</span><input name="confirm" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label>
          <button type="submit">Changer le mot de passe</button>
        </form></section>`}
      <section class="card"><h2>🎨 Apparence</h2>
        <div class="segmented">${THEMES.map(([k, label]) => html`<button class="${theme === k ? "on" : ""}" data-act="theme" data-theme="${k}">${label}</button>`)}</div></section>
      <section class="card"><h2>🔒 Règles de la classe</h2>
        <ul class="bullets"><li>Reste respectueux avec tout le monde.</li>
          <li>Ne partage aucune information privée (adresse, téléphone, photos de camarades sans accord).</li>
          <li>Signale 🚩 tout message gênant : un modérateur le vérifiera.</li></ul></section>
      <button class="block" data-act="logout">Se déconnecter</button>`;
  },
  forms: {
    async profile(v) {
      const r = await api("/api/auth", { action: "profile", displayName: v.displayName, emoji: v.emoji || "🙂", color: v.color });
      store.state.me = r.user;
      store.notify("me");
      toast("Profil enregistré.", "success");
    },
    async password(v) {
      if (v.next !== v.confirm) throw new Error("Les deux nouveaux mots de passe ne correspondent pas.");
      await api("/api/auth", { action: "password", current: v.current, next: v.next });
      toast("Mot de passe modifié. Tes autres appareils ont été déconnectés.", "success");
    },
  },
  actions: {
    theme(d) {
      try { localStorage.setItem("cc-theme", d.theme); } catch { /* stockage indisponible */ }
      applyTheme(d.theme);
      this.rerender();
    },
  },
};
