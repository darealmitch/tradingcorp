-- Collecte des incidents survenus DANS LE NAVIGATEUR (audit P-14).
--
-- La couche d'accès aux données sait depuis août signaler un incident à un
-- collecteur distant, mais `supervisionUrl` était vide : une erreur en
-- production n'existait que dans la console de l'utilisateur, c'est-à-dire
-- nulle part. Les erreurs SERVEUR, elles, sont déjà lisibles dans les logs
-- Supabase — ce qui manquait, c'est le côté client.
--
-- Le collecteur est ici, et non chez un tiers : pas de sous-traitant
-- supplémentaire à déclarer au registre, pas de transfert hors UE, et les
-- traces vivent à côté des données qu'elles décrivent.
--
-- CE QUI EST CONSERVÉ, ET CE QUI NE L'EST PAS. Un incident ne porte ni nom,
-- ni e-mail, ni identifiant de compte : `session` est tiré au hasard à chaque
-- chargement de l'application et ne permet de remonter à personne. Le message
-- brut de Postgres n'est pas transmis en production — il cite volontiers un nom
-- de colonne ou de policy. Reste l'essentiel pour diagnostiquer : ce qu'on
-- tentait de faire, le code d'erreur, et de quoi relier plusieurs erreurs d'une
-- même session.

create table if not exists public.incidents (
  id_incident uuid primary key default gen_random_uuid(),
  recu_le timestamptz not null default now(),

  -- Ce qu'on tentait de faire, en clair : « lecture des notifications ».
  operation text not null,
  -- Code d'erreur Postgres ou HTTP, quand il y en a un.
  code text,
  -- Identifiant de session de NAVIGATION, aléatoire — pas le compte.
  session text not null,
  -- Date vue par le client. Non fiable (horloge du poste), d'où `recu_le` qui
  -- fait foi : un écart entre les deux est en soi une information.
  date_client timestamptz,
  -- Navigateur et adresse de la page, tronqués : ils orientent le diagnostic
  -- (« seulement sur Safari », « seulement sur /parcours ») sans identifier.
  agent text,
  page text,

  constraint incidents_operation_courte check (length(operation) <= 200),
  constraint incidents_code_court check (code is null or length(code) <= 60),
  constraint incidents_session_courte check (length(session) <= 64)
);

comment on table public.incidents is
  'Erreurs survenues dans le navigateur, remontées par acces-donnees.ts via l''Edge Function `incident`. Aucune donnée nominative : `session` est un identifiant de navigation tiré au hasard.';
comment on column public.incidents.recu_le is
  'Date d''arrivée côté serveur — fait foi, contrairement à date_client qui dépend de l''horloge du poste.';
comment on column public.incidents.session is
  'Identifiant de session de navigation, aléatoire et sans lien avec le compte. Sert à relier les erreurs d''un même parcours.';

-- Les deux lectures qu'on fera réellement : les derniers incidents, et tous
-- ceux d'une session dont on suit la trace.
create index if not exists idx_incidents_recu_le on public.incidents (recu_le desc);
create index if not exists idx_incidents_session on public.incidents (session, recu_le desc);

alter table public.incidents enable row level security;

-- Lecture réservée au staff. Aucune policy d'écriture : l'insertion passe
-- exclusivement par l'Edge Function en rôle de service, qui valide et limite
-- le débit. Exposer l'écriture au client ferait de cette table un dépotoir
-- ouvert à qui possède la clé publiable.
drop policy if exists incidents_select_staff on public.incidents;
create policy incidents_select_staff on public.incidents
  for select to authenticated
  using ((select is_formateur_ou_admin()));

revoke all on public.incidents from anon, authenticated;
grant select on public.incidents to authenticated;

-- ---------------------------------------------------------------------------
-- Rétention : 90 jours.
--
-- Une trace technique n'a d'intérêt que tant qu'on peut encore agir dessus.
-- Au-delà d'un trimestre, elle ne diagnostique plus rien et ne fait
-- qu'accumuler. La purge rejoint les autres dans `appliquer_retention()`,
-- déjà planifiée quotidiennement.
-- ---------------------------------------------------------------------------
create or replace function public.appliquer_retention_incidents(p_jours integer default 90)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_supprimes integer;
begin
  delete from public.incidents where recu_le < now() - make_interval(days => p_jours);
  get diagnostics v_supprimes = row_count;
  return v_supprimes;
end;
$$;

revoke all on function public.appliquer_retention_incidents(integer) from public, anon, authenticated;

create or replace function public.appliquer_retention()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_journal       integer;
  v_notifications integer;
  v_paiements     integer;
  v_inactifs      integer;
  v_incidents     integer;
begin
  v_journal       := appliquer_retention_journal(12);
  v_notifications := appliquer_retention_notifications(12);
  v_paiements     := appliquer_retention_paiements(10);
  v_incidents     := appliquer_retention_incidents(90);
  select count(*) into v_inactifs from comptes_inactifs(3);

  return jsonb_build_object(
    'execute_le', now(),
    'journal_anonymise', v_journal,
    'notifications_supprimees', v_notifications,
    'paiements_anonymises', v_paiements,
    'incidents_supprimes', v_incidents,
    'comptes_inactifs_a_examiner', v_inactifs
  );
end;
$$;
