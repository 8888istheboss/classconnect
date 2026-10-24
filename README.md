# ClassConnect (Vercel + Neon)

Site de classe avec chat, salons, groupes, sondages, sorties laser game, League, super admin,
codes d'invitation et **validation des nouveaux membres par l'admin**. Tout est vérifié côté serveur.

## 1. Mettre le projet sur GitHub
```bash
cd classconnect
git init && git add . && git commit -m "ClassConnect"
git branch -M main
git remote add origin https://github.com/TON-COMPTE/classconnect.git
git push -u origin main
```
(Crée d'abord un dépôt vide « classconnect » sur github.com, de préférence en **privé**.)

## 2. Déployer sur Vercel
1. vercel.com → **Add New… → Project** → importe le dépôt GitHub. Aucun réglage de build à changer.
2. Onglet **Storage** du projet → **Create Database** → **Neon (Postgres)** → connecte-le au projet.
   Vercel ajoute tout seul la variable `DATABASE_URL`.
3. **Settings → Environment Variables**, ajoute :
   - `SESSION_SECRET` : une longue valeur aléatoire (ex. `openssl rand -hex 32`)
   - `SUPERADMIN_CODE` : ton code super admin (une phrase longue, pas ton nom)
4. **Deployments → Redeploy** pour appliquer les variables. Les tables se créent toutes seules.

## 3. Premier usage
1. Ouvre le site → onglet **Super admin** → entre ton pseudo et `SUPERADMIN_CODE`.
2. Onglet Super admin → génère des **codes d'invitation** et donne-les à ta classe.
3. Les élèves entrent pseudo + code → leur demande arrive dans **Super admin → Membres** (ou l'onglet Demandes) → tu acceptes.

## Test en local (optionnel)
```bash
npm i -g vercel && npm install
vercel link && vercel env pull .env.local
vercel dev
```
