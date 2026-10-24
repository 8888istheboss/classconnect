import crypto from "node:crypto";
import { promisify } from "node:util";
import { sql, who, body, setCookie, clean, log } from "./_lib.js";

const norm = (s) => crypto.createHash("sha256").update(String(s ?? "").toLowerCase().trim().replace(/\s+/g, " ")).digest();
const scrypt = promisify(crypto.scrypt);
const accountName = (s) => clean(s, 20).toLowerCase();
const passwordHash = (password, salt) => scrypt(password, salt, 64);
const authIp = (req) => (req.headers["x-forwarded-for"] || "?").split(",")[0].trim().slice(0, 100);

async function consumeInvite(tx, value) {
  const code = clean(value, 20).toUpperCase();
  if (!code) return { error: "Saisis le code d’invitation fourni par le professeur." };
  const row = (await tx`select id,data from docs where col='codes' and data->>'cd'=${code} for update`)[0];
  const invite = row && row.data;
  if (!invite || !invite.on || (invite.mx && (invite.n || 0) >= invite.mx)) {
    return { error: "Code d’invitation invalide, révoqué ou déjà utilisé." };
  }
  await tx`update docs set data=jsonb_set(data,'{n}',to_jsonb(coalesce((data->>'n')::int,0)+1)),upd=${Date.now()} where col='codes' and id=${row.id}`;
  return { role: invite.role === "mod" ? "mod" : "member", code };
}

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

    if (b.action === "register" || b.action === "login") {
      const username = accountName(b.name);
      const password = typeof b.password === "string" ? b.password : "";
      if (!/^[\p{L}\p{N}_.-]{3,20}$/u.test(username)) {
        return res.status(400).json({ error: "Le pseudo doit contenir 3 à 20 caractères : lettres, chiffres, point, tiret ou underscore." });
      }
      if (password.length < 8 || password.length > 128) {
        return res.status(400).json({ error: "Le mot de passe doit contenir entre 8 et 128 caractères." });
      }

      const ip = authIp(req);
      const attempt = (await sql`insert into account_attempts(ip,n,until) values(${ip},1,0)
        on conflict(ip) do update set
          n=case when account_attempts.until>${now} then account_attempts.n when account_attempts.n+1>=5 then 0 else account_attempts.n+1 end,
          until=case when account_attempts.until>${now} then account_attempts.until when account_attempts.n+1>=5 then ${now + 300000} else 0 end
        returning n,until`)[0];
      if (attempt.until > now) return res.status(429).json({ error: "Trop d'essais. Réessaie dans quelques minutes." });

      if (b.action === "register") {
        if (me.sa || me.role !== "none" || me.st) return res.status(409).json({ error: "Déconnecte-toi avant de créer un autre compte." });
        if (!clean(b.code, 20)) return res.status(400).json({ error: "Saisis le code d’invitation fourni par le professeur." });
        const uid = "u" + crypto.randomBytes(12).toString("hex");
        const salt = crypto.randomBytes(16).toString("base64url");
        const hash = await passwordHash(password, salt);
        try {
          await sql.begin(async (tx) => {
            const invite = await consumeInvite(tx, b.code);
            if (invite.error) throw Object.assign(new Error(invite.error), { code: "INVITE_INVALID" });
            await tx`insert into accounts(username,uid,salt,password_hash,created_at) values(${username},${uid},${salt},${hash.toString("hex")},${now})`;
            await tx`insert into docs(col,id,data,uid,t,upd) values('members',${uid},${JSON.stringify({ nm: clean(b.name, 20), role: invite.role, st: "on", cd: invite.code })}::jsonb,${uid},${now},${now})`;
          });
        } catch (e) {
          if (e.code === "INVITE_INVALID") return res.status(400).json({ error: e.message });
          if (e.code === "23505") return res.status(409).json({ error: "Ce pseudo est déjà utilisé. Choisis-en un autre." });
          throw e;
        }
        await sql`delete from account_attempts where ip=${ip}`;
        setCookie(res, { uid, sa: false, exp: now + 30 * 864e5 });
        await log("Compte activé par code d’invitation : " + clean(b.name, 20));
        return res.status(201).json({ ok: true, st: "on" });
      }

      const account = (await sql`select uid,salt,password_hash from accounts where username=${username}`)[0];
      const hash = account ? await passwordHash(password, account.salt) : await passwordHash(password, "classconnect-invalid-user");
      const storedHash = account ? Buffer.from(account.password_hash, "hex") : Buffer.alloc(0);
      const valid = !!account && storedHash.length === hash.length && crypto.timingSafeEqual(hash, storedHash);
      if (!valid) {
        return res.status(401).json({ error: "Pseudo ou mot de passe incorrect." });
      }
      await sql`delete from account_attempts where ip=${ip}`;
      setCookie(res, { uid: account.uid, sa: false, exp: now + 30 * 864e5 });
      const member = (await sql`select data from docs where col='members' and id=${account.uid}`)[0];
      return res.json({ ok: true, st: member ? member.data.st : "off" });
    }

    if (b.action === "activate") {
      if (me.sa || !me.uid || me.st !== "pend") {
        return res.status(409).json({ error: "Aucun compte en attente à activer." });
      }
      const result = await sql.begin(async (tx) => {
        const account = (await tx`select uid from accounts where uid=${me.uid}`)[0];
        if (!account) return { error: "Connecte-toi avec le compte élève concerné." };
        const current = (await tx`select data from docs where col='members' and id=${me.uid} for update`)[0];
        if (!current || current.data.st !== "pend") return { error: "Ce compte n’est plus en attente d’activation." };
        const invite = await consumeInvite(tx, b.code);
        if (invite.error) return invite;
        await tx`update docs set data=data||${JSON.stringify({ st: "on", role: invite.role, cd: invite.code })}::jsonb,upd=${now} where col='members' and id=${me.uid} and data->>'st'='pend'`;
        return { ok: true, st: "on" };
      });
      if (result.error) return res.status(400).json({ error: result.error });
      await log("Compte activé par code d’invitation : " + me.name);
      return res.json(result);
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
      const joined = await sql.begin(async (tx) => {
        const invite = await consumeInvite(tx, code);
        if (invite.error) return invite;
        await tx`insert into docs(col,id,data,uid,t,upd) values('members',${me.uid},${JSON.stringify({ nm: name, role: invite.role, cd: invite.code, st: "on" })}::jsonb,${me.uid},${now},${now})`;
        return { ok: true, st: "on" };
      });
      if (joined.error) return res.status(400).json({ error: joined.error });
      await log("Nouvel accès par code d’invitation : " + name);
      return res.json(joined);
    }
    return res.status(400).json({ error: "Action inconnue" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
