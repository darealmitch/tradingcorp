-- =============================================================================
-- TradingCorp — Le journal d'administration garde la preuve, pas l'identité
--
-- Audit RGPD du 25/08/2026, §3.5 et §3.14. Constat vérifié en base : un compte
-- supprimé le 26 juillet 2026 y figurait encore un mois plus tard avec son
-- e-mail, son nom et son prénom en clair. Le lien `id_profil` passe bien à NULL
-- en cascade — mais `SET NULL` n'efface que le LIEN, jamais les colonnes qui
-- portent l'identité.
--
-- CE QU'IL NE FAUT PAS FAIRE : supprimer le journal. Sa finalité — tracer qui a
-- changé un rôle, supprimé un compte ou ouvert l'accès intégral au catalogue —
-- relève de l'intérêt légitime (art. 6.1.f) et de la sécurité (art. 32). Le
-- perdre affaiblirait la plateforme sans rien apporter aux personnes.
--
-- CE QU'IL FAUT FAIRE : dissocier la PREUVE de l'IDENTITÉ.
--
--   • La preuve — quelle action, quand, par qui, sur quel compte — est portée
--     par des identifiants techniques. Elle est conservée.
--   • L'identité en clair — e-mail, prénom, nom — n'est utile qu'au confort de
--     lecture, et seulement tant que le compte existe. Elle devient
--     anonymisable.
--
-- D'où la colonne `id_profil_cible` ajoutée ici : SANS clé étrangère, et c'est
-- volontaire. Une FK `on delete set null` ferait disparaître la trace au moment
-- précis où elle compte le plus — la suppression du compte. C'est un
-- identifiant historique, pas une référence vivante.
--
-- DURÉE RETENUE : 12 mois. La CNIL recommande de conserver les journaux « sur
-- une période glissante comprise entre six mois et un an ». On prend la borne
-- haute : les actions tracées ici sont rares et sensibles, et un litige sur un
-- accès indûment accordé ne se découvre pas en trois mois.
-- Recommandation CNIL — pas une obligation légale chiffrée.
-- =============================================================================

-- 1. L'identifiant technique de la personne visée par l'action.
alter table public.journal_admin
  add column if not exists id_profil_cible uuid;

comment on column public.journal_admin.id_profil_cible is
  'Personne visée par l''action, par identifiant technique. Volontairement SANS clé étrangère : la trace doit survivre à la suppression du compte, sinon la piste d''audit s''efface au moment où elle sert le plus.';

comment on column public.journal_admin.cible is
  'E-mail de la personne visée, pour le confort de lecture UNIQUEMENT. Anonymisé à la suppression du compte et au-delà de 12 mois (RGPD, minimisation). Ne jamais s''en servir comme identifiant : utiliser id_profil_cible.';

comment on column public.journal_admin.auteur is
  'E-mail de l''auteur de l''action, pour le confort de lecture. Même traitement que `cible` : anonymisé à échéance. L''auteur reste identifiable par id_profil tant que son compte existe.';

-- 2. Rétro-remplissage : plusieurs entrées portent déjà l'identifiant cible
--    dans `meta`. Autant récupérer ce qui existe plutôt que repartir de zéro.
update public.journal_admin
   set id_profil_cible = (meta ->> 'id_profil')::uuid
 where id_profil_cible is null
   and meta ? 'id_profil'
   and (meta ->> 'id_profil') ~ '^[0-9a-f-]{36}$';

-- 3. Anonymisation d'une personne donnée.
--
-- Appelée à la suppression d'un compte. Trois cibles, parce qu'une même
-- personne apparaît dans le journal sous trois formes : comme sujet de
-- l'action (`id_profil_cible`, `cible`), et comme AUTEUR d'actions passées
-- (`auteur`) — un administrateur qui s'en va laisse son e-mail sur chaque
-- action qu'il a menée.
create or replace function public.anonymiser_journal_personne(
  p_id_profil uuid,
  p_email     text default null
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lignes integer;
begin
  update journal_admin
     set cible  = case
                    when id_profil_cible = p_id_profil
                      or (p_email is not null and cible = p_email)
                    then null else cible
                  end,
         auteur = case
                    when p_email is not null and auteur = p_email
                    then null else auteur
                  end,
         -- L'identité en clair part ; le reste de `meta` — rôle attribué,
         -- montant remboursé, valeur du drapeau — décrit l'ACTION et non la
         -- personne : c'est précisément ce qu'on veut garder.
         meta   = case
                    when id_profil_cible = p_id_profil
                      or (p_email is not null and cible = p_email)
                    then meta - 'prenom' - 'nom'
                    else meta
                  end
   where id_profil_cible = p_id_profil
      or id_profil = p_id_profil
      or (p_email is not null and (cible = p_email or auteur = p_email));

  get diagnostics v_lignes = row_count;
  return v_lignes;
end;
$function$;

comment on function public.anonymiser_journal_personne(uuid, text) is
  'Retire l''identité en clair (e-mail, prénom, nom) des entrées de journal concernant une personne, sans supprimer les entrées : l''action reste prouvable, la personne n''est plus directement identifiable. Appelée à la suppression d''un compte (RGPD art. 17).';

revoke execute on function public.anonymiser_journal_personne(uuid, text) from public, anon, authenticated;

-- 4. Anonymisation à échéance, indépendante de toute suppression.
create or replace function public.appliquer_retention_journal(p_mois integer default 12)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lignes integer;
begin
  update journal_admin
     set cible  = null,
         auteur = null,
         meta   = meta - 'prenom' - 'nom'
   where date_action < now() - make_interval(months => greatest(coalesce(p_mois, 12), 1))
     and (cible is not null or auteur is not null or meta ? 'prenom' or meta ? 'nom');

  get diagnostics v_lignes = row_count;
  return v_lignes;
end;
$function$;

comment on function public.appliquer_retention_journal(integer) is
  'Anonymise les entrées de journal au-delà de 12 mois (recommandation CNIL : 6 mois à 1 an). Les entrées SUBSISTENT — seule l''identité en clair est retirée.';

revoke execute on function public.appliquer_retention_journal(integer) from public, anon, authenticated;

-- 5. Les fonctions qui écrivent dans le journal renseignent désormais la cible
--    technique. Sans elle, l'anonymisation n'aurait plus rien à quoi se
--    raccrocher une fois l'e-mail effacé.

create or replace function public.changer_role(p_id_profil uuid, p_role text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  insert into journal_admin (id_profil, id_profil_cible, action, cible, meta)
  values (
    auth.uid(),
    p_id_profil,
    'changement_role',
    (select u.email from auth.users u where u.id = p_id_profil),
    jsonb_build_object('id_profil', p_id_profil, 'nouveau_role', p_role)
  );
end;
$function$;

create or replace function public.definir_compte_test(p_id_profil uuid, p_est_test boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ancien boolean;
begin
  if not is_admin() then
    raise exception 'Réservé aux administrateurs';
  end if;

  select est_test into v_ancien from profils where id_profil = p_id_profil;
  if v_ancien is null then
    raise exception 'Profil introuvable';
  end if;
  if v_ancien = p_est_test then
    return;
  end if;

  update profils set est_test = p_est_test where id_profil = p_id_profil;

  insert into journal_admin (id_profil, id_profil_cible, action, cible, meta)
  values (
    auth.uid(),
    p_id_profil,
    case when p_est_test then 'octroi_compte_test' else 'retrait_compte_test' end,
    (select u.email from auth.users u where u.id = p_id_profil),
    jsonb_build_object('id_profil', p_id_profil, 'est_test', p_est_test)
  );
end;
$function$;

create or replace function public.corriger_identite(
  p_id_profil uuid,
  p_prenom    text,
  p_nom       text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not is_admin() then
    raise exception 'Réservé aux administrateurs';
  end if;

  update profils
     set prenom = trim(p_prenom),
         nom    = trim(p_nom)
   where id_profil = p_id_profil;

  if not found then
    raise exception 'Profil introuvable';
  end if;

  -- L'ancienne version journalisait la NOUVELLE identité dans `meta`. On la
  -- conserve : c'est la preuve de ce qui a été corrigé, et donc la finalité
  -- même de l'entrée. Elle part à l'anonymisation, comme le reste.
  insert into journal_admin (id_profil, id_profil_cible, action, cible, meta)
  values (
    auth.uid(),
    p_id_profil,
    'correction_identite',
    (select u.email from auth.users u where u.id = p_id_profil),
    jsonb_build_object('prenom', trim(p_prenom), 'nom', trim(p_nom))
  );
end;
$function$;

create or replace function public.revoquer_pour_remboursement(
  p_reference text,
  p_motif     text default 'remboursement'
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_paiement     paiements%rowtype;
  v_id_formation uuid;
  v_titre        text;
begin
  select * into v_paiement from paiements where reference_transaction = p_reference;
  if not found then return false; end if;
  if v_paiement.statut = 'rembourse' then return false; end if;

  update paiements set statut = 'rembourse' where id_paiement = v_paiement.id_paiement;

  update inscriptions set statut = 'revoquee'
   where id_paiement = v_paiement.id_paiement and statut = 'active'
  returning id_formation into v_id_formation;

  if v_id_formation is not null then
    select titre into v_titre from formations where id_formation = v_id_formation;
    insert into notifications (id_profil, titre, message, type, priorite, cle_evenement)
    values (
      v_paiement.id_profil, 'Accès clôturé',
      coalesce('Ton accès à « ' || v_titre || ' » a été clôturé suite au remboursement de ton paiement.',
               'Ton accès a été clôturé suite au remboursement de ton paiement.'),
      'info', 'urgente', 'remboursement:' || v_paiement.id_paiement::text
    )
    on conflict (id_profil, cle_evenement) where cle_evenement is not null do nothing;
  end if;

  insert into journal_admin (id_profil, id_profil_cible, action, cible, meta, auteur)
  values (
    auth.uid(),
    v_paiement.id_profil,
    'remboursement',
    (select u.email from auth.users u where u.id = v_paiement.id_profil),
    jsonb_build_object('id_paiement', v_paiement.id_paiement, 'reference', p_reference,
      'montant_centimes', v_paiement.montant_centimes, 'motif', p_motif,
      'inscription_revoquee', v_id_formation is not null),
    coalesce(nullif(p_motif, ''), 'stripe')
  );
  return true;
end;
$function$;
