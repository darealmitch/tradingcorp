-- =============================================================================
-- TradingCorp — Création de comptes par un admin et distinction données de test
--
--   1. profils.doit_changer_mdp : les comptes créés manuellement reçoivent un
--      mot de passe temporaire ; tant qu'il n'est pas remplacé, l'app bloque
--      l'accès à l'espace (guard Angular + RPC de confirmation ci-dessous).
--   2. profils.est_test : marque les comptes de démonstration (ex. Yannick
--      Zion) pour les exclure des statistiques sans les supprimer.
--   3. paiements.mode_test : reflète le livemode Stripe — l'historique actuel
--      provient entièrement du mode test, d'où le backfill à true. Le chiffre
--      d'affaires ne compte que les paiements réels d'apprenants non-test.
--   4. lister_profils_admin est recréée (type de retour étendu) ; le drop est
--      obligatoire, Postgres refusant de modifier les colonnes de sortie.
-- =============================================================================

alter table profils add column doit_changer_mdp boolean not null default false;
alter table profils add column est_test boolean not null default false;

alter table paiements add column mode_test boolean not null default false;
update paiements set mode_test = true;

-- 1. Fin d'intégration : l'utilisateur vient de définir son propre mot de
--    passe (auth.updateUser côté client), il lève lui-même son blocage.
create or replace function public.confirmer_changement_mdp()
returns void
language sql security definer set search_path = public
as $$
  update profils set doit_changer_mdp = false where id_profil = auth.uid();
$$;

-- 2. Marquage test — réservé aux admins (les privilèges de colonnes empêchent
--    toute modification directe par le client).
create or replace function public.definir_compte_test(p_id_profil uuid, p_est_test boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Réservé aux administrateurs';
  end if;
  update profils set est_test = p_est_test where id_profil = p_id_profil;
end;
$$;

-- 3. Liste d'administration enrichie (e-mail + drapeaux d'état).
drop function public.lister_profils_admin();

create or replace function public.lister_profils_admin()
returns table (
  id_profil uuid,
  prenom text,
  nom text,
  email text,
  role text,
  date_creation timestamptz,
  doit_changer_mdp boolean,
  est_test boolean
)
language sql stable security definer set search_path = public
as $$
  select p.id_profil, p.prenom, p.nom, u.email::text, p.role, p.date_creation,
         p.doit_changer_mdp, p.est_test
  from profils p
  join auth.users u on u.id = p.id_profil
  where is_admin()
  order by p.date_creation;
$$;
