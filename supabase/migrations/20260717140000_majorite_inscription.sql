-- =============================================================================
-- TradingCorp — Vérification de majorité (>= 18 ans) à l'inscription
--
-- Verrou SERVEUR infalsifiable, complémentaire de la validation du formulaire
-- Angular. Le contrôle vit dans le trigger handle_new_user (exécuté pour toute
-- insertion dans auth.users) : une inscription publique sans date de naissance,
-- ou d'un mineur, échoue — quel que soit le point d'entrée (formulaire ou appel
-- direct à signUp).
--
--   • profils.date_naissance : date de naissance, NULLABLE (comptes créés par
--     un admin via creer-compte, ou comptes Google, n'en fournissent pas).
--   • handle_new_user : recréée (create or replace) en repartant de la version
--     de gestion_roles.sql (given_name/family_name préservés), avec le contrôle
--     d'âge et l'enregistrement de la date. Le marqueur cree_par_admin (posé
--     uniquement par l'Edge Function creer-compte, côté service_role) exempte
--     les créations admin du contrôle.
--   • Contrainte CHECK défensive : tolère NULL, garantit l'invariant en base.
-- =============================================================================

alter table profils add column if not exists date_naissance date;

alter table profils drop constraint if exists profils_majeur;
alter table profils add constraint profils_majeur
  check (date_naissance is null or date_naissance <= (current_date - interval '18 years'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_date  date := nullif(new.raw_user_meta_data ->> 'date_naissance', '')::date;
  v_admin boolean := coalesce(new.raw_user_meta_data ->> 'cree_par_admin', '') = 'true';
begin
  -- Inscription publique : majorité obligatoire (les créations admin en sont
  -- exemptées — pas de date de naissance connue à ce stade).
  if not v_admin and (v_date is null or v_date > current_date - interval '18 years') then
    raise exception 'Tu dois avoir au moins 18 ans pour t''inscrire.';
  end if;

  insert into public.profils (id_profil, prenom, nom, date_naissance, role)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'prenom', ''),
      new.raw_user_meta_data ->> 'given_name',
      ''
    ),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'nom', ''),
      new.raw_user_meta_data ->> 'family_name',
      ''
    ),
    v_date,
    'apprenant'
  );
  return new;
end;
$$;
