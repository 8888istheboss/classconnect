import crypto from "node:crypto";
import { sql, who, body } from "./_lib.js";

const COLS = ["msgs","groups","gm","polls","votes","scores","ann","hw","sorties","rsvp","bans","members","codes","cfg","ideas","mkt","logs","mood","cards","prefs"];
const PRIVATE = new Set(["cards", "prefs"]);
const SA_ONLY = new Set(["bans", "cfg", "codes", "logs"]);      // écriture réservée au super admin
const ADM_ONLY = new Set(["ann", "sorties"]);                    // création : admin ou modérateur
const SELF_ID = {                                                // documents "une par personne"
  votes: (i, u) => i.endsWith("_" + u), rsvp: (i, u) => i.endsWith("_" + u),
  gm: (i, u) => i.endsWith("_" + u), mood: (i, u) => i.startsWith(u + "_"),
  cards: (i, u) => i.startsWith(u + "_"), prefs: (i, u) => i.startsWith(u + "_"),
};
const LOOSE = { msgs: /^(r[0-3]|rep)$/, ideas: /^v$/ };          // modifs permises à tout membre
const PROT = new Set(["id", "u", "t", "upd", "by"]);
const adm = (r) => r === "sa" || r === "mod";
const canRead = (c, r) => r === "sa" || (r === "none" ? c === "members" : c !== "codes" && c !== "logs");
const pub = (c, r) => (x) => { const d = { ...x.data, id: x.id }; if (c === "members" && r !== "sa") delete d.cd; return d; };
const strip = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !PROT.has(k)));
const fail = (res, s, m) => res.status(s).json({ error: m });

export default async function handler(req, res) {
  try {
    const me = await who(req, res), b = body(req), now = Date.now();
    const { op, col, id } = req.query;

    // Synchronisation : une seule requête pour toutes les collections
    if (op === "sync") {
      const hs = b.hs || {}, out = {};
      const cols = Object.keys(hs).filter((c) => COLS.includes(c) && canRead(c, me.role));
      if (me.role === "none") {
        if (cols.includes("members")) {
          const r = await sql`select id,data from docs where col='members' and id=${me.uid}`;
          const h = "o:" + (r[0] ? r[0].data.st : "-");
          if (hs.members !== h) out.members = { h, docs: r.map(pub("members", "none")) };
        }
        return res.json(out);
      }
      if (!cols.length) return res.json(out);
      const publicCols = cols.filter((c) => !PRIVATE.has(c)), privateCols = cols.filter((c) => PRIVATE.has(c));
      const s = publicCols.length
        ? await sql`select col,count(*)::int c,coalesce(max(upd),0)::text m from docs where col=any(${sql.array(publicCols)}) group by col`
        : [];
      const hm = {}; s.forEach((x) => (hm[x.col] = x.c + "-" + x.m));
      if (privateCols.length) {
        const own = await sql`select col,count(*)::int c,coalesce(max(upd),0)::text m from docs where col=any(${sql.array(privateCols)}) and uid=${me.uid} group by col`;
        own.forEach((x) => (hm[x.col] = x.c + "-" + x.m));
      }
      const ch = cols.filter((c) => (hm[c] || "0-0") !== hs[c]);
      if (ch.length) {
        const publicChanged = ch.filter((c) => !PRIVATE.has(c)), privateChanged = ch.filter((c) => PRIVATE.has(c));
        const rows = publicChanged.length
          ? await sql`select col,id,data from docs where col=any(${sql.array(publicChanged)}) order by t`
          : [];
        if (privateChanged.length) {
          const own = await sql`select col,id,data from docs where col=any(${sql.array(privateChanged)}) and uid=${me.uid} order by t`;
          rows.push(...own);
        }
        ch.forEach((c) => { out[c] = { h: hm[c] || "0-0", docs: rows.filter((x) => x.col === c).slice(-500).map(pub(c, me.role)) }; });
      }
      return res.json(out);
    }

    if (!COLS.includes(col)) return fail(res, 400, "Collection inconnue");
    if (id && !/^[\w\-:.]{1,100}$/.test(id)) return fail(res, 400, "Identifiant invalide");
    const ex = id ? (await sql`select data,uid from docs where col=${col} and id=${id}`)[0] : null;

    // Annuler sa propre demande d'accès
    if (req.method === "DELETE" && col === "members" && id === me.uid && me.st === "pend") {
      await sql`delete from docs where col='members' and id=${id}`;
      return res.json({ ok: true });
    }
    if (me.role === "none") {
      const message = me.st === "pend"
        ? "Ton compte est en attente d’activation par le super admin."
        : me.st === "off"
          ? "Ton compte est désactivé. Contacte le super admin."
          : "Connecte-toi avec un compte membre activé pour envoyer un message.";
      return fail(res, 403, message);
    }
    if (SA_ONLY.has(col) && me.role !== "sa") return fail(res, 403, "Réservé au super admin");
    if (JSON.stringify(b).length > 8000) return fail(res, 413, "Contenu trop volumineux");
    const by = me.sa ? String(b.by || "Super admin").slice(0, 20) : me.name;
    const own = ex && (ex.uid === me.uid || adm(me.role));

    if (req.method === "POST") {
      if (col === "members" || (ADM_ONLY.has(col) && !adm(me.role))) return fail(res, 403, "Action non autorisée");
      const nid = (PRIVATE.has(col) ? me.uid + "_" : "") + crypto.randomBytes(8).toString("hex");
      const d = { ...strip(b), u: me.uid, by, t: now };
      await sql`insert into docs(col,id,data,uid,t,upd) values(${col},${nid},${JSON.stringify(d)}::jsonb,${me.uid},${now},${now})`;
      return res.json({ id: nid });
    }

    if (req.method === "PUT") {
      if (col === "members" || (ADM_ONLY.has(col) && !adm(me.role))) return fail(res, 403, "Action non autorisée");
      const chk = SELF_ID[col];
      if (chk && !chk(id, me.uid)) return fail(res, 403, "Action non autorisée");
      if (ex && !own && !chk) return fail(res, 403, "Action non autorisée");
      const d = { ...strip(b), u: me.uid, by, t: ex ? ex.data.t : now };
      await sql`insert into docs(col,id,data,uid,t,upd) values(${col},${id},${JSON.stringify(d)}::jsonb,${me.uid},${now},${now})
        on conflict(col,id) do update set data=${JSON.stringify(d)}::jsonb, upd=${now}, uid=${me.uid}`;
      return res.json({ ok: true });
    }

    if (req.method === "PATCH") {
      if (!ex) return fail(res, 404, "Introuvable");
      const p = strip(b), keys = Object.keys(p);
      if (col === "members") {
        const ok = me.role === "sa" || (me.role === "mod" && ex.data.st === "pend" && ex.data.role !== "mod" && keys.length === 1 && p.st === "on");
        if (!ok) return fail(res, 403, "Action non autorisée");
      } else if (!own) {
        const re = LOOSE[col];
        if (!re || !keys.every((k) => re.test(k))) return fail(res, 403, "Action non autorisée");
      }
      if (!adm(me.role) && (keys.includes("pin") || p.rep === false)) return fail(res, 403, "Réservé aux modérateurs");
      await sql`update docs set data=data||${JSON.stringify(p)}::jsonb, upd=${now} where col=${col} and id=${id}`;
      return res.json({ ok: true });
    }

    if (req.method === "DELETE") {
      if (!ex) return res.json({ ok: true });
      if (col === "members") {
        const ok = me.role === "sa" || (me.role === "mod" && ex.data.st === "pend" && ex.data.role !== "mod");
        if (!ok) return fail(res, 403, "Action non autorisée");
      } else if (!own) return fail(res, 403, "Action non autorisée");
      await sql`delete from docs where col=${col} and id=${id}`;
      return res.json({ ok: true });
    }
    return fail(res, 405, "Méthode non permise");
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
