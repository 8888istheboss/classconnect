// Comptes : inscription (pseudo + mot de passe, en attente de validation), connexion, profil.
import {
  api, actions, sql, fail, str, validPassword, hashPassword, checkPassword, safeEqual,
  setSession, clearSession, adminKey, ADMIN_USER, toMe, newId, clientIp, limit, clearLimit, log, requireActive,
} from "./_lib/core.js";

const USERNAME_RE = /^[\p{L}\p{N}_.-]{3,20}$/u;
const RESERVED = new Set(["professeur", "admin", "administrateur", "superadmin", "moderateur", "classconnect"]);
const DUMMY = { salt: "classconnect-dummy-salt", hash: "00".repeat(64) };

async function loadMe(id) {
  const [u] = await sql`
    select id, username, display_name, role, status, emoji, color, muted, created
    from users where id = ${id} and not del`;
  return u ? toMe(u) : null;
}

export default api({
  GET: ({ me }) => ({ user: me }),

  POST: actions({
    async register({ req, res, body, me }) {
      if (me) fail(409, "Déconnecte-toi avant de créer un autre compte.");
      const display = str(body.username, 20, { min: 1, label: "Le pseudo" });
      if (!USERNAME_RE.test(display)) {
        fail(400, "Le pseudo doit faire 3 à 20 caractères : lettres, chiffres, point, tiret ou underscore.");
      }
      const username = display.toLowerCase();
      if (RESERVED.has(username)) fail(400, "Ce pseudo est réservé. Choisis-en un autre.");
      const password = validPassword(body.password);
      await limit("register:" + clientIp(req), 5, 3600e3);

      const { salt, hash } = await hashPassword(password);
      const id = newId(), now = Date.now();
      try {
        await sql`
          insert into users(id, username, display_name, salt, hash, status, created, last_seen, upd)
          values(${id}, ${username}, ${display}, ${salt}, ${hash}, 'pending', ${now}, ${now}, ${now})`;
      } catch (e) {
        if (e.code === "23505") fail(409, "Ce pseudo est déjà utilisé. Choisis-en un autre.");
        throw e;
      }
      await log(display, `Nouvelle inscription en attente de validation : ${display}`);
      setSession(req, res, { uid: id, sv: 0 });
      return { user: await loadMe(id) };
    },

    async login({ req, res, body }) {
      const username = str(body.username, 20).toLowerCase();
      const password = typeof body.password === "string" ? body.password.slice(0, 128) : "";
      if (!username || !password) fail(400, "Saisis ton pseudo et ton mot de passe.");
      await limit("login-ip:" + clientIp(req), 30, 10 * 60e3);
      await limit("login-user:" + username, 8, 15 * 60e3);

      const [u] = await sql`select id, salt, hash, sv from users where username = ${username} and not del`;
      const valid = await checkPassword(password, u ? u.salt : DUMMY.salt, u ? u.hash : DUMMY.hash);
      if (!u || !valid) fail(401, "Pseudo ou mot de passe incorrect.");

      await clearLimit("login-user:" + username);
      await sql`update users set last_seen = ${Date.now()} where id = ${u.id}`;
      setSession(req, res, { uid: u.id, sv: u.sv });
      return { user: await loadMe(u.id) };
    },

    async adminLogin({ req, res, body }) {
      const code = process.env.SUPERADMIN_CODE;
      if (!code) fail(500, "SUPERADMIN_CODE n'est pas configuré sur le serveur.");
      await limit("admin:" + clientIp(req), 5, 15 * 60e3);
      if (!safeEqual(String(body.code ?? "").trim(), code.trim())) fail(401, "Code professeur incorrect.");
      await clearLimit("admin:" + clientIp(req));
      setSession(req, res, { uid: "sa", sa: true, k: adminKey(code) }, 7);
      await log("Professeur", "Connexion professeur");
      return { user: ADMIN_USER };
    },

    async logout({ req, res }) {
      clearSession(req, res);
      return { ok: true };
    },

    async profile({ me, body }) {
      requireActive(me);
      if (me.isSA) fail(400, "Le profil professeur n'est pas modifiable.");
      const displayName = str(body.displayName, 20, { min: 2, label: "Le nom affiché" });
      const emoji = str(body.emoji, 8) || "🙂";
      const color = str(body.color, 7);
      if (!/^#[0-9a-f]{6}$/i.test(color)) fail(400, "Couleur invalide.");
      await sql`
        update users set display_name = ${displayName}, emoji = ${emoji}, color = ${color}, upd = ${Date.now()}
        where id = ${me.id}`;
      return { user: await loadMe(me.id) };
    },

    async password({ req, res, me, body }) {
      if (!me || me.isSA) fail(403, "Action impossible pour ce compte.");
      const next = validPassword(body.next);
      await limit("password:" + me.id, 5, 15 * 60e3);
      const [u] = await sql`select salt, hash, sv from users where id = ${me.id}`;
      if (!(await checkPassword(String(body.current ?? ""), u.salt, u.hash))) fail(401, "Mot de passe actuel incorrect.");
      const { salt, hash } = await hashPassword(next);
      const [r] = await sql`
        update users set salt = ${salt}, hash = ${hash}, sv = sv + 1 where id = ${me.id} returning sv`;
      setSession(req, res, { uid: me.id, sv: r.sv }); // les autres appareils sont déconnectés
      return { ok: true };
    },
  }),
});
