// Défis quiz : duel (6 questions), défi quotidien (1 question par jour) et quiz solo de la League.
// Les bonnes réponses ne quittent jamais le serveur avant que le joueur ait répondu.
import crypto from "node:crypto";
import { api, actions, sql, fail, int, id, newId, requireActive } from "./_lib/core.js";
import { QUESTIONS } from "./_lib/questions.js";

const DAY = 86400000;
const POINTS = 10;
const TYPES = { duel: { players: 2, questions: 6 }, daily: { players: 2 }, solo: { players: 1, questions: 6 } };

function pickQuestions(count) {
  const pool = QUESTIONS.map((q) => ({ q, k: crypto.randomInt(1e9) })).sort((a, b) => a.k - b.k).slice(0, count);
  return pool.map(({ q }) => {
    const order = q[1].map((text, i) => ({ text, i, k: crypto.randomInt(1e9) })).sort((a, b) => a.k - b.k);
    return { prompt: q[0], options: order.map((o) => o.text), answer: order.findIndex((o) => o.i === 0) };
  });
}

const valid = (g) => g && Array.isArray(g.players) && Array.isArray(g.questions) && TYPES[g.type];
const needed = (g) => (g.type === "daily" ? g.days : g.questions.length);

function currentIndex(g, player, now) {
  if (g.type !== "daily") return player.answers.length;
  return Math.min(g.days - 1, Math.floor((now - g.startedAt) / DAY));
}

function isOver(g, now) {
  if (g.status === "complete") return true;
  if (g.status !== "active") return false;
  if (g.type === "daily" && now >= g.endsAt) return true;
  return g.players.length === TYPES[g.type].players && g.players.every((p) => p.answers.length >= needed(g));
}

function winner(g) {
  if (g.players.length < 2) return null;
  const [a, b] = g.players;
  if (a.score === b.score) return { draw: true };
  const w = a.score > b.score ? a : b;
  return { uid: w.uid, name: w.name };
}

function summary(g, uid, now) {
  const over = isOver(g, now);
  const mine = g.players.some((p) => p.uid === uid);
  return {
    id: g.id, type: g.type, days: g.days, createdAt: g.createdAt, endsAt: g.endsAt,
    status: over ? "complete" : g.status,
    players: g.players.map((p) => ({ name: p.name, score: p.score, progress: p.answers.length })),
    mine,
    canJoin: g.status === "waiting" && !mine,
    canCancel: g.status === "waiting" && g.players[0].uid === uid,
    winner: over ? winner(g) : null,
  };
}

function state(g, uid, now) {
  const me = g.players.find((p) => p.uid === uid);
  if (!me) return null;
  const over = isOver(g, now);
  const index = currentIndex(g, me, now);
  const answered = g.type === "daily" ? me.answers.some((a) => a.q === index) : me.answers.length > index;
  const q = g.status === "active" && !over && !answered && index < g.questions.length ? g.questions[index] : null;
  return {
    ...summary(g, uid, now),
    myIndex: g.players.indexOf(me),
    total: needed(g),
    myProgress: me.answers.length,
    questionIndex: index,
    answered,
    question: q ? { index, prompt: q.prompt, options: q.options } : null,
    // Correction visible seulement une fois la partie terminée.
    review: over
      ? g.questions.slice(0, needed(g)).map((qq, i) => ({
          prompt: qq.prompt, options: qq.options, answer: qq.answer,
          choice: (me.answers.find((a) => a.q === i) || {}).choice ?? null,
        }))
      : null,
  };
}

// Points de League : +10 par bonne réponse, +1 partie jouée à la fin.
function addPoints(tx, uid, pts, played, now) {
  if (uid === "sa") return null;
  return tx`
    insert into league(uid, pts, played, upd) values(${uid}, ${pts}, ${played}, ${now})
    on conflict(uid) do update set pts = league.pts + ${pts}, played = league.played + ${played}, upd = ${now}, del = false`;
}

async function finish(tx, g, now) {
  if (g.awarded) return;
  g.status = "complete";
  g.awarded = true;
  for (const p of g.players) await addPoints(tx, p.uid, 0, 1, now);
}

const save = (tx, g, now) =>
  tx`update quiz_games set data = ${sql.json(g)}::jsonb, status = ${g.status},
       uids = ${tx.array(g.players.map((p) => p.uid))}, upd = ${now} where id = ${g.id}`;

async function locked(tx, gameId) {
  const [row] = await tx`select data from quiz_games where id = ${id(gameId)} for update`;
  if (!row || !valid(row.data)) fail(404, "Défi introuvable.");
  return row.data;
}

export default api({
  async GET({ me, query }) {
    requireActive(me);
    const now = Date.now();
    if (query.op === "list") {
      const rows = await sql`
        select data from quiz_games
        where type <> 'solo' and (status = 'waiting' or ${me.id} = any(uids))
        order by created desc limit 40`;
      return { games: rows.map((r) => r.data).filter(valid).map((g) => summary(g, me.id, now)) };
    }
    if (query.id) {
      const [row] = await sql`select data from quiz_games where id = ${id(query.id)}`;
      if (!row || !valid(row.data)) fail(404, "Défi introuvable.");
      const g = row.data;
      const s = state(g, me.id, now);
      if (!s) fail(403, "Tu ne participes pas à ce défi.");
      if (g.status === "active" && isOver(g, now) && !g.awarded) {
        await sql.begin(async (tx) => {
          const fresh = await locked(tx, g.id);
          if (!fresh.awarded && isOver(fresh, now)) { await finish(tx, fresh, now); await save(tx, fresh, now); }
        });
      }
      return { state: s };
    }
    fail(400, "Requête inconnue.");
  },

  POST: (ctx) => {
    requireActive(ctx.me);
    return actions({
      async create({ me, body }) {
        const type = body.type;
        if (!TYPES[type]) fail(400, "Type de défi invalide.");
        const now = Date.now();
        const days = type === "daily" ? int(body.days, 1, 7, "La durée") : 1;
        const [{ n }] = await sql`select count(*)::int as n from quiz_games where created > ${now - 3600e3} and ${me.id} = any(uids)`;
        if (n >= 30) fail(429, "Tu as lancé beaucoup de parties. Réessaie un peu plus tard.");
        // Ménage : vieilles parties solo et défis jamais rejoints.
        await sql`delete from quiz_games where (type = 'solo' and created < ${now - 2 * DAY}) or (status = 'waiting' and created < ${now - 14 * DAY})`;

        const solo = type === "solo";
        const g = {
          id: newId(), type, days, createdAt: now,
          status: solo ? "active" : "waiting",
          startedAt: solo ? now : null, endsAt: null,
          players: [{ uid: me.id, name: me.displayName, score: 0, answers: [] }],
          questions: pickQuestions(type === "daily" ? days : TYPES[type].questions),
        };
        await sql`insert into quiz_games(id, type, status, uids, data, created, upd)
          values(${g.id}, ${type}, ${g.status}, ${sql.array([me.id])}, ${sql.json(g)}::jsonb, ${now}, ${now})`;
        return { game: summary(g, me.id, now) };
      },

      async join({ me, body }) {
        const now = Date.now();
        const g = await sql.begin(async (tx) => {
          const g = await locked(tx, body.id);
          if (g.status !== "waiting" || g.players.length !== 1) fail(409, "Ce défi n'est plus disponible.");
          if (g.players[0].uid === me.id) fail(400, "Tu ne peux pas rejoindre ton propre défi.");
          g.players.push({ uid: me.id, name: me.displayName, score: 0, answers: [] });
          g.status = "active";
          g.startedAt = now;
          g.endsAt = g.type === "daily" ? now + g.days * DAY : null;
          await save(tx, g, now);
          return g;
        });
        return { game: summary(g, me.id, now) };
      },

      async cancel({ me, body }) {
        const rows = await sql`delete from quiz_games where id = ${id(body.id)} and status = 'waiting' and uids[1] = ${me.id} returning id`;
        if (!rows.length) fail(409, "Ce défi ne peut plus être annulé.");
        return { ok: true };
      },

      async answer({ me, body }) {
        const now = Date.now();
        const result = await sql.begin(async (tx) => {
          const g = await locked(tx, body.id);
          const player = g.players.find((p) => p.uid === me.id);
          if (!player) fail(403, "Tu ne participes pas à ce défi.");
          if (g.status !== "active") fail(409, "Ce défi n'est pas en cours.");
          if (isOver(g, now)) {
            // On enregistre la fin de partie (pas d'exception ici, sinon la transaction serait annulée).
            await finish(tx, g, now);
            await save(tx, g, now);
            return { over: true };
          }
          const index = currentIndex(g, player, now);
          if (index >= g.questions.length || player.answers.length >= needed(g)) fail(409, "Tu as déjà répondu à toutes tes questions.");
          if (g.type === "daily" && player.answers.some((a) => a.q === index)) fail(409, "Tu as déjà répondu aujourd'hui. Reviens demain !");
          const q = g.questions[index];
          const choice = int(body.choice, 0, q.options.length - 1, "La réponse");
          const correct = choice === q.answer;
          player.answers.push({ q: index, choice, correct, at: now });
          if (correct) {
            player.score += POINTS;
            await addPoints(tx, me.id, POINTS, 0, now);
          }
          if (isOver(g, now)) await finish(tx, g, now);
          await save(tx, g, now);
          return { correct, answer: q.answer, state: state(g, me.id, now) };
        });
        if (result.over) fail(409, "Ce défi est terminé.");
        return result;
      },
    })(ctx);
  },
});
