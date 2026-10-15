-- Provenance des visites — optimisation commerciale du 16/10/2026.
--
-- L'entonnoir dit OÙ les visiteurs décrochent ; il ne disait pas D'OÙ ils
-- viennent. Impossible donc de juger une publicité sur les inscriptions
-- qu'elle amène, ni de comparer la recherche Google aux réseaux sociaux.
--
-- Deux compteurs de plus, dans la même table et sous les mêmes règles :
--   • `arrivee` — la première page d'une visite, quand c'est une page de vente ;
--   • `inscription` — un compte ouvert depuis le formulaire du site.
-- Leur cible est une PROVENANCE, choisie dans une liste fermée de neuf
-- catégories. Le navigateur la déduit de l'adresse d'arrivée (paramètres
-- `utm_*`, identifiant de clic d'une régie) ou de la page précédente, et
-- n'envoie qu'elle : ni l'adresse, ni l'identifiant de clic, ni rien qui
-- relie l'arrivée au compte. Toujours des totaux par jour, et rien d'autre.
--
-- Le NOMBRE de comptes ouverts reste lu dans `profils`, comme avant. Le
-- compteur `inscription` ne sert qu'à le répartir par provenance : il ignore
-- les comptes ouverts avec Google (le retour de Google efface la provenance)
-- et les visiteurs opposés à la mesure, et il ne remplace donc rien.
--
-- La liste est tenue à jour avec `PROVENANCES` dans
-- `core/mesure/mesure.model.ts`.

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
    or (p_evenement in ('arrivee', 'inscription')
        and p_cible in ('direct', 'recherche', 'google-ads', 'meta-ads', 'tiktok-ads',
                        'youtube-ads', 'reseaux', 'email', 'autre-site'))
  ) then
    return;
  end if;

  insert into mesures_audience (jour, site, evenement, cible, nombre)
  values ((now() at time zone 'Europe/Paris')::date, p_site, p_evenement, p_cible, 1)
  on conflict (jour, site, evenement, cible)
  do update set nombre = mesures_audience.nombre + 1;
end;
$$;

-- `create or replace` conserve les droits : anon, authenticated et
-- service_role, posés par la migration `mesure_d_audience`.

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
                                  group by cible) c),
    -- Arrivées et comptes ouverts, provenance par provenance.
    'provenances', (select coalesce(jsonb_object_agg(cible, jsonb_build_object(
                                      'arrivees', arrivees, 'inscriptions', inscriptions)),
                                    '{}'::jsonb)
                      from (select cible,
                                   coalesce(sum(nombre) filter (where evenement = 'arrivee'), 0) as arrivees,
                                   coalesce(sum(nombre) filter (where evenement = 'inscription'), 0) as inscriptions
                              from mesures_audience
                             where site = p_site and jour >= v_depuis
                               and evenement in ('arrivee', 'inscription')
                             group by cible) p)
  );
end;
$$;

comment on function public.entonnoir_conversion(integer, text) is
  'Entonnoir de conversion des derniers jours : mesures d''audience, provenances, comptes ouverts depuis le site, paiements réels.';
