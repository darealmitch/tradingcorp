# TradingCorp

Plateforme de formation au trading : une formation vendue en accès à vie, un espace
apprenant avec parcours vidéo et quiz, un back-office d'administration.

Front **Angular 22** (composants autonomes, signaux), base **Supabase/PostgreSQL**,
paiement **Stripe**, vidéos **Bunny Stream**, médias **Cloudinary**.

---

## Démarrer

```bash
npm install
npm start          # http://localhost:4200
```

Le développement requiert **Node ≥ 22.22.3** (contrainte du CLI Angular 22).

Le ticker de la page d'accueil passe par `proxy.conf.js`, qui relaie vers CoinMarketCap
avec la clé lue dans la variable d'environnement `CMC_API_KEY`. Sans elle, le bandeau
reste vide — le reste de l'application fonctionne.

| Commande                 | Effet                                                 |
| ------------------------ | ----------------------------------------------------- |
| `npm start`              | Serveur de développement                              |
| `npm run build`          | Build de production                                   |
| `npm test`               | Tests unitaires (Vitest)                              |
| `npm run lint`           | ESLint                                                |
| `npm run types:generate` | Régénère `database.types.ts` depuis le schéma distant |

---

## Architecture

```
src/app/
  core/        Services par domaine métier — aucun composant
    supabase/  Point de passage UNIQUE vers la base (voir ci-dessous)
    auth/ commerce/ contenu/ moderation/ pilotage/ notifications/ …
  features/    Écrans, un dossier par route
supabase/
  migrations/  Le schéma, versionné — source de vérité
  functions/   10 Edge Functions (Deno)
  tests/       Tests d'autorisation pgTAP
```

### La règle qui structure le code front

**Aucun service n'appelle `from()`, `rpc()` ou `functions.invoke()` directement.**
Tout passe par `core/supabase/acces-donnees.ts`.

La raison est concrète : le client Supabase ne lève pas d'exception, il rend
`{ data, error }`. Ignorer `error` transforme un échec en succès aux données vides —
un tableau de bord en panne devient indiscernable d'un tableau de bord à zéro. La
couche d'accès rend cet oubli impossible à commettre en silence, et **un test le
vérifie mécaniquement**.

C'est aussi là que sont branchés le typage du schéma et la journalisation des
incidents.

### La règle qui structure la base

**La base est l'autorité, pas l'écran.** Chaque table est protégée par RLS ; les
opérations sensibles passent par des fonctions `SECURITY DEFINER` qui posent
elles-mêmes leur contrôle. Un écran qui filtre est un confort d'affichage, jamais une
protection.

Corollaire appliqué partout : **ce qu'un commentaire affirme doit être ce que la base
applique**. Les colonnes que le client a le droit d'écrire le disent dans leur
`comment on column` — par exemple `progression_lecons.video_terminee_le`, qui est une
intention pédagogique et non une preuve de visionnage.

---

## Base de données

Le dossier `supabase/migrations/` **est** le schéma. Il n'y a pas d'autre source de
vérité : ce qui n'y figure pas n'existe pas sur une base neuve.

```bash
supabase migration new <nom>     # créer
supabase db push                 # appliquer
SUPABASE_DB_URL="postgresql://…" ./supabase/verifier-migrations.sh
```

Le script de vérification confronte les fichiers du dépôt à
`supabase_migrations.schema_migrations` — versions **et** noms. La CI l'exécute à
chaque passage. **Sans le secret `SUPABASE_DB_URL`, il s'ignore au lieu de contrôler.**

⚠️ **Ne jamais appliquer une migration par l'éditeur SQL du dashboard** : il n'inscrit
rien dans l'historique. C'est ainsi que le dépôt et la base avaient divergé — 29
fichiers pour 12 lignes enregistrées.

Après toute migration touchant tables ou fonctions : `npm run types:generate`.

---

## Edge Functions

| Fonction               | Rôle                                               | JWT                        |
| ---------------------- | -------------------------------------------------- | -------------------------- |
| `checkout`             | Ouvre une session Stripe Checkout                  | requis                     |
| `stripe-webhook`       | Enregistre paiements, inscriptions, remboursements | **non** (signature Stripe) |
| `corriger-quiz`        | Corrige un quiz côté serveur                       | requis                     |
| `creer-compte`         | Création de compte par un administrateur           | requis                     |
| `supprimer-compte`     | Suppression de compte                              | requis                     |
| `generer-certificat`   | Produit le diplôme PDF                             | requis                     |
| `cloudinary-signature` | Signe un envoi de média (staff)                    | requis                     |
| `cmc-proxy`            | Relais CoinMarketCap du ticker                     | **non**                    |
| `verifier-certificat`  | Vérification publique d'un diplôme                 | **non**                    |
| `incident`             | Collecte les erreurs survenues dans le navigateur  | **non**                    |

**La CI les publie** à chaque passage vert sur `main` (job `fonctions-deploiement`,
après le `deno check`). Le déploiement à la main n'est plus la voie normale :
c'était le seul endroit où le dépôt pouvait s'écarter du déployé sans que rien
ne le signale.

⚠️ `functions deploy` protège par défaut chaque fonction derrière un JWT. Les
quatre qui doivent rester publiques — `cmc-proxy`, `stripe-webhook`,
`verifier-certificat`, `incident` — sont énumérées dans le workflow, et c'est cette liste
qui décide. Le défaut (protégé) est le bon défaut : une fonction ajoutée sans
qu'on y pense naît fermée.

```bash
# Publication manuelle, en dépannage seulement :
supabase functions deploy <nom> --project-ref swzjzwymzjhdatcobibs
supabase functions deploy cmc-proxy --project-ref swzjzwymzjhdatcobibs --no-verify-jwt
```

Secrets attendus : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CMC_API_KEY`,
`CLOUDINARY_*`, `SITE_URL`. Voir `supabase/functions/.env.example`.

Les origines autorisées à appeler ces fonctions sont listées dans
`supabase/functions/_partages/cors.ts`. `SITE_URL` en ajoute une sans redéployer.

---

## Rôles

| Rôle        | Peut                                                             |
| ----------- | ---------------------------------------------------------------- |
| `apprenant` | Suivre son parcours, passer les quiz, commenter, déposer un avis |
| `formateur` | Tout ce qui précède + gérer le contenu et modérer                |
| `admin`     | Tout + comptes, rôles, paiements, journal d'administration       |

Deux drapeaux modifient l'accès, tous deux réservés aux administrateurs :

- **`est_proprietaire`** — compte qu'aucune opération d'administration ne peut modifier.
- **`est_test`** — donne accès à **tout le catalogue payant** sans achat (`acces_demo()`).
  C'est le privilège le plus étendu après le rôle d'administrateur ; son octroi et son
  retrait sont journalisés dans `journal_admin`.

L'accès à la formation est porté par la table `inscriptions`, jamais par le paiement :
c'est elle qui s'ouvre à l'achat et se révoque au remboursement.

---

## Déploiement

`main` déclenche la CI (`.github/workflows/ci.yml`) : lint, format, tests, build,
cohérence des migrations, `deno check` sur les Edge Functions, puis un job qui
**reconstruit une base éphémère depuis les seules migrations** et y joue les tests
d'autorisation. Publication sur **Cloudflare Pages** après une CI verte.

Le déploiement n'est **pas** confié à l'intégration Git de Cloudflare, qui
publierait à chaque push sans rien attendre : le job `deploy` récupère le build
déjà vérifié et l'envoie avec `wrangler`. Un test rouge empêche la mise en
ligne. Deux secrets le font marcher : `CLOUDFLARE_API_TOKEN` (portée « Cloudflare
Pages : Edit ») et `CLOUDFLARE_ACCOUNT_ID`.

### Les trois environnements

| Adresse                              | Hébergeur        | Rôle           | Publié par                   |
| ------------------------------------ | ---------------- | -------------- | ---------------------------- |
| `tradingcorp.fr`                     | Cloudflare Pages | **production** | job `deploy`, après CI verte |
| `darealmitch.github.io/tradingcorp/` | GitHub Pages     | démonstration  | job `demonstration`          |
| `dev.tradingcorp.fr`                 | Vercel           | développement  | intégration Git de Vercel    |

Une seule branche et un seul code source : les différences sont produites au
build, jamais dans les sources. La démonstration est construite avec
`--base-href /tradingcorp/`, reçoit un `404.html` en guise de repli SPA et un
`robots.txt` fermé — deux sites au contenu identique se cannibalisent dans les
moteurs, et c'est `tradingcorp.fr` qui doit ressortir.

Vercel ne lit ni `_headers` ni `_redirects` : sa configuration vit dans
`vercel.json`, qui rejoue les mêmes en-têtes et ajoute `X-Robots-Tag: noindex`.

> ⚠️ **Le développement partage la base de production.** Décision assumée tant
> qu'il n'y a pas de clients : un compte supprimé pendant un test est un compte
> réellement supprimé, et un achat lancé depuis `dev.` est un vrai paiement.
> Le jour où des apprenants payants existent, il faut un second projet Supabase
> — le plan gratuit en autorise deux — avec les migrations et les seeds rejoués
> dessus.

### Le site de production

Servi sur **https://tradingcorp.fr**, à la racine du domaine — d'où
`--base-href /`. Deux fichiers de `public/` pilotent l'hébergement :

- `_redirects` — repli SPA `/* /index.html 200`. Le **200** est ce que GitHub
  Pages ne savait pas faire : ses routes profondes répondaient 404 tout en
  affichant la bonne page.
- `_headers` — en-têtes de sécurité (HSTS, `X-Frame-Options`, `Referrer-Policy`)
  et politique de sécurité du contenu, **en `Report-Only`** tant que le site n'a
  pas été parcouru de bout en bout sans avertissement. GitHub Pages n'autorisait
  aucun en-tête personnalisé : c'est l'une des deux raisons du déménagement.

Trois endroits nomment le domaine et doivent changer ensemble le jour où il
change : `supabase/functions/_partages/cors.ts` (liste blanche CORS et bases de
retour Stripe), `src/app/core/seo/url-canonique.service.ts` (l'adresse de
référence déclarée aux moteurs de recherche) et la configuration des URL de
Supabase Auth, hors dépôt. Les origines autorisées par la CSP sont listées dans
`_headers`.

Une sauvegarde quotidienne de la base tourne dans `sauvegarde-bdd.yml`.

---

## Documentation interne

- `MEDIAS-CLOUDINARY.md` — inventaire des médias

Quatre autres documents vivent **hors du dépôt** (`.gitignore`, section « Notes internes ») :
ils existent sur le poste du mainteneur et nulle part ailleurs.

- `AUDIT-ARCHITECTURE.md` — décisions de conception d'origine (D1 à D8)
- `AUDIT-PREPRODUCTION-2026-07-31.md` — audit technique, 26 points numérotés P-01 à P-26
- `AUDIT-SUIVI-2026-08-25.md` — état de chacun de ces points
- `VIDEOS-BUNNY.md` — inventaire des vidéos Bunny Stream

Les numéros `P-xx` cités dans les commentaires du code renvoient à ce dernier audit : ils
disent quel défaut la ligne corrige, et pourquoi elle est écrite ainsi. Le code y fait
référence sans que le fichier soit joignable depuis le dépôt — c'est exactement le défaut que
décrivait P-15, réduit ici au strict nécessaire plutôt que supprimé.
