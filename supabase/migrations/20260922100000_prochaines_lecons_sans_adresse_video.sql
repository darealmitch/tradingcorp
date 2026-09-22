-- =============================================================================
-- `prochaines_lecons` ne lit plus l'adresse des vidéos.
--
-- CE QUI ÉTAIT CASSÉ, ET DEPUIS QUAND. Depuis 20260912103000, `video_url` n'est
-- plus lisible par `authenticated`. Cette fonction la renvoyait encore — et
-- elle s'exécute avec les droits de l'appelant (pas de SECURITY DEFINER). Pour
-- un élève, Postgres refusait donc toute la requête (42501), et le bloc
-- « prochaines étapes » du tableau de bord restait vide. Pendant dix jours,
-- pour tous les élèves, sans rien de visible : c'est la table `incidents`,
-- alimentée par le navigateur, qui l'a fait remonter le 22/09/2026, lors d'un
-- achat d'essai.
--
-- LA LEÇON. 20260912103000 retirait un privilège de colonne sans avoir recensé
-- qui lisait cette colonne. Les écrans et l'API REST avaient été passés en
-- revue ; une fonction SQL en mode « invoker » était un lecteur de plus,
-- invisible depuis le code de l'application. Recensement fait cette fois
-- (`prosrc ilike '%video_url%'` sur le schéma public) : il n'en reste qu'un
-- autre, `lecon_contenu`, SECURITY DEFINER et qui masque déjà l'adresse aux
-- élèves.
--
-- CE QUI CHANGE. La fonction rend les deux indicateurs qui ont remplacé
-- l'adresse — `a_video_url` et `video_hebergee` —, exactement ceux qu'attend
-- déjà le modèle `LeconResume` côté écran. Elle reste en mode invoker : c'est
-- la RLS de `lecons` qui décide des lignes, et c'est voulu.
--
-- `drop` puis `create`, et non `create or replace` : le type de retour change,
-- ce que Postgres refuse de faire en place. Les droits sont donc reposés à
-- l'identique de ce qu'ils étaient (authenticated et service_role, pas anon).
-- =============================================================================

drop function if exists public.prochaines_lecons(integer);

create function public.prochaines_lecons(p_limite integer default 3)
returns table (
  id_lecon uuid,
  id_section uuid,
  titre text,
  type text,
  "position" integer,
  duree_s integer,
  est_publiee boolean,
  video_provider text,
  video_provider_id text,
  a_video_url boolean,
  video_hebergee boolean,
  pdf_public_id text
)
language sql stable set search_path = public
as $$
  select l.id_lecon, l.id_section, l.titre, l.type, l.position, l.duree_s,
         l.est_publiee, l.video_provider, l.video_provider_id,
         l.a_video_url, l.video_hebergee, l.pdf_public_id
  from lecons l
  join sections s on s.id_section = l.id_section
  where l.est_publiee
    and not exists (
      select 1 from progression_lecons p
      where p.id_lecon = l.id_lecon and p.id_profil = auth.uid() and p.terminee_le is not null
    )
  order by s.position, l.position
  limit least(greatest(coalesce(p_limite, 3), 1), 50);
$$;

-- Un `create function` accorde EXECUTE à PUBLIC par défaut : on le retire
-- avant de reposer les droits d'origine.
revoke all on function public.prochaines_lecons(integer) from public, anon;
grant execute on function public.prochaines_lecons(integer) to authenticated, service_role;

comment on function public.prochaines_lecons(integer) is
  'Prochaines leçons non terminées, dans l''ordre du programme. S''exécute avec '
  'les droits de l''appelant : elle ne doit lire que des colonnes accordées à '
  'authenticated — jamais video_url (20260922100000).';
