-- =============================================================================
-- TradingCorp — Les agrégats se calculent là où sont les données
--
-- Audit du 31/07/2026, P-10. Deux écrans ramenaient des tables entières pour
-- n'en afficher qu'un résumé :
--
--   • `noteMoyenne()` chargeait TOUS les avis approuvés pour en faire une
--     moyenne dans le navigateur. Mille avis = mille lignes transportées pour
--     produire un nombre à une décimale.
--
--   • `suivreApprenants()` chargeait `profils`, `inscriptions` et
--     `progression_lecons` en entier, puis recoupait les trois en mémoire.
--     Le coût croît avec le produit des trois tables, sur un écran qui n'en
--     montre qu'une page.
--
-- Les deux descendent en base. `suivi_apprenants` est paginée : une page par
-- appel, et le total est renvoyé sur chaque ligne pour que l'appelant sache
-- combien il en reste sans une seconde requête.
--
-- Réservée au staff, comme l'écran qu'elle sert : la fonction est
-- SECURITY DEFINER, donc elle ne peut pas s'en remettre à la RLS de l'appelant
-- — c'est à elle de poser le contrôle, explicitement, en première ligne.
-- =============================================================================

create or replace function public.note_moyenne_avis()
returns numeric
language sql
stable
security invoker
set search_path to 'public'
as $function$
  -- SECURITY INVOKER : la policy de lecture des avis s'applique, et un avis non
  -- approuvé ne pèse sur la moyenne de personne.
  select round(avg(note)::numeric, 1) from avis where statut = 'approuve';
$function$;

comment on function public.note_moyenne_avis() is
  'Moyenne des avis approuvés, arrondie au dixième. NULL tant qu''aucun avis n''est approuvé (P-10).';

create or replace function public.suivi_apprenants(
  p_limite   integer default 50,
  p_decalage integer default 0
)
returns table (
  id_profil     uuid,
  prenom        text,
  nom           text,
  date_creation timestamp with time zone,
  est_test      boolean,
  inscrit       boolean,
  terminees     bigint,
  total         bigint,
  nombre_total  bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not is_formateur_ou_admin() then
    raise exception 'Réservé au staff';
  end if;

  return query
  with programme as (
    select count(*) as n
    from lecons l
    join sections s on s.id_section = l.id_section
    where l.est_publiee and s.est_publiee
  ),
  apprenants as (
    select p.id_profil, p.prenom, p.nom, p.date_creation, p.est_test
    from profils p
    where p.role = 'apprenant'
    order by p.date_creation
    -- Borne haute : une limite absente ou démesurée ramènerait la table
    -- entière, ce que cette fonction existe précisément pour éviter.
    limit  least(greatest(coalesce(p_limite, 50), 1), 200)
    offset greatest(coalesce(p_decalage, 0), 0)
  )
  select
    a.id_profil,
    a.prenom,
    a.nom,
    a.date_creation,
    a.est_test,
    exists (
      select 1 from inscriptions i
      where i.id_profil = a.id_profil and i.statut = 'active'
    ),
    (
      select count(*) from progression_lecons pl
      where pl.id_profil = a.id_profil and pl.terminee_le is not null
    ),
    (select n from programme),
    (select count(*) from profils p2 where p2.role = 'apprenant')
  from apprenants a
  order by a.date_creation;
end;
$function$;

comment on function public.suivi_apprenants(integer, integer) is
  'Page d''apprenants avec inscription active et avancement, recoupés en SQL. Réservée au staff. `nombre_total` porte sur l''ensemble, pas sur la page (P-10).';

revoke execute on function public.suivi_apprenants(integer, integer) from public, anon;
grant  execute on function public.suivi_apprenants(integer, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Les prochaines étapes de l'apprenant.
--
-- Même défaut, troisième variante : le tableau de bord chargeait TOUT le
-- programme — sections, leçons ET ressources jointes — pour n'afficher que la
-- prochaine étape à suivre. Une centaine de leçons transportées pour une ligne.
--
-- La RLS reste l'autorité : SECURITY INVOKER, donc `lecons_select_gated`
-- s'applique, et un apprenant ne voit ici que ce qu'il a déjà déverrouillé.
-- -----------------------------------------------------------------------------
create or replace function public.prochaines_lecons(p_limite integer default 3)
returns table (
  id_lecon          uuid,
  id_section        uuid,
  titre             text,
  type              text,
  -- `position` est un mot réservé du SQL (la fonction `position(x in y)`) :
  -- non quoté ici, la déclaration ne compile pas.
  "position"        integer,
  duree_s           integer,
  est_publiee       boolean,
  video_provider    text,
  video_provider_id text,
  video_url         text,
  pdf_public_id     text
)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select l.id_lecon, l.id_section, l.titre, l.type, l.position, l.duree_s,
         l.est_publiee, l.video_provider, l.video_provider_id, l.video_url,
         l.pdf_public_id
  from lecons l
  join sections s on s.id_section = l.id_section
  where l.est_publiee
    and not exists (
      select 1 from progression_lecons p
      where p.id_lecon = l.id_lecon
        and p.id_profil = auth.uid()
        and p.terminee_le is not null
    )
  order by s.position, l.position
  limit least(greatest(coalesce(p_limite, 3), 1), 50);
$function$;

comment on function public.prochaines_lecons(integer) is
  'Prochaines étapes non terminées de l''apprenant, dans l''ordre du programme. SECURITY INVOKER : la RLS filtre ce qui n''est pas débloqué (P-10).';

revoke execute on function public.prochaines_lecons(integer) from public, anon;
grant  execute on function public.prochaines_lecons(integer) to authenticated;
