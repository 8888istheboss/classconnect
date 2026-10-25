// Données de la classe : synchronisation incrémentale (GET) et actions vérifiées côté serveur (POST).
import crypto from "node:crypto";
import {
  api, actions, sql, fail, str, int, id, newId, isStaff, requireActive, requireStaff,
} from "./_lib/core.js";

// Fenêtre de recouvrement : rattrape les écritures validées juste après la lecture précédente.
const OVERLAP = 15000;
const BASE_ROOMS = new Set(["gen", "dev", "jeu", "pro", "mat", "fra", "his", "sci"]);
const REACTIONS = new Set(["👍", "❤️", "😂", "🔥", "😮"]);
const EVENT_KINDS = new Set(["Devoir", "Contrôle", "Événement"]);
const MARKET_KINDS = new Set(["Je donne", "Je prête", "Je cherche"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ---------- Synchronisation ---------- */
async function sync(me, since) {
  if (!me || me.status !== "active") return { me, cursor: 0, changes: {} };
  const now = Date.now();
  const from = since > 0 ? since - OVERLAP : 0;
  const all = from > 0; // en incrémental on renvoie aussi les suppressions
  const uid = me.id;
  const staff = isStaff(me);

  const users = staff
    ? sql`select id, username, display_name, role, status, emoji, color, muted, created, approved_at, upd, del
          from users where upd > ${from} and (${all} or not del)`
    : sql`select id, display_name, role, emoji, color, muted, upd, (del or status <> 'active') as del
          from users where upd > ${from} and (${all} or (not del and status = 'active'))`;

  const messages = sql`
    select id, room, uid, author, reply, pinned, reported, reactions, created, upd, del,
      case when reported and uid <> ${uid} and not ${staff} then '' else body end as body
    from messages
    where upd > ${from} and (${all} or not del)
      and (room not like 'g:%' or ${staff} or exists(
        select 1 from group_members gm where gm.group_id = substr(messages.room, 3) and gm.uid = ${uid} and not gm.del))
    order by created desc limit ${all ? 5000 : 2000}`;

  const plain = (table) => sql`select * from ${sql(table)} where upd > ${from} and (${all} or not del)`;
  const own = (table) => sql`select * from ${sql(table)} where uid = ${uid} and upd > ${from} and (${all} or not del)`;

  const ideas = sql`
    select id, body, anon, retained, created, upd, del,
      case when anon and not ${staff} and uid <> ${uid} then null else uid end as uid,
      case when anon and not ${staff} and uid <> ${uid} then null else author end as author
    from ideas where upd > ${from} and (${all} or not del)`;

  const [u, m, groups, gm, events, polls, votes, ann, outings, rsvps, id_, iv, market, cards, prefs, league, settings] =
    await Promise.all([
      users, messages, plain("class_groups"), plain("group_members"), plain("events"), plain("polls"),
      plain("poll_votes"), plain("announcements"), plain("outings"), plain("outing_rsvps"), ideas,
      plain("idea_votes"), plain("market"), own("cards"), own("prefs"), plain("league"), plain("settings"),
    ]);

  // Dernière activité (au plus une écriture par minute, sans déclencher de synchronisation).
  if (!me.isSA && (!me.lastSeen || now - me.lastSeen > 60000)) {
    await sql`update users set last_seen = ${now} where id = ${uid}`;
  }

  const changes = {};
  const put = (name, rows) => { if (rows.length) changes[name] = rows; };
  put("users", u); put("messages", m); put("groups", groups); put("group_members", gm); put("events", events);
  put("polls", polls); put("poll_votes", votes); put("announcements", ann); put("outings", outings);
  put("outing_rsvps", rsvps); put("ideas", id_); put("idea_votes", iv); put("market", market);
  put("cards", cards); put("prefs", prefs); put("league", league); put("settings", settings);
  return { me, cursor: now, changes };
}

/* ---------- Outils ---------- */
async function settings() {
  const [s] = await sql`select data from settings where id = 'main'`;
  return (s && s.data) || {};
}

async function isGroupMember(groupId, uid) {
  const [r] = await sql`
    select 1 from group_members gm join class_groups g on g.id = gm.group_id
    where gm.group_id = ${groupId} and gm.uid = ${uid} and not gm.del and not g.del`;
  return !!r;
}

async function checkRoom(me, room) {
  if (BASE_ROOMS.has(room)) return room;
  const m = /^g:([\w-]{1,40})$/.exec(room);
  if (!m) fail(400, "Salon inconnu.");
  if (!isStaff(me) && !(await isGroupMember(m[1], me.id))) fail(403, "Rejoins ce groupe pour accéder à son salon.");
  return room;
}

// Charge une ligne vivante et vérifie que l'utilisateur en est l'auteur (ou modérateur).
async function owned(me, table, rowId, { staffOk = true } = {}) {
  const [row] = await sql`select * from ${sql(table)} where id = ${id(rowId)} and not del`;
  if (!row) fail(404, "Élément introuvable ou déjà supprimé.");
  if (row.uid !== me.id && !(staffOk && isStaff(me))) fail(403, "Tu ne peux modifier que ce que tu as publié.");
  return row;
}
const softDelete = (table, rowId) => sql`update ${sql(table)} set del = true, upd = ${Date.now()} where id = ${rowId}`;

async function exists(table, rowId) {
  const [row] = await sql`select * from ${sql(table)} where id = ${id(rowId)} and not del`;
  if (!row) fail(404, "Élément introuvable ou supprimé.");
  return row;
}

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- Actions ---------- */
const handlers = {
  /* Chat */
  async "msg.send"({ me, body }) {
    const cfg = await settings();
    if (cfg.chatLocked && !isStaff(me)) fail(403, "Le chat est verrouillé par l'administration.");
    if (me.muted) fail(403, "Tu ne peux plus écrire dans le chat. Contacte le professeur.");
    const room = await checkRoom(me, str(body.room, 50, { min: 1, label: "Le salon" }));
    const text = str(body.body, 500, { min: 1, label: "Le message" });
    const now = Date.now();
    const [{ n }] = await sql`select count(*)::int as n from messages where uid = ${me.id} and created > ${now - 15000}`;
    if (n >= 8) fail(429, "Tu envoies trop de messages. Patiente quelques secondes.");
    let reply = null;
    if (body.replyTo) {
      const [r] = await sql`select author, body from messages where id = ${id(body.replyTo)} and room = ${room} and not del`;
      if (r) reply = { author: r.author, text: r.body.slice(0, 80) };
    }
    const msgId = newId();
    await sql`
      insert into messages(id, room, uid, author, body, reply, created, upd)
      values(${msgId}, ${room}, ${me.id}, ${me.displayName}, ${text},
             ${reply ? sql.json(reply) : null}::jsonb, ${now}, ${now})`;
    return { id: msgId };
  },

  async "msg.react"({ me, body }) {
    const emoji = String(body.emoji || "");
    if (!REACTIONS.has(emoji)) fail(400, "Réaction inconnue.");
    const msg = await exists("messages", body.id);
    await checkRoom(me, msg.room);
    await sql`
      update messages set upd = ${Date.now()}, reactions = case
        when coalesce(reactions -> ${emoji}::text, '[]'::jsonb) ? ${me.id}::text
          then jsonb_set(reactions, array[${emoji}::text], (reactions -> ${emoji}::text) - ${me.id}::text)
        else jsonb_set(reactions, array[${emoji}::text], coalesce(reactions -> ${emoji}::text, '[]'::jsonb) || to_jsonb(${me.id}::text))
      end
      where id = ${msg.id}`;
  },

  async "msg.delete"({ me, body }) {
    const msg = await owned(me, "messages", body.id);
    await softDelete("messages", msg.id);
  },

  async "msg.report"({ me, body }) {
    const msg = await exists("messages", body.id);
    await checkRoom(me, msg.room);
    if (msg.uid === me.id) fail(400, "Tu ne peux pas signaler ton propre message.");
    await sql`update messages set reported = true, upd = ${Date.now()} where id = ${msg.id}`;
  },

  async "msg.pin"({ me, body }) {
    requireStaff(me);
    const msg = await exists("messages", body.id);
    await sql`update messages set pinned = ${!!body.pinned}, upd = ${Date.now()} where id = ${msg.id}`;
  },

  async "msg.clearReport"({ me, body }) {
    requireStaff(me);
    const msg = await exists("messages", body.id);
    await sql`update messages set reported = false, upd = ${Date.now()} where id = ${msg.id}`;
  },

  /* Groupes */
  async "group.create"({ me, body }) {
    const name = str(body.name, 40, { min: 2, label: "Le nom du groupe" });
    const descr = str(body.descr, 120);
    const gid = newId(), now = Date.now();
    await sql.begin(async (tx) => {
      await tx`insert into class_groups(id, uid, name, descr, created, upd) values(${gid}, ${me.id}, ${name}, ${descr}, ${now}, ${now})`;
      await tx`insert into group_members(group_id, uid, created, upd) values(${gid}, ${me.id}, ${now}, ${now})`;
    });
    return { id: gid };
  },
  async "group.delete"({ me, body }) {
    const g = await owned(me, "class_groups", body.id);
    const now = Date.now();
    await sql`update class_groups set del = true, upd = ${now} where id = ${g.id}`;
    await sql`update group_members set del = true, upd = ${now} where group_id = ${g.id} and not del`;
  },
  async "group.join"({ me, body }) {
    const g = await exists("class_groups", body.id);
    const now = Date.now();
    await sql`
      insert into group_members(group_id, uid, created, upd) values(${g.id}, ${me.id}, ${now}, ${now})
      on conflict(group_id, uid) do update set del = false, upd = ${now}`;
  },
  async "group.leave"({ me, body }) {
    await sql`update group_members set del = true, upd = ${Date.now()} where group_id = ${id(body.id)} and uid = ${me.id}`;
  },

  /* Planning */
  async "event.create"({ me, body }) {
    const kind = EVENT_KINDS.has(body.kind) ? body.kind : "Devoir";
    const title = str(body.title, 80, { min: 1, label: "Le titre" });
    const due = str(body.due, 10);
    if (!DATE_RE.test(due)) fail(400, "Choisis une date valide.");
    const now = Date.now();
    await sql`insert into events(id, uid, kind, title, due, created, upd) values(${newId()}, ${me.id}, ${kind}, ${title}, ${due}, ${now}, ${now})`;
  },
  async "event.delete"({ me, body }) {
    const e = await owned(me, "events", body.id);
    await softDelete("events", e.id);
  },

  /* Sondages */
  async "poll.create"({ me, body }) {
    const question = str(body.question, 140, { min: 3, label: "La question" });
    const raw = Array.isArray(body.options) ? body.options : String(body.options || "").split(/[,\n]/);
    const options = [...new Set(raw.map((o) => str(o, 60)).filter(Boolean))].slice(0, 8);
    if (options.length < 2) fail(400, "Propose au moins deux options différentes.");
    const now = Date.now();
    await sql`insert into polls(id, uid, question, options, created, upd)
      values(${newId()}, ${me.id}, ${question}, ${sql.json(options)}::jsonb, ${now}, ${now})`;
  },
  async "poll.delete"({ me, body }) {
    const p = await owned(me, "polls", body.id);
    await softDelete("polls", p.id);
  },
  async "poll.vote"({ me, body }) {
    const p = await exists("polls", body.id);
    const choice = int(body.choice, 0, p.options.length - 1, "Le choix");
    const now = Date.now();
    // Recliquer sur son choix retire le vote.
    await sql`
      insert into poll_votes(poll_id, uid, choice, created, upd) values(${p.id}, ${me.id}, ${choice}, ${now}, ${now})
      on conflict(poll_id, uid) do update set
        del = case when not poll_votes.del and poll_votes.choice = ${choice} then true else false end,
        choice = ${choice}, upd = ${now}`;
  },

  /* Annonces */
  async "ann.create"({ me, body }) {
    requireStaff(me);
    const text = str(body.body, 300, { min: 1, label: "L'annonce" });
    const now = Date.now();
    await sql`insert into announcements(id, uid, author, body, created, upd) values(${newId()}, ${me.id}, ${me.displayName}, ${text}, ${now}, ${now})`;
  },
  async "ann.delete"({ me, body }) {
    requireStaff(me);
    const a = await exists("announcements", body.id);
    await softDelete("announcements", a.id);
  },

  /* Sorties */
  async "outing.create"({ me, body }) {
    requireStaff(me);
    const place = str(body.place, 60, { min: 2, label: "Le lieu" });
    const day = str(body.day, 10);
    if (!DATE_RE.test(day)) fail(400, "Choisis une date valide.");
    const hour = str(body.hour, 5);
    if (hour && !/^\d{2}:\d{2}$/.test(hour)) fail(400, "Heure invalide.");
    const note = str(body.note, 200);
    const now = Date.now();
    await sql`insert into outings(id, uid, place, day, hour, note, created, upd)
      values(${newId()}, ${me.id}, ${place}, ${day}, ${hour}, ${note}, ${now}, ${now})`;
  },
  async "outing.delete"({ me, body }) {
    requireStaff(me);
    const o = await exists("outings", body.id);
    await softDelete("outings", o.id);
  },
  async "outing.rsvp"({ me, body }) {
    const o = await exists("outings", body.id);
    const now = Date.now();
    await sql`
      insert into outing_rsvps(outing_id, uid, created, upd) values(${o.id}, ${me.id}, ${now}, ${now})
      on conflict(outing_id, uid) do update set del = not outing_rsvps.del, upd = ${now}`;
  },
  async "outing.teams"({ me, body }) {
    requireStaff(me);
    const o = await exists("outings", body.id);
    const n = int(body.count, 2, 4, "Le nombre d'équipes");
    const rows = await sql`select uid from outing_rsvps where outing_id = ${o.id} and not del`;
    if (rows.length < n) fail(400, `Il faut au moins ${n} inscrits pour former ${n} équipes.`);
    const teams = Array.from({ length: n }, () => ({ members: [] }));
    shuffle(rows.map((r) => r.uid)).forEach((uid, i) => teams[i % n].members.push(uid));
    await sql`update outings set teams = ${sql.json(teams)}::jsonb, rounds = '[]'::jsonb, upd = ${Date.now()} where id = ${o.id}`;
  },
  async "outing.round"({ me, body }) {
    requireStaff(me);
    const o = await exists("outings", body.id);
    const team = int(body.team, 0, Math.max(0, o.teams.length - 1), "L'équipe");
    if (!o.teams.length) fail(400, "Forme d'abord les équipes.");
    const points = int(body.points, -1000, 1000, "Les points");
    await sql`update outings set rounds = rounds || ${sql.json([{ team, points }])}::jsonb, upd = ${Date.now()} where id = ${o.id}`;
  },

  /* Idées */
  async "idea.create"({ me, body }) {
    const text = str(body.body, 200, { min: 3, label: "L'idée" });
    const now = Date.now();
    await sql`insert into ideas(id, uid, author, body, anon, created, upd)
      values(${newId()}, ${me.id}, ${me.displayName}, ${text}, ${body.anon !== false}, ${now}, ${now})`;
  },
  async "idea.delete"({ me, body }) {
    const i = await owned(me, "ideas", body.id);
    await softDelete("ideas", i.id);
  },
  async "idea.vote"({ me, body }) {
    const i = await exists("ideas", body.id);
    const now = Date.now();
    await sql`
      insert into idea_votes(idea_id, uid, created, upd) values(${i.id}, ${me.id}, ${now}, ${now})
      on conflict(idea_id, uid) do update set del = not idea_votes.del, upd = ${now}`;
  },
  async "idea.retain"({ me, body }) {
    requireStaff(me);
    const i = await exists("ideas", body.id);
    await sql`update ideas set retained = not retained, upd = ${Date.now()} where id = ${i.id}`;
  },

  /* Échange */
  async "market.create"({ me, body }) {
    const kind = MARKET_KINDS.has(body.kind) ? body.kind : "Je donne";
    const text = str(body.body, 120, { min: 2, label: "L'annonce" });
    const now = Date.now();
    await sql`insert into market(id, uid, kind, body, created, upd) values(${newId()}, ${me.id}, ${kind}, ${text}, ${now}, ${now})`;
  },
  async "market.toggle"({ me, body }) {
    const m = await owned(me, "market", body.id, { staffOk: false });
    await sql`update market set done = not done, upd = ${Date.now()} where id = ${m.id}`;
  },
  async "market.delete"({ me, body }) {
    const m = await owned(me, "market", body.id);
    await softDelete("market", m.id);
  },

  /* Flashcards (privées) */
  async "card.create"({ me, body }) {
    const subject = str(body.subject, 40) || "Général";
    const question = str(body.question, 300, { min: 1, label: "La question" });
    const answer = str(body.answer, 300, { min: 1, label: "La réponse" });
    const [{ n }] = await sql`select count(*)::int as n from cards where uid = ${me.id} and not del`;
    if (n >= 1000) fail(400, "Tu as atteint la limite de 1000 fiches.");
    const now = Date.now();
    await sql`insert into cards(id, uid, subject, question, answer, created, upd)
      values(${newId()}, ${me.id}, ${subject}, ${question}, ${answer}, ${now}, ${now})`;
  },
  async "card.delete"({ me, body }) {
    const c = await owned(me, "cards", body.id, { staffOk: false });
    await softDelete("cards", c.id);
  },

  /* Préférences (messages lus, devoirs faits) */
  async "prefs.save"({ me, body }) {
    const data = body.data && typeof body.data === "object" ? body.data : {};
    const clean = { seen: {}, done: {} };
    for (const [k, v] of Object.entries(data.seen || {}).slice(0, 200)) if (/^[\w:-]{1,50}$/.test(k) && Number.isFinite(v)) clean.seen[k] = v;
    for (const [k, v] of Object.entries(data.done || {}).slice(0, 2000)) if (/^[\w-]{1,40}$/.test(k) && v === true) clean.done[k] = true;
    const now = Date.now();
    await sql`
      insert into prefs(uid, data, upd) values(${me.id}, ${sql.json(clean)}::jsonb, ${now})
      on conflict(uid) do update set data = excluded.data, upd = ${now}, del = false`;
  },
};

export default api({
  GET: ({ me, query }) => sync(me, Math.max(0, Number(query.since) || 0)),
  POST: (ctx) => {
    requireActive(ctx.me);
    return actions(handlers)(ctx);
  },
});
