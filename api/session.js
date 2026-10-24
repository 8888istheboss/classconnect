import crypto from "node:crypto";
import { sql, who, body, setCookie, clean, log } from "./_lib.js";

const norm = (s) => crypto.createHash("sha256").update(String(s ?? "").toLowerCase().trim().replace(/\s+/g, " ")).digest();

export default async function handler(req, res) {
  try {
    const me = await who(req, res);
    if (req.method === "GET") return res.json(me);
    const b = body(req), now = Date.now();

    if (b.action === "logout") {
      res.setHeader("Set-Cookie", "cc=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
      return res.json({ ok: true });
    }

    if (b.action === "profile") {
      if (me.sa || !["member", "mod"].includes(me.role)) return res.status(403).json({ error: "Accès non autorisé" });
      const name = clean(b.name, 20);
      const emoji = clean(b.emoji, 8);
      const color = clean(b.color, 7);
      if (!name || !/^#[0-9a-f]{6}$/i.test(color)) return res.status(400).json({ error: "Profil invalide" });
      await sql`update docs set data=data||${JSON.stringify({ nm: name, e: emoji || "🙂", c: color })}::jsonb, upd=${now} where col='members' and id=${me.uid}`;
      return res.json({ ok: true });
    }

    if (b.action === "login-sa") {
      const exp = process.env.SUPERADMIN_CODE;
      if (!exp) return res.status(500).json({ error: "SUPERADMIN_CODE n'est pas configuré sur le serveur" });
      const ip = (req.headers["x-forwarded-for"] || "?").split(",")[0].trim();
      const a = (await sql`select n,until from attempts where ip=${ip}`)[0];
      if (a && a.until > now) return res.status(429).json({ error: "Trop d'essais, réessaie dans quelques minutes." });
      if (!crypto.timingSafeEqual(norm(b.pass), norm(exp))) {
        const n = (a ? a.n : 0) + 1, lock = n >= 5;
        await sql`insert into attempts(ip,n,until) values(${ip},${lock ? 0 : n},${lock ? now + 300000 : 0}) on conflict(ip) do update set n=${lock ? 0 : n}, until=${lock ? now + 300000 : 0}`;
        return res.status(401).json({ error: "Code incorrect" });
      }
      await sql`delete from attempts where ip=${ip}`;
      setCookie(res, { uid: "sa", sa: true, exp: now + 7 * 864e5 });
      await log("Connexion super admin");
      return res.json({ ok: true });
    }

    if (b.action === "join") {
      if (me.sa) return res.json({ ok: true, st: "on" });
      if (me.st) return res.json({ ok: true, st: me.st });
      const name = clean(b.name, 20), code = clean(b.code, 20).toUpperCase();
      if (!name) return res.status(400).json({ error: "Pseudo requis" });
      const c = (await sql`select id,data from docs where col='codes' and data->>'cd'=${code}`)[0];
      const d = c && c.data;
      if (!d || !d.on || (d.mx && (d.n || 0) >= d.mx)) return res.status(400).json({ error: "Code invalide, expiré ou révoqué" });
      const cfg = (await sql`select data from docs where col='cfg' and id='main'`)[0];
      const role = d.role === "mod" ? "mod" : "member";
      // Validation par l'admin : obligatoire (sauf si le super admin la désactive, et jamais pour un modérateur)
      const st = cfg && cfg.data.appr === false && role !== "mod" ? "on" : "pend";
      await sql`insert into docs(col,id,data,uid,t,upd) values('members',${me.uid},${JSON.stringify({ nm: name, role, cd: code, st })}::jsonb,${me.uid},${now},${now})`;
      await sql`update docs set data=jsonb_set(data,'{n}',to_jsonb(coalesce((data->>'n')::int,0)+1)), upd=${now} where col='codes' and id=${c.id}`;
      await log("Nouvelle demande : " + name);
      return res.json({ ok: true, st });
    }
    return res.status(400).json({ error: "Action inconnue" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
