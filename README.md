# ClassConnect 2 (Vercel + PostgreSQL)

Espace de classe : chat par salons, groupes avec salon privé, défis quiz (duel, défi quotidien),
League avec quiz solo et classement, planning partagé, flashcards privées, sondages, sorties
laser game, boîte à idées, échange de matériel, annuaire, administration.

## Comptes et validation

1. L'élève **crée son compte avec un pseudo et un mot de passe** (8 caractères minimum).
2. Le compte est **inactif (en attente)** : l'élève voit un écran d'attente qui se met à jour seul.
3. Le professeur (ou un modérateur) ouvre l'onglet **Comptes** : liste des comptes avec leur
   état **Actif / Inactif · en attente / Inactif · désactivé**, filtres, recherche, compteur dans
   le menu. Il peut **accepter** (un par un, une sélection, ou tous), **refuser**, désactiver,
   réactiver, promouvoir modérateur, rendre muet dans le chat, donner un nouveau mot de passe ou
   supprimer un compte.
4. Dès l'acceptation, l'élève entre automatiquement dans la classe.

Les modérateurs peuvent accepter ou refuser les nouveaux comptes ; les autres actions sur les
comptes sont réservées au professeur.

## Déploiement

1. Base PostgreSQL (Supabase ou Neon). Pour Supabase : **Connect → Session pooler**, chaîne URI.
2. Dans Vercel → **Settings → Environment Variables** (Production) :
   - `DATABASE_URL` : la chaîne de connexion PostgreSQL ;
   - `SESSION_SECRET` : une longue valeur aléatoire ;
   - `SUPERADMIN_CODE` : le code confidentiel du professeur.
3. Redéployer. Les tables sont créées automatiquement au premier appel.

Ne place jamais ces valeurs dans le code ni dans Git.

### Mise à jour depuis la version 1

Les comptes existants (table `accounts`) sont repris automatiquement au premier démarrage :
mêmes pseudos, mêmes mots de passe, même état (actif / suspendu / en attente) et même rôle.
Les anciennes tables (`docs`, `games`…) ne sont ni modifiées ni supprimées. Les anciens
messages et contenus ne sont pas repris dans la nouvelle version.

## Architecture

| Fichier | Rôle |
| --- | --- |
| `api/auth.js` | inscription, connexion, connexion professeur, profil, mot de passe |
| `api/admin.js` | liste et validation des comptes, rôles, réglages globaux, journal |
| `api/data.js` | synchronisation incrémentale + toutes les actions (chat, sondages…) |
| `api/game.js` | défis quiz et quiz solo, notés par le serveur |
| `api/_lib/core.js` | base de données, schéma, sessions, validation, limitation des essais |
| `public/js/app.js` | navigation et coque de l'application |
| `public/js/store.js` | données locales synchronisées |
| `public/js/views/*.js` | une vue par section |

Points clés :

- **Sécurité** : chaque action est vérifiée côté serveur (droits, tailles, formats). Les points
  de League ne peuvent plus être falsifiés depuis le navigateur. Mots de passe hachés (scrypt),
  cookie de session signé `HttpOnly`, sessions coupées en cas de désactivation ou de changement
  de mot de passe, limitation des essais de connexion, protection CSRF, en-têtes CSP.
- **Performance** : seules les modifications depuis la dernière synchronisation sont
  téléchargées (une requête légère toutes les 6 s, 2,5 s dans le chat, en pause quand l'onglet
  est masqué). Seules les parties de l'écran concernées sont redessinées.
- **Confidentialité** : les salons de groupe ne sont visibles que par leurs membres, les
  flashcards sont privées, les idées anonymes masquent l'auteur aux élèves.
