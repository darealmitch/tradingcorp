-- Vitrine de la formation : ce que les pages publiques disent de l'offre.
--
-- Diagnostic commercial du 14/10/2026. L'accueil ne disait ni ce que contient
-- la formation, ni combien elle compte de leçons, ni qu'on peut l'essayer :
-- les chiffres existaient en base, mais hors de portée d'un visiteur. La RLS
-- de `lecons` ne s'ouvre qu'aux inscrits, et elle doit le rester.
--
-- Cette fonction ne rend donc que des AGRÉGATS — combien de modules, de
-- vidéos, d'heures, de quiz, de ressources — plus les titres des seules
-- leçons offertes, que l'administrateur a justement choisi de montrer. Ni
-- contenu, ni adresse de vidéo, ni question de quiz.
--
-- Un chiffre recopié en dur dans une page finit par diverger de la
-- formation, et c'est la page de vente qui a tort. Celui-ci la suit : une
-- leçon publiée, retirée ou offerte change la vitrine au chargement suivant.

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
             'lecons_offertes', count(e.id_lecon) filter (where e.est_decouverte)
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
  'Offre publique : prix, chiffres agrégés du programme et titres des leçons offertes. Aucun contenu.';

-- Les visiteurs anonymes en sont les premiers lecteurs : c'est l'accueil qui
-- l'appelle. PUBLIC est retiré d'abord, pour que le droit ne tienne qu'à la
-- liste explicite ci-dessous.
revoke all on function public.vitrine_formation() from public;
grant execute on function public.vitrine_formation() to anon, authenticated, service_role;
