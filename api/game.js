import crypto from "node:crypto";
import { sql, who, body } from "./_lib.js";

const DAY = 86400000;
const QUESTIONS = [
  ["Quelle est la capitale de l’Italie ?", ["Rome", "Milan", "Naples", "Venise"], 0],
  ["Quel est le plus grand océan ?", ["Pacifique", "Atlantique", "Indien", "Arctique"], 0],
  ["Quelle planète est la plus proche du Soleil ?", ["Mercure", "Vénus", "Mars", "Terre"], 0],
  ["Qui a peint la Joconde ?", ["Léonard de Vinci", "Michel-Ange", "Picasso", "Van Gogh"], 0],
  ["Combien font 7 × 8 ?", ["56", "54", "48", "63"], 0],
  ["Quelle est la racine carrée de 81 ?", ["9", "8", "7", "10"], 0],
  ["En quelle année a commencé la Première Guerre mondiale ?", ["1914", "1918", "1939", "1905"], 0],
  ["Quel gaz les plantes absorbent-elles ?", ["Dioxyde de carbone", "Oxygène", "Azote", "Hélium"], 0],
  ["Quel est l’animal terrestre le plus rapide ?", ["Le guépard", "Le lion", "Le cheval", "L’autruche"], 0],
  ["Quel organe pompe le sang ?", ["Le cœur", "Le foie", "Les poumons", "Le cerveau"], 0],
  ["Combien font 12 × 12 ?", ["144", "124", "132", "154"], 0],
  ["Quel est le symbole chimique de l’eau ?", ["H₂O", "CO₂", "O₂", "NaCl"], 0],
  ["Combien de côtés a un hexagone ?", ["6", "5", "7", "8"], 0],
  ["Quel est le plus grand continent ?", ["Asie", "Afrique", "Europe", "Amérique du Sud"], 0],
];

const fail = (res, status, message) => res.status(status).json({ error: message });
const member = (me) => me.sa || me.role === "member" || me.role === "mod";

function publicState(data, uid, now) {
  const mine = data.players.find((p) => p.uid === uid);
  const opponent = data.players.find((p) => p.uid !== uid);
  if (!mine) return null;
  const myCount = mine.answers.length;
  const opponentCount = opponent ? opponent.answers.length : 0;
  const questionIndex = data.type === "daily"
    ? Math.min(data.days - 1, Math.floor((now - data.startedAt) / DAY))
    : myCount;
  const answered = data.type === "daily"
    ? mine.answers.some((a) => a.day === questionIndex)
    : myCount > questionIndex;
  const isFinished = data.status === "complete" || (data.type === "daily" && now >= data.endsAt);
  const question = data.status === "active" && !isFinished && !answered && questionIndex < data.questions.length
    ? { index: questionIndex, prompt: data.questions[questionIndex].prompt, options: data.questions[questionIndex].options }
    : null;
  return {
    id: data.id,
    type: data.type,
    status: isFinished ? "complete" : data.status,
    createdAt: data.createdAt,
    endsAt: data.endsAt,
    days: data.days,
    players: data.players.map((p) => ({ name: p.name, score: p.score, progress: p.answers.length })),
    myIndex: data.players.findIndex((p) => p.uid === uid),
    myProgress: myCount,
    opponentProgress: opponentCount,
    questionIndex,
    answered,
    question,
    winner: isFinished
      ? data.players[0].score === data.players[1]?.score ? "draw"
        : data.players[0].score > data.players[1]?.score ? data.players[0].uid
          : data.players[1]?.uid
      : null,
    winnerName: isFinished
      ? data.players[0].score === data.players[1]?.score ? null
        : data.players[0].score > data.players[1]?.score ? data.players[0].name
          : data.players[1]?.name
      : null,
  };
}

function summary(data, uid) {
  const own = data.players.some((p) => p.uid === uid);
  return {
    id: data.id,
    type: data.type,
    status: data.status,
    title: data.title,
    days: data.days,
    createdAt: data.createdAt,
    endsAt: data.endsAt,
    players: data.players.map((p) => ({ name: p.name, score: p.score, progress: p.answers.length })),
    canJoin: data.status === "waiting" && !own && data.players.length < 2,
    winnerName: data.status === "complete" && data.players.length === 2
      ? data.players[0].score === data.players[1].score ? "Égalité"
        : data.players[0].score > data.players[1].score ? data.players[0].name : data.players[1].name
      : null,
  };
}

export default async function handler(req, res) {
  try {
    const me = await who(req, res);
    if (!member(me)) return fail(res, 403, "Seuls les membres actifs peuvent jouer.");
    const now = Date.now();

    if (req.method === "GET" && req.query.op === "list") {
      const rows = await sql`select data from games order by created_at desc limit 100`;
      const games = rows.map((r) => r.data).filter((g) =>
        g.status === "waiting" || g.players.some((p) => p.uid === me.uid)
      ).map((g) => summary(g, me.uid)).slice(0, 30);
      return res.json({ games });
    }

    const b = body(req);
    if (req.method === "POST" && b.action === "create") {
      const type = b.type;
      if (type !== "duel" && type !== "daily") return fail(res, 400, "Type de défi invalide.");
      const days = type === "daily" ? Number(b.days) : 1;
      if (!Number.isInteger(days) || days < 1 || days > 7) return fail(res, 400, "Choisis une durée de 1 à 7 jours.");
      const recent = (await sql`select count(*)::int as n from games where created_at>${now - 3600000} and data->'players' @> ${JSON.stringify([{ uid: me.uid }])}::jsonb`)[0].n;
      if (recent >= 20) return fail(res, 429, "Tu as créé beaucoup de défis récemment. Réessaie dans un peu plus tard.");
      const selected = crypto.randomBytes(QUESTIONS.length);
      const questions = QUESTIONS.map((q, i) => ({ q, key: selected[i] })).sort((a, z) => a.key - z.key).slice(0, type === "daily" ? days : 6)
        .map(({ q }) => {
          const order = Array.from(crypto.randomBytes(q[1].length)).map((key, i) => ({ key, i })).sort((a, z) => a.key - z.key);
          return { prompt: q[0], options: order.map(({ i }) => q[1][i]), answer: order.findIndex(({ i }) => i === q[2]) };
        });
      const id = crypto.randomBytes(12).toString("hex");
      const data = {
        id, type, title: type === "duel" ? "Duel quiz" : "Défi quotidien",
        status: "waiting", days, createdAt: now, startedAt: null, endsAt: null,
        players: [{ uid: me.uid, name: me.name, score: 0, answers: [] }],
        questions,
      };
      await sql`insert into games(id,data,created_at,upd) values(${id},${JSON.stringify(data)}::jsonb,${now},${now})`;
      return res.status(201).json({ game: summary(data, me.uid) });
    }

    if (req.method === "POST" && b.action === "join") {
      const id = String(b.id || "");
      const joined = await sql.begin(async (tx) => {
        const row = (await tx`select data from games where id=${id} for update`)[0];
        if (!row) return { error: "Défi introuvable.", status: 404 };
        const data = row.data;
        if (data.status !== "waiting" || data.players.length !== 1) return { error: "Ce défi n’est plus disponible.", status: 409 };
        if (data.players[0].uid === me.uid) return { error: "Tu ne peux pas rejoindre ton propre défi.", status: 400 };
        data.players.push({ uid: me.uid, name: me.name, score: 0, answers: [] });
        data.status = "active";
        data.startedAt = now;
        data.endsAt = data.type === "daily" ? now + data.days * DAY : null;
        await tx`update games set data=${JSON.stringify(data)}::jsonb, upd=${now} where id=${id}`;
        return { data };
      });
      if (joined.error) return fail(res, joined.status, joined.error);
      return res.json({ game: summary(joined.data, me.uid) });
    }

    if (req.method === "POST" && b.action === "answer") {
      const id = String(b.id || "");
      const choice = b.choice;
      const result = await sql.begin(async (tx) => {
        const row = (await tx`select data from games where id=${id} for update`)[0];
        if (!row) return { error: "Défi introuvable.", status: 404 };
        const data = row.data;
        const player = data.players.find((p) => p.uid === me.uid);
        if (!player) return { error: "Tu ne participes pas à ce défi.", status: 403 };
        if (data.status !== "active" || data.players.length !== 2) return { error: "Ce défi n’est pas en cours.", status: 409 };
        if (data.type === "daily" && now >= data.endsAt) {
          data.status = "complete";
          await tx`update games set data=${JSON.stringify(data)}::jsonb, upd=${now} where id=${id}`;
          return { error: "Ce défi est terminé.", status: 409 };
        }
        const index = data.type === "daily" ? Math.floor((now - data.startedAt) / DAY) : player.answers.length;
        if (index >= data.questions.length) return { error: "Tu as déjà terminé tes questions.", status: 409 };
        if (data.type === "daily" && player.answers.some((a) => a.day === index)) return { error: "Tu as déjà répondu aujourd’hui.", status: 409 };
        if (typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice >= data.questions[index].options.length) return { error: "Réponse invalide.", status: 400 };
        const correct = choice === data.questions[index].answer;
        player.answers.push({ day: index, choice, correct, at: now });
        if (correct) player.score += 10;
        const complete = data.players.every((p) => data.type === "daily"
          ? p.answers.length >= data.days
          : p.answers.length >= data.questions.length);
        if (complete) data.status = "complete";
        await tx`update games set data=${JSON.stringify(data)}::jsonb, upd=${now} where id=${id}`;
        return { state: publicState(data, me.uid, now), correct };
      });
      if (result.error) return fail(res, result.status, result.error);
      return res.json(result);
    }

    if (req.method === "GET" && req.query.id) {
      const id = String(req.query.id);
      const row = (await sql`select data from games where id=${id}`)[0];
      if (!row) return fail(res, 404, "Défi introuvable.");
      const state = publicState(row.data, me.uid, now);
      if (!state) return fail(res, 403, "Tu ne participes pas à ce défi.");
      if (row.data.status === "active" && row.data.type === "daily" && now >= row.data.endsAt) {
        await sql`update games set data=jsonb_set(data,'{status}','"complete"'::jsonb),upd=${now} where id=${id}`;
        state.status = "complete";
      }
      return res.json({ state });
    }

    return fail(res, 400, "Action de jeu inconnue.");
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
