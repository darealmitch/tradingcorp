# Médias du projet — Cloudinary

Cloudinary est le service **officiel de gestion des médias** de TradingCorp :
captures d'écran, illustrations, images de formation, ressources pédagogiques.

> Le profil utilisateur ne gère **aucune** image. Les identifiants/URLs Cloudinary
> se stockent dans les tables métier (`formations`, `lecons`, `ressources`…),
> jamais dans `profils`.

## Architecture de sécurité

| Valeur | Nature | Emplacement |
|---|---|---|
| **Cloud Name** | Public | `src/environments/environment.ts` et `environment.prod.ts` → `cloudinaryCloudName` |
| **API Key** | Non secrète mais serveur | Secret d'Edge Function `CLOUDINARY_API_KEY` |
| **API Secret** | **Secrète** | Secret d'Edge Function `CLOUDINARY_API_SECRET` |

Aucune clé secrète n'entre dans le build Angular : le front ne connaît que le
Cloud Name (pour construire les URLs de livraison). Les uploads sont **signés**
côté serveur par l'Edge Function `cloudinary-signature`, qui seule détient
l'API Secret.

## Où renseigner les valeurs

### 1. Cloud Name (public) — front
Dans `src/environments/environment.ts` **et** `src/environments/environment.prod.ts` :
```ts
cloudinaryCloudName: 'ton-cloud-name'
```

### 2. API Key + API Secret (serveur) — Edge Functions
Copier l'exemple et renseigner les 3 valeurs (Dashboard Cloudinary → Settings → API Keys) :
```bash
cp supabase/functions/.env.example supabase/functions/.env
```
```
CLOUDINARY_CLOUD_NAME=ton-cloud-name
CLOUDINARY_API_KEY=xxxxxxxxxxxx
CLOUDINARY_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
```
`supabase/functions/.env` est **ignoré par git** — il ne sera jamais committé.

Puis pousser les secrets vers Supabase (le projet doit être lié : `npx supabase link --project-ref swzjzwymzjhdatcobibs`) :
```bash
npx supabase secrets set --env-file ./supabase/functions/.env
```
(ou Dashboard → Edge Functions → Secrets, une variable à la fois.)

## Déploiement de l'Edge Function

La fonction de signature exige un JWT (réservée au staff) — **ne pas** utiliser
`--no-verify-jwt` :
```bash
npx supabase functions deploy cloudinary-signature
```

## Utilisation côté Angular

`MediaService` (`src/app/core/media/media.service.ts`) :

```ts
private readonly media = inject(MediaService);

// Livraison optimisée (format + qualité auto) :
const src = this.media.url('formations/mon-image');

// Upload signé (staff), depuis un <input type="file"> :
const resultat = await this.media.televerser(fichier, 'formations');
if (resultat) {
  // resultat.publicId / resultat.url → à enregistrer dans la table métier.
}
```

## Flux d'upload signé

1. Le front appelle `cloudinary-signature` (JWT du staff).
2. L'Edge Function vérifie le rôle (`formateur`/`admin`), calcule la signature
   SHA-1 avec l'API Secret et renvoie `{ cloudName, apiKey, timestamp, signature, folder }`.
3. Le front POST le fichier directement à `https://api.cloudinary.com/v1_1/<cloud>/auto/upload`.
4. Le `public_id` / `secure_url` renvoyés sont stockés dans la table métier concernée.
