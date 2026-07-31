-- =============================================================================
-- TradingCorp — Vérification de majorité (>= 18 ans) à l'inscription
--
-- Verrou SERVEUR, complémentaire de la validation du formulaire Angular : le
-- contrôle vit dans les triggers, donc il s'applique quel que soit le point
-- d'entrée (formulaire, appel direct à signUp, script).
--
-- HISTORIQUE — cette migration portait initialement la version 20260717140000.
-- Elle n'avait JAMAIS été appliquée en production : audit du 31/07/2026 (P-02).
-- Sa version d'origine ne pouvait pas s'appliquer, car elle posait une
-- contrainte CHECK comparant à current_date — or PostgreSQL exige des
-- expressions IMMUTABLE dans un CHECK, et now() (donc current_date) est STABLE.
-- La contrainte aurait échoué et bloqué toute la migration.
--
-- Correction retenue : le contrôle d'âge passe dans les triggers, seuls
-- capables d'évaluer la date courante ; la contrainte CHECK est ramenée à ce
-- qu'elle peut exprimer de façon immutable, une borne de plausibilité. Une
-- contrainte dépendant du jour serait de toute façon un mauvais choix : elle
-- invaliderait des lignes valides à mesure que le temps passe, et casserait la
-- restauration d'une sauvegarde.
--
--   • profils.date_naissance : NULLABLE — les comptes créés par un admin via
--     creer-compte et les comptes issus d'un fournisseur externe n'en ont pas.
--   • trg_profils_majeur : invariant permanent sur la table, quel que soit le
--     chemin d'écriture (y compris service_role).
--   • handle_new_user : inscription publique — date obligatoire ET majorité.
--     Le marqueur cree_par_admin (posé uniquement par l'Edge Function
--     creer-compte, côté service_role) exempte les créations admin.
--
-- Le message contient « 18 ans » : AuthService.messageErreur() s'appuie dessus
-- pour afficher un message français à l'utilisateur.
-- =============================================================================

alter table public.profils add column if not exists date_naissance date;

alter table public.profils drop constraint if exists profils_majeur;
alter table public.profils drop constraint if exists profils_date_naissance_plausible;
alter table public.profils add constraint profils_date_naissance_plausible
  check (date_naissance is null
         or (date_naissance >= date '1900-01-01' and date_naissance <= date '2100-01-01'));

create or replace function public.majeur_si_date_connue()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.date_naissance is not null
     and new.date_naissance > (current_date - interval '18 years') then
    raise exception 'Tu dois avoir au moins 18 ans pour t''inscrire.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profils_majeur on public.profils;
create trigger trg_profils_majeur
  before insert or update of date_naissance on public.profils
  for each row execute function public.majeur_si_date_connue();

revoke execute on function public.majeur_si_date_connue() from public;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_brut  text := nullif(new.raw_user_meta_data ->> 'date_naissance', '');
  v_date  date;
  v_admin boolean := coalesce(new.raw_user_meta_data ->> 'cree_par_admin', '') = 'true';
begin
  if v_brut is not null then
    begin
      v_date := v_brut::date;
    exception when others then
      raise exception 'Date de naissance invalide.';
    end;
  end if;

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

revoke execute on function public.handle_new_user() from public;
