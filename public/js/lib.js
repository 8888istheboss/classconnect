// Utilitaires partagés : HTML sûr, appels API, notifications, dates.

/* ---------- HTML échappé automatiquement ---------- */
class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
export const raw = (s) => new Raw(String(s));
function part(v) {
  if (v == null || v === false || v === true) return "";
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(part).join("");
  return esc(v);
}
// Usage : html`<b>${nom}</b>` — toute valeur interpolée est échappée sauf raw()/html imbriqué.
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return new Raw(out);
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function setHTML(el, content) {
  if (el) el.innerHTML = part(content);
}

/* ---------- API ---------- */
export async function api(path, body) {
  const opts = { method: body ? "POST" : "GET", credentials: "same-origin", headers: {} };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw Object.assign(new Error("Connexion impossible. Vérifie ton réseau."), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Erreur ${res.status}`), { status: res.status });
  return data;
}

/* ---------- Notifications ---------- */
export function toast(message, type = "info") {
  const box = $("#toasts");
  if (!box) return;
  const el = document.createElement("div");
  el.className = "toast toast-" + type;
  el.textContent = message;
  box.append(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, type === "error" ? 5000 : 3200);
}

// Boîte de dialogue de confirmation ; renvoie une promesse (true / false, ou la valeur saisie).
export function ask({ title, message = "", confirm = "Confirmer", danger = false, input = null }) {
  const dlg = $("#dialog");
  return new Promise((resolve) => {
    dlg.innerHTML = String(html`
      <form method="dialog" class="dialog-body">
        <h3>${title}</h3>
        ${message ? html`<p class="muted">${message}</p>` : ""}
        ${input ? html`<input name="value" type="${input.type || "text"}" placeholder="${input.placeholder || ""}"
            minlength="${input.minlength || 0}" maxlength="${input.maxlength || 200}" required autocomplete="off">` : ""}
        <div class="dialog-actions">
          <button type="button" value="cancel" data-cancel>Annuler</button>
          <button type="submit" value="ok" class="${danger ? "btn-danger" : "btn-primary"}">${confirm}</button>
        </div>
      </form>`);
    const form = dlg.querySelector("form");
    const done = (v) => { dlg.close(); resolve(v); };
    dlg.querySelector("[data-cancel]").onclick = () => done(input ? null : false);
    dlg.oncancel = (e) => { e.preventDefault(); done(input ? null : false); };
    form.onsubmit = (e) => {
      e.preventDefault();
      done(input ? form.value.value : true);
    };
    dlg.showModal();
    (dlg.querySelector("input") || dlg.querySelector("[type=submit]")).focus();
  });
}

/* ---------- Dates ---------- */
const fmt = (opts) => new Intl.DateTimeFormat("fr-FR", opts);
const F_TIME = fmt({ hour: "2-digit", minute: "2-digit" });
const F_DAY = fmt({ weekday: "short", day: "numeric", month: "short" });
const F_FULL = fmt({ day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const F_DATE = fmt({ day: "numeric", month: "long", year: "numeric" });

export const time = (ms) => (ms ? F_TIME.format(ms) : "");
export const fullDate = (ms) => (ms ? F_FULL.format(ms) : "—");
export const longDate = (ms) => (ms ? F_DATE.format(ms) : "—");
export function dayLabel(ms) {
  const d = new Date(ms), today = new Date();
  const diff = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 864e5);
  return diff === 0 ? "Aujourd'hui" : diff === 1 ? "Hier" : F_DAY.format(d);
}
export function ago(ms) {
  if (!ms) return "jamais";
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  if (s < 86400 * 30) return `il y a ${Math.round(s / 86400)} j`;
  return longDate(ms);
}
// "2025-03-14" → nombre de jours avant l'échéance (négatif si passée)
export function daysUntil(isoDay) {
  const target = new Date(isoDay + "T00:00:00");
  const today = new Date(new Date().toDateString());
  return Math.round((target - today) / 864e5);
}
export function dueLabel(isoDay) {
  const n = daysUntil(isoDay);
  return n < 0 ? "passé" : n === 0 ? "aujourd'hui" : n === 1 ? "demain" : `dans ${n} jours`;
}
export const plural = (n, word, many = word + "s") => `${n} ${n > 1 ? many : word}`;

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
export function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function empty(text, icon = "✨") {
  return html`<div class="empty"><span aria-hidden="true">${icon}</span><p>${text}</p></div>`;
}
