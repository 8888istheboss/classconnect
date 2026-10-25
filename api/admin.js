// Administration : validation des comptes, rôles, réglages globaux, modération.
import {
  api, actions, sql, fail, str, id, int, validPassword, hashPassword, log,
  requireStaff, requireAdmin,
} from "./_lib/core.js";

const TAB_RE = /^[a-z]{2,20}$/;

function ids(value) {
  const list = Array.isArray(value) ? value : [value];
  if (!list.length || list.length > 200) fail(400, "Sélection invalide.");
  return list.map(id);
}

async function target(userId) {
  const [u] = await sql`select id, display_name, role, status from users where id = ${id(userId)} and not del`;
  if (!u) fail(404, "Compte introuvable.");
  return u;
}

// Suppression douce : le compte disparaît pour tout le monde et le pseudo redevient libre.
function softDelete(userId, now) {
  return sql`
    update users set del = true, status = 'disabled', sv = sv + 1, upd = ${now},
      username = 'deleted:' || id
    where id = ${userId}`;
}

export default api({
  async GET({ me, query }) {
    if (query.op === "users") {
      requireStaff(me);
      const users = await sql`
        select id, username, display_name, role, status, muted, emoji, color,
               created, approved_at, approved_by, last_seen
        from users where not del
        order by (status = 'pending') desc, created desc`;
      return { users };
    }
    if (query.op === "logs") {
      requireAdmin(me);
      const logs = await sql`select at, actor, msg from logs order by id desc limit 100`;
      return { logs };
    }
    fail(400, "Requête inconnue.");
  },

  POST: actions({
    // Accepter un ou plusieurs comptes (modérateurs : seulement les comptes en attente).
    async approve({ me, body }) {
      requireStaff(me);
      const now = Date.now();
      const rows = await sql`
        update users set status = 'active', approved_at = ${now}, approved_by = ${me.displayName}, upd = ${now}
        where id = any(${sql.array(ids(body.ids))}) and not del and status <> 'active'
          and (${me.isSA} or status = 'pending')
        returning display_name`;
      if (rows.length) await log(me.displayName, `Compte(s) accepté(s) : ${rows.map((r) => r.display_name).join(", ")}`);
      return { count: rows.length };
    },

    async approveAll({ me }) {
      requireStaff(me);
      const now = Date.now();
      const rows = await sql`
        update users set status = 'active', approved_at = ${now}, approved_by = ${me.displayName}, upd = ${now}
        where status = 'pending' and not del returning display_name`;
      if (rows.length) await log(me.displayName, `${rows.length} compte(s) accepté(s) en une fois`);
      return { count: rows.length };
    },

    // Refuser une inscription en attente : le compte est supprimé.
    async reject({ me, body }) {
      requireStaff(me);
      const u = await target(body.id);
      if (u.status !== "pending") fail(409, "Seuls les comptes en attente peuvent être refusés.");
      await softDelete(u.id, Date.now());
      await log(me.displayName, `Inscription refusée : ${u.display_name}`);
      return { ok: true };
    },

    async disable({ me, body }) {
      requireAdmin(me);
      const u = await target(body.id);
      await sql`update users set status = 'disabled', sv = sv + 1, upd = ${Date.now()} where id = ${u.id}`;
      await log(me.displayName, `Compte désactivé : ${u.display_name}`);
      return { ok: true };
    },

    async remove({ me, body }) {
      requireAdmin(me);
      const u = await target(body.id);
      await softDelete(u.id, Date.now());
      await log(me.displayName, `Compte supprimé : ${u.display_name}`);
      return { ok: true };
    },

    async role({ me, body }) {
      requireAdmin(me);
      const u = await target(body.id);
      const role = body.role === "mod" ? "mod" : "member";
      await sql`update users set role = ${role}, upd = ${Date.now()} where id = ${u.id}`;
      await log(me.displayName, `${u.display_name} est maintenant ${role === "mod" ? "modérateur" : "membre"}`);
      return { ok: true };
    },

    async mute({ me, body }) {
      requireStaff(me);
      const u = await target(body.id);
      if (!me.isSA && u.role === "mod") fail(403, "Seul le professeur peut rendre muet un modérateur.");
      const muted = !!body.muted;
      await sql`update users set muted = ${muted}, upd = ${Date.now()} where id = ${u.id}`;
      await log(me.displayName, `${u.display_name} ${muted ? "ne peut plus écrire dans le chat" : "peut de nouveau écrire"}`);
      return { ok: true };
    },

    async resetPassword({ me, body }) {
      requireAdmin(me);
      const u = await target(body.id);
      const { salt, hash } = await hashPassword(validPassword(body.password));
      await sql`update users set salt = ${salt}, hash = ${hash}, sv = sv + 1 where id = ${u.id}`;
      await log(me.displayName, `Mot de passe réinitialisé pour ${u.display_name}`);
      return { ok: true };
    },

    async settings({ me, body }) {
      requireAdmin(me);
      const hidden = Array.isArray(body.hiddenTabs) ? body.hiddenTabs.filter((t) => TAB_RE.test(t)).slice(0, 20) : [];
      const data = { chatLocked: !!body.chatLocked, banner: str(body.banner, 160), hiddenTabs: hidden };
      await sql`update settings set data = ${sql.json(data)}::jsonb, upd = ${Date.now()} where id = 'main'`;
      await log(me.displayName, "Réglages globaux modifiés");
      return { ok: true };
    },

    async purgeRoom({ me, body }) {
      requireAdmin(me);
      const room = str(body.room, 50, { min: 1, label: "Le salon" });
      const rows = await sql`update messages set del = true, upd = ${Date.now()} where room = ${room} and not del returning id`;
      await log(me.displayName, `Salon vidé (${rows.length} message(s))`);
      return { count: rows.length };
    },

    async resetLeague({ me }) {
      requireAdmin(me);
      await sql`update league set pts = 0, played = 0, upd = ${Date.now()}`;
      await log(me.displayName, "Classement remis à zéro");
      return { ok: true };
    },

    async bonus({ me, body }) {
      requireAdmin(me);
      const u = await target(body.id);
      const pts = int(body.points, -1000, 1000, "Le bonus");
      await sql`
        insert into league(uid, pts, upd) values(${u.id}, ${pts}, ${Date.now()})
        on conflict(uid) do update set pts = league.pts + ${pts}, upd = ${Date.now()}, del = false`;
      await log(me.displayName, `${pts > 0 ? "+" : ""}${pts} points pour ${u.display_name}`);
      return { ok: true };
    },
  }),
});
