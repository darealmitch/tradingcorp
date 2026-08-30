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
  functions/   7 Edge Functions (Deno)
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

| Fonction              | Rôle                                               | JWT                        |
| --------------------- | -------------------------------------------------- | -------------------------- |
| `checkout`            | Ouvre une session Stripe Checkout                  | requis                     |
| `stripe-webhook`      | Enregistre paiements, inscriptions, remboursements | **non** (signature Stripe) |
| `corriger-quiz`       | Corrige un quiz côté serveur                       | requis                     |
| `creer-compte`        | Création de compte par un administrateur           | requis                     |
| `supprimer-compte`    | Suppression de compte                              | requis                     |
| `generer-certificat`  | Produit le diplôme PDF                             | requis                     |
| `cmc-proxy`           | Relais CoinMarketCap du ticker                     | **non**                    |
| `verifier-certificat` | Vérification publique d'un diplôme                 | **non**                    |

```bash
supabase functions deploy <nom>
supabase functions deploy cmc-proxy --no-verify-jwt          # idem verifier-certificat, stripe-webhook
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
d'autorisation. Publication sur GitHub Pages après une CI verte.

Le site est servi sur **https://tradingcorp.fr**, à la racine du domaine — d'où
`--base-href /` dans la CI. Le domaine tient à deux fichiers versionnés :
`public/CNAME`, qui voyage dans l'artefact publié (sans lui, un déploiement
efface le domaine personnalisé enregistré côté dépôt), et `public/robots.txt`,
qui référence `public/sitemap.xml`.

Trois endroits nomment ce domaine et doivent changer ensemble le jour où il
change : `public/CNAME`, `supabase/functions/_partages/cors.ts` (liste blanche
CORS et bases de retour Stripe) et la configuration des URL de Supabase Auth,
qui vit hors du dépôt.

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
