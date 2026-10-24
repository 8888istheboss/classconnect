# ClassConnect (Vercel + PostgreSQL)

Site de classe avec chat, salons, groupes, sondages, sorties laser game, League, super admin,
codes d'invitation et **validation des nouveaux membres par l'admin**. Tout est vérifié côté serveur.

## Déploiement cloud obligatoire

L'application n'utilise pas de stockage local pour les données. Les comptes, messages,
paramètres, flashcards et données de classe sont enregistrés dans PostgreSQL via l'API Vercel.
Si la base cloud est indisponible ou mal configurée, l'application affiche une erreur au lieu
de basculer vers un mode local.

1. Dans Vercel, ouvre le projet **classconnect** et lie-le au dépôt GitHub `8888istheboss/classconnect`.
2. Crée une base PostgreSQL (Supabase ou Neon) et copie sa chaîne de connexion PostgreSQL.
   Pour Supabase avec Vercel, ouvre **Connect → Session pooler** et utilise la chaîne URI
   affichée. Remplace son mot de passe dans le tableau de bord, pas dans le code. Dans Vercel,
   définis la chaîne complète comme `DATABASE_URL` en Production.
3. Dans **Settings → Environment Variables**, configure pour **Production** :
   - `SESSION_SECRET` : une valeur aléatoire longue générée de manière sécurisée.
   - `SUPERADMIN_CODE` : un code super admin long et confidentiel.
4. Redéploie le projet pour appliquer les variables. Les tables PostgreSQL sont créées
   automatiquement au premier appel de l'API.

Les élèves peuvent créer un compte avec un pseudo et un mot de passe d'au moins 8 caractères.
Le compte reste en attente jusqu'à son activation par le super admin dans l'onglet **Super admin**.
Les mots de passe sont hachés côté serveur et ne sont jamais enregistrés en clair.

Ne place jamais `DATABASE_URL`, `SESSION_SECRET` ou `SUPERADMIN_CODE` dans les fichiers du
projet ou dans Git. Si l'API `/api/session` répond avec une erreur de connexion PostgreSQL,
vérifie la valeur de `DATABASE_URL` dans les paramètres Vercel et redéploie.

## 3. Premier usage
1. Ouvre le site → onglet **Super admin** → entre ton pseudo et `SUPERADMIN_CODE`.
2. Onglet Super admin → génère des **codes d'invitation** et donne-les à ta classe.
3. Les élèves entrent pseudo + code → leur demande arrive dans **Super admin → Membres** (ou l'onglet Demandes) → tu acceptes.

Les modifications poussées sur la branche `main` sont déployées par l'intégration GitHub/Vercel.
