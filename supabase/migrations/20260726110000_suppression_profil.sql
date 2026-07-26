-- =============================================================================
-- TradingCorp — Suppression d'un profil par un administrateur
--
-- La suppression est PHYSIQUE : le schéma l'a prévue dès l'origine (cascades
-- posées table par table, `paiements.id_profil` volontairement nullable en
-- ON DELETE SET NULL pour que la pièce comptable survive au compte). Supprimer
-- la ligne auth.users suffit donc à propager proprement :
--
--   profils              CASCADE   (auth.users -> profils)
--   avis                 CASCADE      certificats        CASCADE
--   commentaires         CASCADE      inscriptions       CASCADE
--   notifications        CASCADE      progression_lecons CASCADE
--   tentatives_quiz      CASCADE
--   paiements            SET NULL  (conservé, cf. commentaire de la colonne)
--   journal_admin        RESTRICT  <- seul obstacle, traité ici
--
-- LE CAS journal_admin. La table refuse la suppression d'un profil qui a signé
-- des actions d'administration, pour ne pas trouer la piste d'audit. Le refus
-- pur et simple rendrait tout ancien admin indéboulonnable ; effacer ses
-- entrées détruirait l'audit. On applique donc ce que le commentaire de la
-- table demande — « traiter d'abord son journal » — en figeant l'identité de
-- l'auteur dans la ligne elle-même (`auteur`, e-mail au moment de l'action,
-- rempli automatiquement) avant de délier la référence en ON DELETE SET NULL.
-- L'entrée survit, lisible, et le compte devient supprimable.
--
-- Le contrôle d'accès et la suppression elle-même vivent dans l'Edge Function
-- `supprimer-compte` (auth.users n'est pas accessible au client), symétrique de
-- `creer-compte` : vérification du rôle admin de l'appelant, interdiction de se
-- supprimer soi-même et de retirer le dernier administrateur, journalisation.
-- =============================================================================

-- 1. Identité de l'auteur figée dans la piste d'audit --------------------------

alter table journal_admin add column if not exists auteur text;

comment on column journal_admin.auteur is
  'E-mail de l''auteur au moment de l''action, figé par trigger. Survit à la '
  'suppression de son compte, quand id_profil retombe à NULL.';

create or replace function public.figer_auteur_journal()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.auteur is null and new.id_profil is not null then
    select u.email::text into new.auteur from auth.users u where u.id = new.id_profil;
  end if;
  return new;
end;
$$;

-- anon/authenticated inclus : les DEFAULT PRIVILEGES de Supabase leur
-- accordent EXECUTE sur toute nouvelle fonction (cf. notifications_admin).
revoke execute on function public.figer_auteur_journal() from public, anon, authenticated;

drop trigger if exists trg_figer_auteur_journal on journal_admin;
create trigger trg_figer_auteur_journal
  before insert on journal_admin
  for each row execute function public.figer_auteur_journal();

-- Reprise des entrées déjà enregistrées (leurs auteurs existent encore).
update journal_admin j
set auteur = u.email::text
from auth.users u
where u.id = j.id_profil and j.auteur is null;

-- 2. La référence à l'auteur cède, l'entrée reste ------------------------------

alter table journal_admin alter column id_profil drop not null;

alter table journal_admin drop constraint if exists journal_admin_id_profil_fkey;
alter table journal_admin add constraint journal_admin_id_profil_fkey
  foreign key (id_profil) references profils (id_profil) on delete set null;

comment on table journal_admin is
  'Piste d''audit. id_profil retombe à NULL si le compte de l''auteur est '
  'supprimé ; son identité reste lisible dans la colonne `auteur`.';
