-- =============================================================================
-- TradingCorp — Seul le compte propriétaire peut supprimer un administrateur
--
-- Jusqu'ici tout admin pouvait supprimer n'importe quel profil, y compris un
-- autre admin. On distingue désormais un compte PROPRIÉTAIRE, seul habilité à
-- supprimer un pair.
--
-- IDENTIFICATION — aucun marqueur de ce genre n'existait dans le projet. Trois
-- pistes étaient possibles :
--
--   • UUID en dur dans l'Edge Function  -> invisible en base, non auditable,
--                                          à réécrire à chaque environnement ;
--   • nouveau rôle 'proprietaire'       -> casserait is_admin(), les policies
--                                          RLS et roleGuard('admin'), qui
--                                          testent tous role = 'admin' : le
--                                          propriétaire perdrait ses droits
--                                          partout (régression massive) ;
--   • drapeau booléen sur profils       -> retenu.
--
-- Le drapeau suit exactement le modèle déjà en place pour `est_test` et
-- `doit_changer_mdp` : une colonne de profils, protégée par les privilèges de
-- colonnes (le client ne peut éditer que prenom / nom / avatar_url), donc
-- impossible à s'auto-attribuer par un appel REST. Ce n'est pas un second
-- système d'autorisation : c'est le même, étendu d'un cran.
--
-- La règle elle-même est appliquée côté serveur par l'Edge Function
-- `supprimer-compte`, unique voie de suppression (auth.users est hors de
-- portée du client). L'interface ne fait que refléter la décision.
-- =============================================================================

alter table profils
  add column if not exists est_proprietaire boolean not null default false;

comment on column profils.est_proprietaire is
  'Compte propriétaire de la plateforme : seul habilité à supprimer un autre '
  'administrateur. Un seul par base (index unique partiel). Non modifiable par '
  'le client — aucun privilège de colonne accordé, comme role et est_test.';

-- Un seul propriétaire possible : la règle « lui seul » doit tenir en base,
-- pas seulement dans le code qui la lit.
create unique index if not exists idx_profils_proprietaire_unique
  on profils ((true)) where est_proprietaire;

-- Le propriétaire est nécessairement administrateur : sans cela il porterait un
-- privilège d'admin sans être admin, et un autre admin pourrait le neutraliser
-- en le rétrogradant tout en lui laissant le drapeau.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profils_proprietaire_est_admin'
  ) then
    alter table profils add constraint profils_proprietaire_est_admin
      check (not est_proprietaire or role = 'admin');
  end if;
end $$;

-- Désignation du propriétaire, par e-mail plutôt que par UUID en dur : lisible,
-- vérifiable, et rejouable sans risque (idempotent).
update profils p
set est_proprietaire = true
from auth.users u
where u.id = p.id_profil
  and u.email = 'biigmitch@yahoo.com'
  and p.role = 'admin'
  and not p.est_proprietaire;

-- La liste d'administration expose le drapeau : l'interface masque le bouton
-- de suppression là où le serveur refusera de toute façon.
-- Le drop est obligatoire — Postgres refuse de modifier les colonnes de sortie.
drop function if exists public.lister_profils_admin();

create or replace function public.lister_profils_admin()
returns table (
  id_profil uuid,
  prenom text,
  nom text,
  email text,
  role text,
  date_creation timestamptz,
  doit_changer_mdp boolean,
  est_test boolean,
  est_proprietaire boolean
)
language sql stable security definer set search_path = public
as $$
  select p.id_profil, p.prenom, p.nom, u.email::text, p.role, p.date_creation,
         p.doit_changer_mdp, p.est_test, p.est_proprietaire
  from profils p
  join auth.users u on u.id = p.id_profil
  where is_admin()
  order by p.date_creation;
$$;

-- Recréer la fonction lui rend les DEFAULT PRIVILEGES de Supabase (EXECUTE à
-- anon et authenticated). On repose donc les droits explicitement : le client
-- admin connecté en a besoin, un visiteur anonyme non.
revoke execute on function public.lister_profils_admin() from public, anon;
grant execute on function public.lister_profils_admin() to authenticated;
