// Écran d'accueil : connexion, inscription (pseudo + mot de passe), compte en attente ou désactivé.
import { html, api, toast, longDate } from "../lib.js";
import * as store from "../store.js";

let tab = "login"; // login | register | teacher

function brand() {
  return html`<div class="auth-brand"><span class="brand-mark" aria-hidden="true">C</span>
    <div><div class="auth-title">ClassConnect</div><div class="muted">L'espace de ta classe</div></div></div>`;
}

function pendingView(me) {
  return html`<div class="auth-card">
    ${brand()}
    <div class="status-hero pending"><span aria-hidden="true">⏳</span>
      <h2>Compte en attente de validation</h2>
      <p>Bonjour <b>${me.displayName}</b> ! Ton compte a bien été créé le ${longDate(me.created)}.
      Le professeur doit l'accepter avant que tu puisses accéder à la classe.</p>
      <p class="muted small">Cette page se met à jour toute seule dès que ton compte est activé.</p>
    </div>
    <div class="stack">
      <button class="btn-primary" data-act="check">Vérifier maintenant</button>
      <button data-act="logout">Se déconnecter</button>
    </div>
  </div>`;
}

function disabledView(me) {
  return html`<div class="auth-card">
    ${brand()}
    <div class="status-hero disabled"><span aria-hidden="true">⛔</span>
      <h2>Compte désactivé</h2>
      <p>Le compte <b>${me.displayName}</b> a été désactivé par le professeur. Parle-lui pour le réactiver.</p>
    </div>
    <button data-act="logout" class="block">Se déconnecter</button>
  </div>`;
}

function formView() {
  const tabs = [["login", "Connexion"], ["register", "Créer un compte"], ["teacher", "Professeur"]];
  let body;
  if (tab === "teacher") {
    body = html`<form data-form="teacher" class="stack" data-keep>
      <label class="field"><span>Code professeur</span>
        <input name="code" type="password" required autocomplete="current-password" placeholder="Code confidentiel"></label>
      <button class="btn-primary" type="submit">Accéder à l'administration</button>
    </form>`;
  } else {
    const reg = tab === "register";
    body = html`<form data-form="${tab}" class="stack" data-keep>
      <label class="field"><span>Pseudo</span>
        <input name="username" required minlength="3" maxlength="20" autocomplete="username" autocapitalize="off"
          spellcheck="false" placeholder="ex. alex_42"></label>
      ${reg ? html`<p class="hint">3 à 20 caractères : lettres, chiffres, point, tiret ou underscore.</p>` : ""}
      <label class="field"><span>Mot de passe</span>
        <div class="input-group">
          <input name="password" type="password" required minlength="${reg ? 8 : 1}" maxlength="128"
            autocomplete="${reg ? "new-password" : "current-password"}" placeholder="${reg ? "8 caractères minimum" : "Ton mot de passe"}">
          <button type="button" class="icon-btn" data-act="reveal" aria-label="Afficher le mot de passe">👁</button>
        </div></label>
      ${reg ? html`<label class="field"><span>Confirmer le mot de passe</span>
        <input name="confirm" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label>
        <p class="hint">Après l'inscription, ton compte sera <b>inactif</b> jusqu'à sa validation par le professeur.</p>` : ""}
      <button class="btn-primary" type="submit">${reg ? "Créer mon compte" : "Se connecter"}</button>
    </form>`;
  }
  return html`<div class="auth-card">
    ${brand()}
    <div class="segmented" role="tablist">
      ${tabs.map(([k, label]) => html`<button role="tab" aria-selected="${tab === k}" class="${tab === k ? "on" : ""}" data-act="tab" data-tab="${k}">${label}</button>`)}
    </div>
    ${body}
  </div>`;
}

async function signedIn(user, message) {
  store.state.me = user;
  store.notify("me");
  toast(message, "success");
  await store.start();
}

export default {
  render() {
    const me = store.me();
    if (me && me.status === "pending") return pendingView(me);
    if (me && me.status === "disabled") return disabledView(me);
    return formView();
  },
  actions: {
    tab(d) { tab = d.tab; this.rerender(); },
    reveal(_, el) {
      const input = el.parentElement.querySelector("input");
      input.type = input.type === "password" ? "text" : "password";
    },
    async check() {
      await store.sync();
      if (store.me() && store.me().status === "pending") toast("Toujours en attente de validation.");
    },
  },
  forms: {
    async login(v) {
      const r = await api("/api/auth", { action: "login", username: v.username, password: v.password });
      await signedIn(r.user, r.user.status === "active" ? `Bienvenue, ${r.user.displayName} !` : "Connexion réussie.");
    },
    async register(v) {
      if (v.password !== v.confirm) throw new Error("Les deux mots de passe ne correspondent pas.");
      const r = await api("/api/auth", { action: "register", username: v.username, password: v.password });
      tab = "login";
      await signedIn(r.user, "Compte créé ! Il attend maintenant la validation du professeur.");
    },
    async teacher(v) {
      const r = await api("/api/auth", { action: "adminLogin", code: v.code });
      await signedIn(r.user, "Bienvenue dans l'administration.");
    },
  },
};
