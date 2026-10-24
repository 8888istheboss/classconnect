import crypto from "node:crypto";
import { sql, who, body, clean } from "./_lib.js";

const fail = (res, status, message) => res.status(status).json({ error: message });
const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export default async function handler(req, res) {
  try {
    const me = await who(req, res);
    if (!me.sa) return fail(res, 403, "Connecte-toi avec le compte Professeur pour créer un code.");
    if (req.method !== "POST") return fail(res, 405, "Méthode non autorisée.");

    const b = body(req);
    const role = b.role === "mod" ? "mod" : "member";
    const max = b.max === "" || b.max == null ? 0 : Number(b.max);
    if (!Number.isSafeInteger(max) || max < 0 || max > 10000) {
      return fail(res, 400, "Le nombre d’utilisations doit être compris entre 0 et 10 000.");
    }

    const now = Date.now();
    const created = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(31841027)`;
      for (let attempt = 0; attempt < 5; attempt++) {
        const bytes = crypto.randomBytes(8);
        let suffix = "";
        for (let i = 0; i < 8; i++) suffix += alphabet[bytes[i] % alphabet.length];
        const code = "CC-" + suffix;
        const existing = await tx`select 1 from docs where col='codes' and data->>'cd'=${code} limit 1`;
        if (existing.length) continue;

        const id = "c" + crypto.randomBytes(12).toString("hex");
        const data = { cd: code, role, mx: max, on: true, n: 0, by: clean(me.name || "Professeur", 20), t: now };
        await tx`insert into docs(col,id,data,uid,t,upd) values('codes',${id},${JSON.stringify(data)}::jsonb,${me.uid},${now},${now})`;
        return { id, code, role, max, n: 0, on: true, by: data.by, t: now };
      }
      throw new Error("Impossible de générer un code unique. Réessaie.");
    });

    return res.status(201).json({ invite: created });
  } catch (error) {
    console.error("Invitation creation failed:", error);
    return res.status(500).json({ error: "Le code n’a pas pu être créé. Vérifie la connexion au cloud et réessaie." });
  }
}
