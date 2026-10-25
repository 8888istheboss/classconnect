// Chat : salons, réponses, réactions, mentions, épingles, signalements.
import { html, raw, esc, setHTML, $, time, dayLabel, empty, ask, toast } from "../lib.js";
import * as store from "../store.js";
import { rooms, unreadByRoom, avatar } from "./shared.js";

const REACTIONS = ["👍", "❤️", "😂", "🔥", "😮"];
const PAGE = 150;
let room = sessionStorage.getItem("cc-room") || "gen";
let replyTo = null, query = "", limit = PAGE, lastSig = "", stickToEnd = true;

function setRoom(r) {
  room = r;
  sessionStorage.setItem("cc-room", r);
  replyTo = null; query = ""; limit = PAGE; lastSig = ""; stickToEnd = true;
  const search = $("#chat-search");
  if (search) search.value = "";
}

function format(body) {
  const me = store.me().displayName.toLowerCase();
  let s = esc(body);
  s = s.replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
  s = s.replace(/(^|\s)@([\p{L}\p{N}_.-]{2,20})/gu, (_, sp, name) =>
    `${sp}<span class="mention${name.toLowerCase() === me ? " me" : ""}">@${name}</span>`);
  return raw(s);
}

function message(m, prev) {
  const me = store.me();
  const mine = m.uid === me.id;
  const staff = store.isStaff();
  const grouped = prev && prev.uid === m.uid && m.created - prev.created < 5 * 60e3 && !m.reply && dayLabel(prev.created) === dayLabel(m.created);
  const hidden = m.reported && !m.body;
  const reacts = Object.entries(m.reactions || {}).filter(([, list]) => list.length);
  return html`<div class="msg ${mine ? "mine" : ""} ${grouped ? "cont" : ""}" data-id="${m.id}">
    <div class="msg-side">${grouped ? html`<span class="msg-time-side">${time(m.created)}</span>` : avatar(m.uid)}</div>
    <div class="msg-body">
      ${grouped ? "" : html`<div class="msg-meta"><b>${store.nameOf(m.uid, m.author)}</b><span class="muted">${time(m.created)}</span>
        ${m.pinned ? html`<span title="Épinglé">📌</span>` : ""}${m.reported && staff ? html`<span class="badge badge-warn">🚩 signalé</span>` : ""}</div>`}
      ${m.reply ? html`<div class="msg-reply">↩ <b>${m.reply.author}</b> ${m.reply.text}</div>` : ""}
      <div class="msg-text">${hidden ? html`<i class="muted">🚩 Message signalé, en attente de modération.</i>` : format(m.body)}</div>
      ${reacts.length ? html`<div class="reactions">${reacts.map(([e, list]) => html`
        <button class="chip ${list.includes(me.id) ? "on" : ""}" data-act="react" data-id="${m.id}" data-e="${e}"
          title="${list.map((u) => store.nameOf(u)).join(", ")}">${e} ${list.length}</button>`)}</div>` : ""}
    </div>
    ${hidden ? "" : html`<div class="msg-tools">
      ${REACTIONS.map((e) => html`<button data-act="react" data-id="${m.id}" data-e="${e}" aria-label="Réagir ${e}">${e}</button>`)}
      <button data-act="reply" data-id="${m.id}" title="Répondre">↩</button>
      ${!mine ? html`<button data-act="report" data-id="${m.id}" title="Signaler">🚩</button>` : ""}
      ${staff ? html`<button data-act="pin" data-id="${m.id}" title="${m.pinned ? "Désépingler" : "Épingler"}">📌</button>` : ""}
      ${staff && m.reported ? html`<button data-act="clear" data-id="${m.id}" title="Valider le message">✓</button>` : ""}
      ${mine || staff ? html`<button data-act="del" data-id="${m.id}" title="Supprimer">🗑</button>` : ""}
    </div>`}
  </div>`;
}

function drawRooms() {
  const unread = unreadByRoom();
  const list = rooms();
  if (!list.some((r) => r[0] === room)) setRoom("gen");
  setHTML($("#chat-rooms"), html`<div class="rooms">${list.map(([k, label]) => html`
    <button class="room ${k === room ? "on" : ""}" data-act="room" data-room="${k}">
      <span>${label}</span>${unread[k] && k !== room ? html`<span class="count hot">${unread[k]}</span>` : ""}</button>`)}</div>`);
  setHTML($("#chat-title"), (list.find((r) => r[0] === room) || [, ""])[1]);
}

function drawMessages() {
  const all = store.rows("messages").filter((m) => m.room === room).sort((a, b) => a.created - b.created || (a.id < b.id ? -1 : 1));
  const q = query.toLowerCase();
  const list = q ? all.filter((m) => m.body.toLowerCase().includes(q) || (m.author || "").toLowerCase().includes(q)) : all;
  const shown = list.slice(-limit);
  const sig = room + "|" + q + "|" + limit + "|" + shown.map((m) => m.id + ":" + m.upd).join(",") + "|" + store.db.users.size;
  if (sig !== lastSig) {
    lastSig = sig;
    const el = $("#chat-list");
    const nearEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    let prev = null, day = "";
    const parts = [];
    if (list.length > shown.length) parts.push(html`<button class="load-more" data-act="more">Afficher les messages plus anciens</button>`);
    for (const m of shown) {
      const d = dayLabel(m.created);
      if (d !== day) { parts.push(html`<div class="day-sep"><span>${d}</span></div>`); day = d; prev = null; }
      parts.push(message(m, prev));
      prev = m;
    }
    setHTML(el, parts.length ? html`${parts}` : empty(q ? "Aucun message ne correspond." : "Aucun message. Lance la discussion !", "💬"));
    if (nearEnd || stickToEnd) el.scrollTop = el.scrollHeight;
    stickToEnd = false;

    const pins = all.filter((m) => m.pinned && m.body);
    setHTML($("#chat-pins"), pins.map((m) => html`<div class="pin">📌 <b>${store.nameOf(m.uid, m.author)}</b> : ${m.body}</div>`));
  }
  // Marque le salon comme lu.
  const last = all[all.length - 1];
  if (last && !document.hidden && last.created > (store.prefs().seen[room] || 0)) {
    store.updatePrefs((p) => { p.seen[room] = last.created; });
  }
}

function drawComposer() {
  const me = store.me();
  const locked = store.settings().chatLocked && !store.isStaff();
  const blocked = locked || me.muted;
  const input = $("#chat-form input");
  input.disabled = blocked;
  $("#chat-form button").disabled = blocked;
  input.placeholder = blocked ? "" : "Écrire un message… (@pseudo pour mentionner)";
  setHTML($("#chat-note"), locked ? "🔒 Le chat est verrouillé par l'administration." : me.muted ? "🔇 Tu ne peux plus écrire dans le chat." : "");
  setHTML($("#chat-reply"), replyTo
    ? html`<div class="reply-bar">↩ Réponse à <b>${store.nameOf(replyTo.uid, replyTo.author)}</b> : ${replyTo.body.slice(0, 60)}
        <button class="icon-btn" data-act="cancelReply" aria-label="Annuler la réponse">✕</button></div>` : "");
}

export default {
  deps: ["messages", "groups", "group_members", "users", "settings", "prefs"],
  render() {
    lastSig = "";
    stickToEnd = true;
    return html`<div class="chat">
      <aside class="chat-rooms card" id="chat-rooms" aria-label="Salons"></aside>
      <section class="chat-main card">
        <header class="chat-head"><h2 id="chat-title"></h2>
          <input id="chat-search" type="search" placeholder="Rechercher…" data-input="search" aria-label="Rechercher dans le salon"></header>
        <div id="chat-pins" class="pins"></div>
        <div id="chat-list" class="chat-list" role="log" aria-live="polite"></div>
        <div id="chat-reply"></div>
        <form data-form="send" id="chat-form" class="composer">
          <input name="body" maxlength="500" autocomplete="off" required aria-label="Message">
          <button class="btn-primary" type="submit">Envoyer</button>
        </form>
        <div id="chat-note" class="muted small"></div>
      </section></div>`;
  },
  update() {
    drawRooms();
    drawMessages();
    drawComposer();
  },
  enter() { store.setFast(true); },
  leave() { store.setFast(false); },
  forms: {
    async send(v, form) {
      const body = v.body.trim();
      if (!body) return;
      await store.act("msg.send", { room, body, replyTo: replyTo && replyTo.id });
      replyTo = null;
      stickToEnd = true;
      drawComposer();
      setTimeout(() => form.querySelector("input").focus(), 0);
    },
  },
  actions: {
    room(d) { setRoom(d.room); this.update(); },
    search(_, el) { query = el.value.trim(); drawMessages(); },
    more() { limit += PAGE; drawMessages(); },
    react: (d) => store.act("msg.react", { id: d.id, emoji: d.e }),
    reply(d) {
      replyTo = store.db.messages.get(d.id) || null;
      drawComposer();
      $("#chat-form input").focus();
    },
    cancelReply() { replyTo = null; drawComposer(); },
    async report(d) {
      if (await ask({ title: "Signaler ce message ?", message: "Il sera masqué en attendant qu'un modérateur le vérifie.", confirm: "Signaler" })) {
        await store.act("msg.report", { id: d.id });
        toast("Message signalé. Merci !", "success");
      }
    },
    pin(d) { const m = store.db.messages.get(d.id); return store.act("msg.pin", { id: d.id, pinned: !(m && m.pinned) }); },
    clear: (d) => store.act("msg.clearReport", { id: d.id }),
    async del(d) {
      if (await ask({ title: "Supprimer ce message ?", confirm: "Supprimer", danger: true })) await store.act("msg.delete", { id: d.id });
    },
  },
};
