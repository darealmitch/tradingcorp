-- Mesure d'audience sans cookie — diagnostic commercial du 14/10/2026.
--
-- Le site ne mesurait rien : ni les visites des pages de vente, ni les clics
-- sur les boutons d'inscription, ni les paiements commencés. Impossible de
-- dire où les visiteurs décrochent, ni de juger une publicité.
--
-- CE QUI EST COMPTÉ : des TOTAUX PAR JOUR, et rien d'autre. Ni identifiant,
-- ni adresse IP, ni appareil, ni compte : une ligne dit « 37 vues de l'accueil
-- le 14/10 », jamais « qui ». Rien n'est déposé sur le terminal du visiteur,
-- aucune donnée personnelle n'est conservée, et les chiffres ne servent qu'au
-- site lui-même. C'est le cadre que la CNIL dispense de consentement ; le
-- visiteur est informé par la politique de cookies et peut s'y opposer.
--
-- CE QUI N'EST PAS RECOMPTÉ : les comptes créés et les paiements réussis. Ils
-- sont déjà en base (`profils`, `paiements`) et l'entonnoir les y lit. Deux
-- sources pour un même chiffre finissent toujours par se contredire.
--
-- Seule la RPC écrit, et seulement des paires (événement, cible) connues : un
-- appel forgé ne peut ni créer de lignes arbitraires ni rien lire. Il peut
-- gonfler un compteur existant — limite assumée d'une mesure sans
-- identifiant. Ces chiffres servent à comparer des tendances, pas à facturer.

create table public.mesures_audience (
  jour date not null,
  -- La recette (dev.tradingcorp.fr) écrit dans la même base que la
  -- production : sans cette colonne, chaque essai fausserait les chiffres.
  site text not null check (site in ('prod', 'dev')),
  evenement text not null,
  cible text not null,
  nombre integer not null default 0 check (nombre >= 0),
  primary key (jour, site, evenement, cible)
);

comment on table public.mesures_audience is
  'Mesure d''audience anonyme : totaux par jour, sans identifiant ni adresse IP.';

alter table public.mesures_audience enable row level security;

-- Lecture réservée aux administrateurs. Aucune policy d'écriture : personne
-- n'écrit en direct, pas même un administrateur ; tout passe par la RPC.
create policy mesures_audience_select_admin on public.mesures_audience
  for select to authenticated
  using ((select is_admin()));

revoke all on public.mesures_audience from public, anon, authenticated;
grant select on public.mesures_audience to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Compter un événement
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.compter_evenement(p_site text, p_evenement text, p_cible text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Les paires connues, et elles seules. Une paire inconnue est ignorée sans
  -- erreur : une version du site plus récente que la base ne doit pas remplir
  -- la console de ses visiteurs. La liste est tenue à jour avec
  -- `core/mesure/mesure.model.ts`, que les tests du front comparent à leurs
  -- propres usages.
  if p_site is null or p_site not in ('prod', 'dev') then
    return;
  end if;
  if not (
       (p_evenement = 'vue'
        and p_cible in ('/', '/programme', '/inscription', '/espace/formations'))
    or (p_evenement = 'clic'
        and p_cible in ('hero', 'offre-essai', 'offre-achat', 'barre', 'entete',
                        'transition', 'programme-hero', 'programme-fin'))
    or (p_evenement = 'debut_paiement' and p_cible = 'ma-formation')
  ) then
    return;
  end if;

  insert into mesures_audience (jour, site, evenement, cible, nombre)
  values ((now() at time zone 'Europe/Paris')::date, p_site, p_evenement, p_cible, 1)
  on conflict (jour, site, evenement, cible)
  do update set nombre = mesures_audience.nombre + 1;
end;
$$;

comment on function public.compter_evenement(text, text, text) is
  'Ajoute 1 au total du jour pour une paire (événement, cible) connue. N''enregistre rien d''autre.';

revoke all on function public.compter_evenement(text, text, text) from public;
grant execute on function public.compter_evenement(text, text, text)
  to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- L'entonnoir, pour le tableau de bord de l'administrateur
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.entonnoir_conversion(p_jours integer default 30, p_site text default 'prod')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_jours  integer := greatest(1, least(coalesce(p_jours, 30), 366));
  v_depuis date := (now() at time zone 'Europe/Paris')::date - (v_jours - 1);
  -- Minuit à Paris, pour comparer aux dates horodatées des comptes et paiements.
  v_debut  timestamptz := v_depuis::timestamp at time zone 'Europe/Paris';
begin
  if not is_admin() then
    raise exception 'Réservé aux administrateurs.';
  end if;

  return jsonb_build_object(
    'depuis', v_depuis,
    'jours', v_jours,
    'vues_accueil', (select coalesce(sum(nombre), 0) from mesures_audience
                      where site = p_site and jour >= v_depuis and evenement = 'vue' and cible = '/'),
    'vues_programme', (select coalesce(sum(nombre), 0) from mesures_audience
                        where site = p_site and jour >= v_depuis and evenement = 'vue' and cible = '/programme'),
    'clics', (select coalesce(sum(nombre), 0) from mesures_audience
               where site = p_site and jour >= v_depuis and evenement = 'clic'),
    'vues_inscription', (select coalesce(sum(nombre), 0) from mesures_audience
                          where site = p_site and jour >= v_depuis and evenement = 'vue' and cible = '/inscription'),
    -- Les comptes ouverts par les visiteurs eux-mêmes : ceux que l'équipe crée
    -- ou reprend (`cree_par_admin`) ne doivent rien à la page de vente, et les
    -- comptes de test ne sont pas des prospects.
    'comptes_crees', (select count(*) from profils p
                        join auth.users u on u.id = p.id_profil
                       where p.role = 'apprenant' and not p.est_test
                         and p.date_creation >= v_debut
                         and coalesce(u.raw_user_meta_data ->> 'cree_par_admin', '') <> 'true'),
    'vues_achat', (select coalesce(sum(nombre), 0) from mesures_audience
                    where site = p_site and jour >= v_depuis and evenement = 'vue' and cible = '/espace/formations'),
    'debuts_paiement', (select coalesce(sum(nombre), 0) from mesures_audience
                         where site = p_site and jour >= v_depuis and evenement = 'debut_paiement'),
    -- Un paiement remboursé depuis a bien été encaissé : il compte comme
    -- paiement, et figure en plus parmi les remboursements.
    'paiements', (select count(*) from paiements
                   where not mode_test and statut in ('reussi', 'rembourse') and date_paiement >= v_debut),
    'remboursements', (select count(*) from paiements
                        where not mode_test and statut = 'rembourse' and date_paiement >= v_debut),
    'clics_par_bouton', (select coalesce(jsonb_object_agg(cible, total), '{}'::jsonb)
                           from (select cible, sum(nombre) as total from mesures_audience
                                  where site = p_site and jour >= v_depuis and evenement = 'clic'
                                  group by cible) c)
  );
end;
$$;

comment on function public.entonnoir_conversion(integer, text) is
  'Entonnoir de conversion des derniers jours : mesures d''audience, comptes ouverts depuis le site, paiements réels.';

revoke all on function public.entonnoir_conversion(integer, text) from public, anon;
grant execute on function public.entonnoir_conversion(integer, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Conservation : 25 mois, la durée que la CNIL retient pour ces statistiques
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.appliquer_retention_mesures(p_mois integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supprimees integer;
begin
  delete from mesures_audience
   where jour < (now() at time zone 'Europe/Paris')::date - make_interval(months => p_mois);
  get diagnostics v_supprimees = row_count;
  return v_supprimees;
end;
$$;

revoke all on function public.appliquer_retention_mesures(integer) from public, anon, authenticated;
grant execute on function public.appliquer_retention_mesures(integer) to service_role;

-- La rétention nocturne existante, complétée d'une ligne. `create or replace`
-- conserve les droits et le planificateur qui l'appelle.
create or replace function public.appliquer_retention()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_journal       integer;
  v_notifications integer;
  v_paiements     integer;
  v_inactifs      integer;
  v_incidents     integer;
  v_presences     integer;
  v_mesures       integer;
begin
  v_journal       := appliquer_retention_journal(12);
  v_notifications := appliquer_retention_notifications(12);
  v_paiements     := appliquer_retention_paiements(10);
  v_incidents     := appliquer_retention_incidents(90);
  v_presences     := appliquer_retention_presences(24);
  v_mesures       := appliquer_retention_mesures(25);
  select count(*) into v_inactifs from comptes_inactifs(3);

  return jsonb_build_object(
    'execute_le', now(),
    'journal_anonymise', v_journal,
    'notifications_supprimees', v_notifications,
    'paiements_anonymises', v_paiements,
    'incidents_supprimes', v_incidents,
    'presences_supprimees', v_presences,
    'mesures_supprimees', v_mesures,
    'comptes_inactifs_a_examiner', v_inactifs
  );
end;
$$;
