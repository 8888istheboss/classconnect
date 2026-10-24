# ClassConnect (Vercel + PostgreSQL)

Site de classe avec chat, salons, groupes, sondages, sorties laser game, League, défis quiz,
comptes par pseudo/mot de passe et **validation des nouveaux membres par l'admin**. Tout est
vérifié côté serveur.

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

Le professeur génère un code dans **Super admin → Codes d’invitation** et le transmet aux élèves.
L’inscription demande ce code, un pseudo et un mot de passe d’au moins 8 caractères ; un code
valide active le compte immédiatement. Les anciennes demandes en attente peuvent saisir un code
après s’être connectées. Les mots de passe sont hachés côté serveur et ne sont jamais enregistrés
en clair.

## Jeux et défis

Les membres activés peuvent lancer un duel de six questions ou un défi quotidien de 1 à 7 jours.
Un autre membre rejoint un défi en attente ; les bonnes réponses valent 10 points et sont évaluées
par l'API, pas par le navigateur. Les parties se mettent à jour par interrogation de l'API toutes
les deux secondes lorsque l'onglet Défis est ouvert. Les défis et scores sont enregistrés dans la
table PostgreSQL `games`.

Ne place jamais `DATABASE_URL`, `SESSION_SECRET` ou `SUPERADMIN_CODE` dans les fichiers du
projet ou dans Git. Si l'API `/api/session` répond avec une erreur de connexion PostgreSQL,
vérifie la valeur de `DATABASE_URL` dans les paramètres Vercel et redéploie.

## 3. Premier usage
1. Ouvre le site → onglet **Super admin** → entre ton pseudo et `SUPERADMIN_CODE`.
2. Onglet Super admin → génère un **code d’invitation** et le partage avec la classe.
3. Les élèves créent leur compte avec pseudo, mot de passe et code ; l’accès est activé dès validation du code.

Les modifications poussées sur la branche `main` sont déployées par l'intégration GitHub/Vercel.
