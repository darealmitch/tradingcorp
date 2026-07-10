-- =============================================================================
-- TradingCorp — Surnom (30 j), nom/prénom officiels, retrait de l'avatar
--
-- Évolution de la table `profils` EXISTANTE : uniquement des ALTER idempotents,
-- jamais de CREATE TABLE (ne recrée ni ne supprime la table, préserve les
-- données).
--
--   • surnom / surnom_modifie_le : pseudo modifiable une fois tous les 30 jours,
--     via la RPC changer_surnom (contrôle serveur, infalsifiable côté front).
--   • avatar_url supprimée : le profil ne gère plus aucune image. Les policies
--     du bucket Supabase Storage d'avatars sont retirées ci-dessous ; le bucket
--     lui-même se supprime depuis le dashboard (Postgres interdit le DELETE
--     direct sur storage.objects). Les médias du projet (captures, images de
--     formation, illustrations, ressources) passeront par Cloudinary, stockés
--     dans les tables métier, jamais dans profils.
--   • nom / prénom : plus aucune écriture directe par l'utilisateur ; seul un
--     admin les corrige via corriger_identite (journalisé).
-- =============================================================================

-- 1. Colonnes surnom (ajout idempotent) --------------------------------------
alter table profils add column if not exists surnom text;
alter table profils add column if not exists surnom_modifie_le timestamptz;

-- 2. Retrait de l'avatar ------------------------------------------------------
alter table profils drop column if exists avatar_url;

-- Plus aucune colonne de profils modifiable en direct par l'utilisateur :
--   surnom -> RPC changer_surnom ; nom/prénom -> RPC corriger_identite (admin).
revoke update on profils from authenticated;

-- 3. Démontage du stockage d'avatars (Supabase Storage) ----------------------
-- On retire uniquement les policies (DDL autorisé). Le bucket `avatars` et ses
-- éventuels objets se suppriment depuis le dashboard : Storage → avatars →
-- Delete bucket (Postgres bloque tout DELETE direct sur storage.objects).
drop policy if exists "avatars_lecture_publique" on storage.objects;
drop policy if exists "avatars_insert_proprietaire" on storage.objects;
drop policy if exists "avatars_update_proprietaire" on storage.objects;
drop policy if exists "avatars_delete_proprietaire" on storage.objects;

-- 4. Surnom : une modification par période de 30 jours -----------------------
create or replace function public.changer_surnom(p_surnom text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_surnom text := nullif(btrim(p_surnom), '');
  v_dernier timestamptz;
begin
  if v_surnom is null then
    raise exception 'Le surnom ne peut pas être vide';
  end if;
  if length(v_surnom) > 30 then
    raise exception 'Le surnom ne doit pas dépasser 30 caractères';
  end if;

  select surnom_modifie_le into v_dernier from profils where id_profil = auth.uid();
  if v_dernier is not null and v_dernier > now() - interval '30 days' then
    raise exception 'Surnom déjà modifié récemment. Prochaine modification possible le %',
      to_char(v_dernier + interval '30 days', 'DD/MM/YYYY');
  end if;

  update profils
     set surnom = v_surnom, surnom_modifie_le = now()
   where id_profil = auth.uid();
end;
$$;

-- 5. Correction du nom/prénom par un administrateur --------------------------
create or replace function public.corriger_identite(p_id_profil uuid, p_prenom text, p_nom text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_prenom text := btrim(p_prenom);
  v_nom text := btrim(p_nom);
begin
  if not is_admin() then
    raise exception 'Réservé aux administrateurs';
  end if;
  if v_prenom = '' or v_nom = '' then
    raise exception 'Le nom et le prénom sont obligatoires';
  end if;

  update profils set prenom = v_prenom, nom = v_nom where id_profil = p_id_profil;

  insert into journal_admin (id_profil, action, cible, meta)
  values (
    auth.uid(),
    'correction_identite',
    (select u.email from auth.users u where u.id = p_id_profil),
    jsonb_build_object('prenom', v_prenom, 'nom', v_nom)
  );
end;
$$;
