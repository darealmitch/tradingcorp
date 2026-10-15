-- Sommaire public du programme — optimisation commerciale du 16/10/2026.
--
-- La page Programme montrait, pour chaque module, son accroche, ses objectifs
-- et ses chiffres ; elle ne montrait pas ses leçons. Or c'est ce qu'un
-- acheteur veut savoir avant de payer 997 € : ce qu'il recevra, étape par
-- étape. Le sommaire s'ajoute donc à chaque module de la vitrine : titre,
-- nature (vidéo, quiz, article) et durée de chaque étape, et si elle est
-- offerte.
--
-- Rien de plus que le sommaire : ni vidéo, ni adresse, ni question de quiz,
-- ni ressource. La table `lecons` reste fermée aux visiteurs ; seule cette
-- fonction en extrait ces quatre champs, pour les seules leçons publiées de
-- modules publiés.

create or replace function public.vitrine_formation()
returns table (
  id_formation uuid,
  titre text,
  prix_centimes integer,
  devise text,
  delivre_certificat boolean,
  modules integer,
  lecons_video integer,
  secondes_video integer,
  quiz integer,
  ressources integer,
  lecons_offertes jsonb,
  programme jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with etapes as (
    select s.id_formation, s.id_section, s.position as position_module,
           s.titre as titre_module, l.id_lecon, l.position, l.titre, l.type,
           coalesce(l.duree_s, 0) as duree_s, l.est_decouverte
      from sections s
      join lecons l on l.id_section = s.id_section
     where s.est_publiee and l.est_publiee
  ),
  modules_publies as (
    select s.id_formation, s.position,
           jsonb_build_object(
             'position', s.position,
             'titre', s.titre,
             'accroche', s.accroche,
             'objectifs', coalesce(to_jsonb(s.objectifs), '[]'::jsonb),
             'lecons_video', count(e.id_lecon) filter (where e.type = 'video'),
             'secondes_video', coalesce(sum(e.duree_s) filter (where e.type = 'video'), 0),
             'quiz', count(e.id_lecon) filter (where e.type = 'quiz'),
             'lecons_offertes', count(e.id_lecon) filter (where e.est_decouverte),
             -- Le sommaire du module : titre, nature et durée de chaque étape.
             -- Les introductions n'y figurent pas (une par module, sans titre
             -- propre) ; une durée n'est donnée qu'aux vidéos, les seules qui
             -- en ont une.
             'lecons', coalesce(
               jsonb_agg(
                 jsonb_build_object(
                   'titre', e.titre,
                   'type', e.type,
                   'duree_s', case when e.type = 'video' then e.duree_s end,
                   'offerte', e.est_decouverte)
                 order by e.position)
               filter (where e.id_lecon is not null and e.type <> 'intro'),
               '[]'::jsonb)
           ) as module
      from sections s
      left join etapes e on e.id_section = s.id_section
     where s.est_publiee
     group by s.id_formation, s.id_section, s.position, s.titre, s.accroche, s.objectifs
  )
  select
    f.id_formation,
    f.titre,
    f.prix_centimes,
    f.devise,
    f.delivre_certificat,
    (select count(*)::int from sections s
      where s.id_formation = f.id_formation and s.est_publiee),
    (select count(*)::int from etapes e
      where e.id_formation = f.id_formation and e.type = 'video'),
    (select coalesce(sum(e.duree_s), 0)::int from etapes e
      where e.id_formation = f.id_formation and e.type = 'video'),
    (select count(*)::int from etapes e
      where e.id_formation = f.id_formation and e.type = 'quiz'),
    -- Le lien partenaire (un courtier) est une ressource pour la plateforme,
    -- pas un contenu pédagogique : il ne gonfle pas le compte annoncé.
    (select count(*)::int from ressources r
       join etapes e on e.id_lecon = r.id_lecon
      where e.id_formation = f.id_formation and r.est_active and r.type <> 'partenaire'),
    coalesce(
      (select jsonb_agg(
                jsonb_build_object('titre', e.titre, 'module', e.titre_module, 'duree_s', e.duree_s)
                order by e.position_module, e.position)
         from etapes e
        where e.id_formation = f.id_formation and e.est_decouverte),
      '[]'::jsonb),
    coalesce(
      (select jsonb_agg(m.module order by m.position)
         from modules_publies m
        where m.id_formation = f.id_formation),
      '[]'::jsonb)
  from formations f
  where f.est_publiee
  order by f.prix_centimes, f.titre;
$$;

comment on function public.vitrine_formation() is
  'Offre publique : prix, chiffres agrégés, sommaire des modules (titres, nature et durée des étapes). Aucun contenu.';

-- `create or replace` conserve les droits posés par `vitrine_de_la_formation`
-- (anon, authenticated, service_role ; PUBLIC retiré).
