-- =============================================================================
-- TradingCorp — Le compte propriétaire est intouchable
--
-- `est_proprietaire` conférait un privilège (supprimer un administrateur) mais
-- ne protégeait pas son porteur : un autre admin pouvait le rétrograder via
-- changer_role et le neutraliser. On ferme cette voie.
--
-- INVENTAIRE DES VOIES DE MODIFICATION — la protection doit couvrir toutes les
-- portes, pas seulement la principale :
--
--   changer_role            -> SEULE brèche réelle : fermée ici.
--   UPDATE direct du rôle   -> déjà impossible, `profils` n'accorde aucun
--                              privilège UPDATE (ni table, ni colonne) ;
--                              toute écriture passe par une RPC DEFINER.
--   retrait du drapeau      -> aucune RPC ne modifie est_proprietaire, et la
--                              colonne est hors de portée du client.
--   suppression du compte   -> déjà impossible : seul le propriétaire peut
--                              supprimer un admin, et nul ne se supprime soi-même.
--   contrainte SQL          -> profils_proprietaire_est_admin garantit en dernier
--                              recours qu'il reste admin (filet, pas message).
--
-- corriger_identite et definir_compte_test restent ouvertes : elles touchent
-- l'état civil et l'exclusion statistique, jamais les privilèges. Les fermer
-- empêcherait de corriger une faute dans le nom du propriétaire sans rien
-- sécuriser de plus.
--
-- Réutilise la logique en place : même fonction, même contrôle is_admin(),
-- même journalisation. Aucun système parallèle.
-- =============================================================================

create or replace function public.changer_role(p_id_profil uuid, p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_est_proprietaire boolean;
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

  select est_proprietaire into v_est_proprietaire
  from profils where id_profil = p_id_profil;
  if v_est_proprietaire is null then
    raise exception 'Profil introuvable';
  end if;
  if v_est_proprietaire then
    raise exception 'Le compte propriétaire ne peut pas être modifié';
  end if;

  update profils set role = p_role where id_profil = p_id_profil;

  insert into journal_admin (id_profil, action, cible, meta)
  values (
    auth.uid(),
    'changement_role',
    (select u.email from auth.users u where u.id = p_id_profil),
    jsonb_build_object('id_profil', p_id_profil, 'nouveau_role', p_role)
  );
end;
$$;

-- CREATE OR REPLACE conserve les privilèges existants ; on les repose malgré
-- tout pour que la migration soit autoportante si la fonction était recréée.
revoke execute on function public.changer_role(uuid, text) from public, anon;
grant execute on function public.changer_role(uuid, text) to authenticated;
