-- Deux lectures nécessaires à la reprise des anciens élèves de la plateforme
-- Wix, toutes deux réservées au rôle `service_role` : elles ne sont appelées
-- que par l'Edge Function `migrer-eleves`, jamais depuis un navigateur.

-- L'ordre canonique des leçons — celui-là même que suit `prochaines_lecons`
-- pour décider où reprendre. L'export Wix ne donne qu'un COMPTEUR d'étapes
-- achevées : c'est ce rang qui permet de le traduire en leçons précises.
create or replace function public.lecons_ordonnees()
returns table (id_lecon uuid, titre text, rang bigint)
language sql
stable
security definer
set search_path = public
as $$
  select l.id_lecon,
         l.titre,
         row_number() over (order by s.position, l.position)
  from lecons l
  join sections s on s.id_section = l.id_section
  where l.est_publiee
  order by s.position, l.position;
$$;

revoke all on function public.lecons_ordonnees() from public, anon, authenticated;
grant execute on function public.lecons_ordonnees() to service_role;

comment on function public.lecons_ordonnees() is
  'Leçons publiées dans l''ordre du parcours, avec leur rang. Sert à traduire un compteur d''étapes Wix en leçons terminées.';

-- Retrouve le profil derrière une adresse. `auth.users` n'est pas exposée à
-- l'API REST ; sans cela, la migration ne saurait pas distinguer un ancien
-- élève déjà inscrit sur TradingCorp d'un compte à créer, et créerait des
-- doublons. Réservée au service_role : ouverte plus largement, elle offrirait
-- un moyen de tester l'existence d'un compte adresse par adresse.
create or replace function public.id_profil_par_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.id_profil_par_email(text) from public, anon, authenticated;
grant execute on function public.id_profil_par_email(text) to service_role;

comment on function public.id_profil_par_email(text) is
  'Identifiant du profil portant cette adresse, ou NULL. Réservée au service_role : rattachement des anciens élèves sans créer de doublon.';
