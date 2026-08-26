-- =============================================================================
-- TradingCorp — Les sauvegardes rentrent à la maison
--
-- Audit RGPD du 25/08/2026, §3.8 — et le constat s'est aggravé en le vérifiant.
--
-- CE QUI ÉTAIT EN PLACE : chaque nuit, un `pg_dump` du CONTENU complet de la
-- base — identités, e-mails, dates de naissance, paiements, progression — était
-- publié comme artefact GitHub Actions, avec 30 jours de rétention.
--
-- CE QUE L'AUDIT AVAIT SOUS-ESTIMÉ : le dépôt `darealmitch/tradingcorp` est
-- PUBLIC. Or les artefacts d'un dépôt public sont accessibles à quiconque a un
-- accès en lecture au dépôt — c'est-à-dire à tout le monde. La documentation
-- GitHub est explicite : toute personne connectée à GitHub disposant d'un accès
-- en lecture peut télécharger un artefact, et l'API REST répond même sans
-- authentification pour les ressources publiques.
--
-- Autrement dit : une base de données complète, avec ses données personnelles,
-- téléchargeable par n'importe qui pendant 30 jours. Ce n'est pas un défaut de
-- documentation ni un transfert hors UE mal encadré — c'est une violation de
-- données au sens de l'article 4.12 du RGPD dès qu'un compte réel y figure.
--
-- LA CORRECTION : les sauvegardes reviennent dans le Storage Supabase, qui est
-- déjà l'hébergement de la base — même région (Paris), même contrôle d'accès,
-- aucun tiers supplémentaire, aucun transfert hors UE. Le bucket est privé et
-- ne reçoit AUCUNE policy : sans policy, la RLS de `storage.objects` refuse
-- tout le monde, et seul le rôle de service — qui la contourne — peut y écrire
-- et y lire. C'est exactement le niveau d'accès voulu pour un dump.
--
-- Ce qui NE change PAS, et qui était bien vu : le dump est toujours restauré
-- dans un Postgres jetable et recompté avant d'être conservé. Une sauvegarde
-- qu'on n'a jamais relue n'est pas une sauvegarde.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sauvegardes',
  'sauvegardes',
  false,
  -- 2 Go : large devant la base actuelle, et borne l'effet d'un dump aberrant.
  2147483648,
  array['application/octet-stream']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Aucune policy n'est créée sur `storage.objects` pour ce bucket : c'est le
-- contrôle d'accès lui-même. `anon` et `authenticated` n'ont aucun moyen de
-- lire, lister ou écrire ici — pas même de savoir que le bucket existe.
--
-- Le rôle de service, utilisé par le workflow de sauvegarde, n'est pas soumis
-- à la RLS : il écrit et purge sans qu'aucune ouverture n'ait à être faite.
--
-- Pas de `comment on table storage.objects` ici : cette table appartient au
-- schéma géré par Supabase (rôle `supabase_storage_admin`), et le rôle
-- d'exécution des migrations n'en est pas propriétaire — la commande échoue
-- avec « must be owner of table objects ». Constaté à l'application de cette
-- migration. Le commentaire n'étant que documentaire, il est retiré plutôt que
-- contourné.
