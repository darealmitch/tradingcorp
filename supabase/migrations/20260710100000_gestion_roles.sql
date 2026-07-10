-- =============================================================================
-- TradingCorp — Gestion des rôles (back-office) et durcissement des profils
--
--   1. Faille corrigée : profils_update_self autorisait un utilisateur à
--      modifier TOUTE sa ligne — y compris `role` (auto-promotion admin par
--      un simple appel REST). Les policies RLS ne filtrent pas par colonne :
--      on verrouille par privilèges de colonnes — authenticated ne peut plus
--      éditer que prenom / nom / avatar_url.
--   2. Le changement de rôle passe par une fonction SECURITY DEFINER dédiée,
--      réservée aux admins (seule voie possible, colonne verrouillée).
--   3. Liste des profils avec e-mail pour la page d'administration
--      (auth.users n'est pas exposée au client).
--   4. handle_new_user : reprend prénom/nom des comptes Google (given_name /
--      family_name), absents des métadonnées du formulaire classique.
-- =============================================================================

-- 1. Verrouillage des colonnes de profils -------------------------------------

revoke update on profils from anon, authenticated;
grant update (prenom, nom, avatar_url) on profils to authenticated;

-- 2. Changement de rôle, réservé aux admins ------------------------------------

create or replace function public.changer_role(p_id_profil uuid, p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Réservé aux administrateurs';
  end if;
  if p_role not in ('apprenant', 'formateur', 'admin') then
    raise exception 'Rôle invalide : %', p_role;
  end if;
  if p_id_profil = auth.uid() then
    -- Garde-fou anti-verrouillage : impossible de rétrograder son propre
    -- compte (et donc le dernier admin) par mégarde.
    raise exception 'Impossible de modifier son propre rôle';
  end if;
  update profils set role = p_role where id_profil = p_id_profil;
end;
$$;

-- 3. Liste des profils pour l'administration (e-mail inclus) -------------------

create or replace function public.lister_profils_admin()
returns table (
  id_profil uuid,
  prenom text,
  nom text,
  email text,
  role text,
  date_creation timestamptz
)
language sql stable security definer set search_path = public
as $$
  select p.id_profil, p.prenom, p.nom, u.email::text, p.role, p.date_creation
  from profils p
  join auth.users u on u.id = p.id_profil
  where is_admin()
  order by p.date_creation;
$$;

-- 4. Prénom/nom des comptes Google ---------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profils (id_profil, prenom, nom, role)
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
    'apprenant'
  );
  return new;
end;
$$;
