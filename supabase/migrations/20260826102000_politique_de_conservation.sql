-- =============================================================================
-- TradingCorp — Les durées de conservation deviennent une donnée, pas une
-- intention
--
-- Audit RGPD du 25/08/2026, §3.4. Constat vérifié : aucune durée de
-- conservation nulle part, aucune purge, aucune table portant une échéance.
-- L'article 5.1.e est un manquement autonome — il n'a pas besoin d'un incident
-- pour être constaté.
--
-- Une politique de conservation écrite dans un document Word et jamais
-- appliquée est pire que rien : elle transforme une négligence en déclaration
-- inexacte. Elle vit donc ici, en base, sous trois formes indissociables :
--
--   1. une TABLE qui dit, pour chaque catégorie, la durée ET SON FONDEMENT ;
--   2. des FONCTIONS qui l'appliquent réellement ;
--   3. une PLANIFICATION qui les exécute sans intervention humaine.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SUR L'ORIGINE DES DURÉES — la distinction est essentielle et engage :
--
--   • OBLIGATION LÉGALE : seuls les paiements en relèvent. Article L123-22 du
--     Code de commerce — les documents comptables et pièces justificatives sont
--     conservés DIX ANS. Cette durée n'est pas négociable, et elle prime sur
--     une demande d'effacement (art. 17.3.b du RGPD).
--
--   • RECOMMANDATION CNIL : le journal d'administration. La CNIL recommande de
--     conserver les journaux « sur une période glissante comprise entre six
--     mois et un an ». Ce n'est pas une durée imposée par un texte.
--
--   • CHOIX JUSTIFIÉ PAR LA FINALITÉ : les notifications et les comptes
--     inactifs. AUCUN texte ne fixe ces durées. Elles sont proposées ici au
--     regard de l'objectif poursuivi, et relèvent d'un arbitrage qui appartient
--     au responsable de traitement.
--
-- Ce qui N'EST PAS purgé, et pourquoi : le contenu pédagogique, la progression,
-- les quiz et les certificats vivent aussi longtemps que le compte. La
-- formation est vendue en « accès à vie » : purger la progression d'un client
-- actif reviendrait à lui retirer ce qu'il a acheté. Leur effacement suit celui
-- du compte, sur demande ou après inactivité prolongée.
-- =============================================================================

create table if not exists public.politique_conservation (
  categorie     text primary key,
  duree         text        not null,
  fondement     text        not null,
  nature        text        not null check (nature in ('obligation_legale', 'recommandation_cnil', 'choix_justifie')),
  action        text        not null check (action in ('suppression', 'anonymisation', 'signalement', 'aucune')),
  reference     text,
  commentaire   text,
  mis_a_jour_le timestamptz not null default now()
);

comment on table public.politique_conservation is
  'Politique de conservation des données personnelles (RGPD art. 5.1.e). Table de référence : elle documente la durée applicable à chaque catégorie ET son fondement juridique. Consultée par les administrateurs, elle sert aussi de source au registre des traitements et à la politique de confidentialité.';

alter table public.politique_conservation enable row level security;

-- Lecture réservée au staff : ce n'est pas une donnée personnelle, mais ce
-- n'est pas non plus une information à exposer publiquement.
drop policy if exists politique_conservation_select_staff on public.politique_conservation;
create policy politique_conservation_select_staff on public.politique_conservation
  for select to authenticated
  using ((select is_formateur_ou_admin()));

revoke insert, update, delete on public.politique_conservation from anon, authenticated;

insert into public.politique_conservation
  (categorie, duree, fondement, nature, action, reference, commentaire)
values
  ('paiements',
   '10 ans à compter de la transaction',
   'Les documents comptables et les pièces justificatives sont conservés dix ans.',
   'obligation_legale', 'anonymisation',
   'Code de commerce, art. L123-22',
   'Durée non négociable, opposable à une demande d''effacement (RGPD art. 17.3.b). Passé ce délai, l''e-mail est retiré : le montant et la référence suffisent à la piste comptable.'),

  ('journal_admin',
   '12 mois',
   'La CNIL recommande de conserver les journaux sur une période glissante de six mois à un an.',
   'recommandation_cnil', 'anonymisation',
   'CNIL — recommandation relative aux mesures de journalisation',
   'Borne haute retenue : les actions tracées sont rares et sensibles, et un accès indûment accordé ne se découvre pas en trois mois. Les entrées subsistent, seule l''identité en clair est retirée.'),

  ('notifications',
   '12 mois après envoi',
   'Aucune obligation légale. Une notification informe d''un événement ponctuel ; passé un an, elle n''a plus d''utilité pour son destinataire.',
   'choix_justifie', 'suppression',
   null,
   'Durée proposée au regard de la finalité, à arbitrer par le responsable de traitement.'),

  ('comptes_inactifs',
   '3 ans sans connexion',
   'Aucune obligation légale. Aligné sur la doctrine CNIL en matière de relation commerciale (3 ans après le dernier contact).',
   'choix_justifie', 'signalement',
   'CNIL — durées de conservation, relation commerciale',
   'SIGNALEMENT SEULEMENT, jamais de suppression automatique : la formation est vendue en « accès à vie », et supprimer le compte d''un client qui a payé serait une rupture de contrat. La CNIL impose d''informer la personne avant toute suppression pour inactivité.'),

  ('progression_quiz_certificats',
   'Durée de vie du compte',
   'Aucune obligation légale. Ces données sont la contrepartie de l''achat : les purger reviendrait à retirer au client ce qu''il a acheté.',
   'choix_justifie', 'aucune',
   null,
   'Effacées avec le compte, sur demande de la personne ou après inactivité prolongée constatée et notifiée.'),

  ('sauvegardes',
   '30 jours',
   'Aucune obligation légale. Durée nécessaire pour restaurer après un incident non détecté immédiatement.',
   'choix_justifie', 'suppression',
   null,
   'Une donnée supprimée de la base subsiste au plus 30 jours dans les sauvegardes — délai à mentionner dans la réponse à une demande d''effacement.')
on conflict (categorie) do update
  set duree = excluded.duree,
      fondement = excluded.fondement,
      nature = excluded.nature,
      action = excluded.action,
      reference = excluded.reference,
      commentaire = excluded.commentaire,
      mis_a_jour_le = now();

-- -----------------------------------------------------------------------------
-- Application : notifications
-- -----------------------------------------------------------------------------
create or replace function public.appliquer_retention_notifications(p_mois integer default 12)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lignes integer;
begin
  delete from notifications
   where date_envoi < now() - make_interval(months => greatest(coalesce(p_mois, 12), 1));
  get diagnostics v_lignes = row_count;
  return v_lignes;
end;
$function$;

revoke execute on function public.appliquer_retention_notifications(integer) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Application : paiements — anonymisation, jamais suppression
--
-- Au-delà de 10 ans, l'obligation comptable tombe et l'e-mail n'a plus de
-- raison d'être. La LIGNE, elle, reste : montant, devise, date et référence
-- constituent la piste comptable, sans identifier personne une fois l'e-mail
-- retiré et le profil dissocié.
-- -----------------------------------------------------------------------------
create or replace function public.appliquer_retention_paiements(p_annees integer default 10)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lignes integer;
begin
  update paiements
     set email = null
   where email is not null
     and date_paiement < now() - make_interval(years => greatest(coalesce(p_annees, 10), 1));
  get diagnostics v_lignes = row_count;
  return v_lignes;
end;
$function$;

revoke execute on function public.appliquer_retention_paiements(integer) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Détection : comptes inactifs — SIGNALEMENT, jamais suppression
--
-- Volontairement une lecture, pas une purge. Deux raisons :
--   • contractuelle — « accès à vie » : supprimer le compte d'un client qui a
--     payé serait une rupture d'engagement ;
--   • réglementaire — la CNIL impose d'INFORMER la personne avant toute
--     suppression pour inactivité, et de lui laisser un délai pour réagir.
-- La décision reste humaine ; la fonction dit seulement qui est concerné.
-- -----------------------------------------------------------------------------
create or replace function public.comptes_inactifs(p_annees integer default 3)
returns table (
  id_profil        uuid,
  derniere_activite timestamptz,
  a_paye           boolean,
  role             text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    p.id_profil,
    greatest(coalesce(u.last_sign_in_at, p.date_creation), p.date_creation),
    exists (select 1 from paiements pa where pa.id_profil = p.id_profil and pa.statut = 'reussi'),
    p.role
  from profils p
  join auth.users u on u.id = p.id_profil
  where greatest(coalesce(u.last_sign_in_at, p.date_creation), p.date_creation)
        < now() - make_interval(years => greatest(coalesce(p_annees, 3), 1))
  order by 2;
$function$;

comment on function public.comptes_inactifs(integer) is
  'Liste les comptes sans connexion depuis N années. Ne supprime RIEN : la suppression pour inactivité suppose d''informer la personne au préalable (CNIL), et « l''accès à vie » vendu interdit une purge automatique des clients.';

revoke execute on function public.comptes_inactifs(integer) from public, anon;
grant  execute on function public.comptes_inactifs(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Orchestration
-- -----------------------------------------------------------------------------
create or replace function public.appliquer_retention()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_journal       integer;
  v_notifications integer;
  v_paiements     integer;
  v_inactifs      integer;
begin
  v_journal       := appliquer_retention_journal(12);
  v_notifications := appliquer_retention_notifications(12);
  v_paiements     := appliquer_retention_paiements(10);
  select count(*) into v_inactifs from comptes_inactifs(3);

  return jsonb_build_object(
    'execute_le', now(),
    'journal_anonymise', v_journal,
    'notifications_supprimees', v_notifications,
    'paiements_anonymises', v_paiements,
    'comptes_inactifs_a_examiner', v_inactifs
  );
end;
$function$;

comment on function public.appliquer_retention() is
  'Applique la politique de conservation (table politique_conservation). Planifiée quotidiennement. Rend un compte rendu chiffré de ce qui a été fait.';

revoke execute on function public.appliquer_retention() from public, anon, authenticated;
