-- Retrait d'un essai par un administrateur (demande du 13/10/2026).
--
-- Ce qui compte : que le retrait ferme les leçons offertes au compte concerné,
-- et à lui seul ; qu'il laisse intacts l'accès complet et la progression ;
-- que l'élève lise la fin de son essai dans son espace sans recevoir d'e-mail,
-- et qu'un e-mail d'annonce pas encore parti ne parte plus ; qu'un essai
-- retiré puisse reprendre ; que les annonces l'épargnent.
--
-- Les assertions portent sur les comptes du jeu d'essai, jamais sur des
-- totaux : rejoué contre la vraie base, l'annonce des leçons offertes
-- viserait aussi les vrais comptes, avant que tout soit annulé.

begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

insert into auth.users (id, email, raw_user_meta_data) values
  ('e6600000-0000-0000-0000-0000000000a1', 'lea-retrait@essai.local',
   '{"prenom":"Lea","nom":"Retrait","date_naissance":"1996-06-06"}'::jsonb),
  ('e6600000-0000-0000-0000-0000000000a2', 'zoe-retrait@essai.local',
   '{"prenom":"Zoe","nom":"Voisine","date_naissance":"1995-05-05"}'::jsonb),
  ('e6600000-0000-0000-0000-0000000000a3', 'paul-retrait@essai.local',
   '{"prenom":"Paul","nom":"Programme","date_naissance":"1993-03-03"}'::jsonb),
  ('e6600000-0000-0000-0000-0000000000a4', 'bea-retrait@essai.local',
   '{"prenom":"Bea","nom":"Payante","date_naissance":"1991-01-01"}'::jsonb),
  ('e6600000-0000-0000-0000-0000000000f7', 'fred-retrait@essai.local',
   '{"prenom":"Fred","nom":"Formateur","date_naissance":"1985-08-08"}'::jsonb),
  ('e6600000-0000-0000-0000-0000000000ad', 'ada-retrait@essai.local',
   '{"prenom":"Ada","nom":"Admin","date_naissance":"1980-04-04"}'::jsonb);
update public.profils set role = 'formateur'
 where id_profil = 'e6600000-0000-0000-0000-0000000000f7';
update public.profils set role = 'admin'
 where id_profil = 'e6600000-0000-0000-0000-0000000000ad';

-- Prix nul : la formation la moins chère est celle que montre la vitrine.
insert into public.formations (id_formation, titre, slug, est_publiee, prix_centimes) values
  ('fe660000-0000-0000-0000-000000000001', 'Formation d''essai', 'essai-retrait', true, 0);
insert into public.sections (id_section, id_formation, titre, position, est_publiee) values
  ('5e660000-0000-0000-0000-000000000001', 'fe660000-0000-0000-0000-000000000001',
   'Module 1', 1, true);
insert into public.lecons (id_lecon, id_section, titre, position, est_publiee, type, est_decouverte) values
  ('1e660000-0000-0000-0000-000000000000', '5e660000-0000-0000-0000-000000000001',
   'Présentation', 0, true, 'intro', false),
  ('1e660000-0000-0000-0000-00000000000a', '5e660000-0000-0000-0000-000000000001',
   'Vidéo A', 1, true, 'video', true),
  ('1e660000-0000-0000-0000-00000000000b', '5e660000-0000-0000-0000-000000000001',
   'Vidéo B', 2, true, 'video', false);

-- Lea a déjà suivi la leçon offerte : sa progression doit survivre au retrait.
insert into public.progression_lecons (id_profil, id_lecon, terminee_le) values
  ('e6600000-0000-0000-0000-0000000000a1', '1e660000-0000-0000-0000-00000000000a', now());

-- Rend le résultat de la requête, exécutée sous l'identité donnée.
create function pg_temp.sous(p_sub text, p_sql text) returns text
language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute p_sql into r;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return r;
end;
$$;

-- Rend le code d'erreur de la requête sous l'identité donnée, ou null.
create function pg_temp.erreur_sous(p_sub text, p_sql text) returns text
language plpgsql as $$
declare code text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql;
  exception when others then
    code := sqlstate;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return code;
end;
$$;

-- Ce que l'élève ouvre : introduction, leçon offerte, leçon suivante, puis le
-- nombre de leçons offertes que son parcours affiche.
create function pg_temp.droits(p_sub text) returns text
language sql as $$
  select pg_temp.sous(p_sub, $q$select concat_ws(',',
    public.lecon_debloquee('1e660000-0000-0000-0000-000000000000'),
    public.lecon_debloquee('1e660000-0000-0000-0000-00000000000a'),
    public.lecon_debloquee('1e660000-0000-0000-0000-00000000000b'),
    (select m.lecons_offertes from public.etats_modules('fe660000-0000-0000-0000-000000000001') m))$q$);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- QUI PEUT RETIRER — un administrateur, un essai en cours
-- ─────────────────────────────────────────────────────────────────────────────

select ok(
  not has_function_privilege('anon', 'public.retirer_essai(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.essai_retire(uuid)', 'execute'),
  'droits — un visiteur ne retire rien, et la règle interne ne s''appelle pas depuis le site'
);

select is(
  pg_temp.sous('e6600000-0000-0000-0000-0000000000ad',
    $$select public.accorder_essai('e6600000-0000-0000-0000-0000000000a1')$$),
  'annonce',
  'préalable — l''administratrice accorde un essai à Lea'
);

select is(
  pg_temp.droits('e6600000-0000-0000-0000-0000000000a1'),
  't,t,f,1',
  'avant — Lea ouvre l''introduction et la leçon offerte, et son parcours en compte une'
);

select is(
  concat_ws(',',
    pg_temp.erreur_sous('e6600000-0000-0000-0000-0000000000a2',
      $$select public.retirer_essai('e6600000-0000-0000-0000-0000000000a1')$$),
    pg_temp.erreur_sous('e6600000-0000-0000-0000-0000000000f7',
      $$select public.retirer_essai('e6600000-0000-0000-0000-0000000000a1')$$)),
  'P0001,P0001',
  'droits — ni une élève ni un formateur ne retirent d''essai'
);

select is(
  pg_temp.erreur_sous('e6600000-0000-0000-0000-0000000000ad',
    $$select public.retirer_essai('e6600000-0000-0000-0000-0000000000a2')$$),
  'P0001',
  'refus — rien à retirer à Zoe, qui n''a pas d''essai'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LE RETRAIT — les leçons offertes se ferment, à Lea seule
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('e6600000-0000-0000-0000-0000000000ad',
    $$select public.retirer_essai('e6600000-0000-0000-0000-0000000000a1')$$),
  null::text,
  'retrait — l''administratrice retire l''essai de Lea'
);

select ok(
  (select retire_le is not null and retire_par = 'e6600000-0000-0000-0000-0000000000ad'
     from public.essais where id_profil = 'e6600000-0000-0000-0000-0000000000a1'),
  'retrait — l''essai est marqué retiré, avec son auteur'
);

select is(
  pg_temp.droits('e6600000-0000-0000-0000-0000000000a1'),
  'f,f,f,0',
  'retrait — Lea n''ouvre plus ni l''introduction ni la leçon offerte, et son parcours n''en affiche plus'
);

select is(
  pg_temp.sous('e6600000-0000-0000-0000-0000000000a1',
    $$select count(*)::text from public.lecons
       where id_lecon = '1e660000-0000-0000-0000-00000000000a'$$),
  '0',
  'retrait — la leçon offerte ne lui est même plus lisible'
);

select is(
  pg_temp.sous('e6600000-0000-0000-0000-0000000000a1',
    $$select string_agg(l.offerte::text, ',' order by l.position)
        from public.etats_lecons('5e660000-0000-0000-0000-000000000001') l$$),
  'false,false,false',
  'retrait — plus aucune leçon marquée « Offerte » dans son module'
);

select is(
  (select count(*)::int from public.progression_lecons
    where id_profil = 'e6600000-0000-0000-0000-0000000000a1'
      and terminee_le is not null),
  1,
  'retrait — sa progression est conservée'
);

select is(
  pg_temp.droits('e6600000-0000-0000-0000-0000000000a2'),
  't,t,f,1',
  'voisins — Zoe, sans essai, garde la découverte comme avant'
);

select is(
  pg_temp.sous('e6600000-0000-0000-0000-0000000000a1',
    $$select public.accueillir_en_decouverte()::text$$),
  'false',
  'retrait — aucune bienvenue ne lui réannonce les leçons offertes'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTIFICATIONS ET E-MAILS — cohérents, et sans e-mail de plus
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  (select c.statut from public.courriels c
     join public.notifications n on n.id_notification = c.id_notification
    where n.id_profil = 'e6600000-0000-0000-0000-0000000000a1'
      and n.cle_evenement like 'essai_accorde:%'),
  'ecarte',
  'e-mail — l''annonce de l''essai, pas encore partie, ne part plus'
);

select is(
  (select titre || ' | ' || lien from public.notifications
    where id_profil = 'e6600000-0000-0000-0000-0000000000a1'
      and cle_evenement like 'essai_retire:%'),
  'Ton accès d''essai a pris fin | /espace',
  'notification — Lea lit dans son espace que son essai a pris fin'
);

select is(
  (select count(*)::int from public.courriels c
     join public.notifications n on n.id_notification = c.id_notification
    where n.id_profil = 'e6600000-0000-0000-0000-0000000000a1'
      and n.cle_evenement like 'essai_retire:%'),
  0,
  'e-mail — la fin de l''essai ne part pas par e-mail'
);

select is(
  (select count(*)::int || ' / ' || min(meta ->> 'annonce') from public.journal_admin
    where action = 'retrait_essai'
      and id_profil = 'e6600000-0000-0000-0000-0000000000ad'
      and id_profil_cible = 'e6600000-0000-0000-0000-0000000000a1'),
  '1 / envoyee',
  'journal — le retrait est tracé, avec son auteur'
);

select is(
  pg_temp.erreur_sous('e6600000-0000-0000-0000-0000000000ad',
    $$select public.retirer_essai('e6600000-0000-0000-0000-0000000000a1')$$),
  'P0001',
  'retrait — un second retrait est refusé'
);

select is(
  pg_temp.erreur_sous('e6600000-0000-0000-0000-0000000000ad',
    $$select public.annoncer_lecons_offertes(false)$$),
  null::text,
  'annonce — l''administratrice annonce les leçons offertes aux comptes sans achat'
);

select is(
  (select string_agg(p.prenom || ':' || (
            select count(*) from public.notifications n
             where n.id_profil = p.id_profil
               and n.cle_evenement like 'decouverte_annonce:%'), ',' order by p.prenom)
     from public.profils p
    where p.id_profil in ('e6600000-0000-0000-0000-0000000000a1',
                          'e6600000-0000-0000-0000-0000000000a2')),
  'Lea:0,Zoe:1',
  'annonce — elle épargne Lea, dont l''essai est retiré, et touche Zoe'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- REPRENDRE — un essai retiré peut être réaccordé
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.sous('e6600000-0000-0000-0000-0000000000ad',
    $$select public.accorder_essai('e6600000-0000-0000-0000-0000000000a1')$$),
  'annonce',
  'reprise — l''administratrice réaccorde l''essai de Lea'
);

select is(
  pg_temp.droits('e6600000-0000-0000-0000-0000000000a1'),
  't,t,f,1',
  'reprise — Lea rouvre l''introduction et la leçon offerte'
);

select is(
  (select count(*)::int || ' / ' || count(distinct cle_evenement)::int from public.notifications
    where id_profil = 'e6600000-0000-0000-0000-0000000000a1'
      and cle_evenement like 'essai_accorde:%'),
  '2 / 2',
  'reprise — un nouvel octroi, une nouvelle annonce : deux annonces distinctes'
);

select is(
  (select min(meta ->> 'reprise') from public.journal_admin
    where action = 'octroi_essai'
      and id_profil_cible = 'e6600000-0000-0000-0000-0000000000a1'
      and (meta ->> 'reprise')::boolean),
  'true',
  'reprise — le journal la distingue d''un premier octroi'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LES AUTRES DROITS — l'accès complet ne bouge pas
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.sous('e6600000-0000-0000-0000-0000000000ad',
    $$select public.accorder_essai('e6600000-0000-0000-0000-0000000000a4')$$),
  'annonce',
  'payant — Bea reçoit d''abord un essai'
);

-- Bea achète ensuite la formation ; son essai est retiré après coup.
insert into public.inscriptions (id_profil, id_formation, source) values
  ('e6600000-0000-0000-0000-0000000000a4', 'fe660000-0000-0000-0000-000000000001', 'paiement');

select is(
  concat_ws(',',
    pg_temp.erreur_sous('e6600000-0000-0000-0000-0000000000ad',
      $$select public.retirer_essai('e6600000-0000-0000-0000-0000000000a4')$$),
    pg_temp.sous('e6600000-0000-0000-0000-0000000000a4',
      $$select concat_ws('/',
          public.a_inscription_active('fe660000-0000-0000-0000-000000000001'),
          public.lecon_debloquee('1e660000-0000-0000-0000-000000000000'),
          (select m.etat from public.etats_modules('fe660000-0000-0000-0000-000000000001') m))$$)),
  't/t/debloque',
  'payant — l''essai retiré, Bea garde son accès complet'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- L'ESSAI PROGRAMMÉ — retiré, il ne part jamais
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  concat_ws(',',
    pg_temp.sous('e6600000-0000-0000-0000-0000000000ad',
      $$select public.accorder_essai('e6600000-0000-0000-0000-0000000000a3', true)$$),
    coalesce(pg_temp.erreur_sous('e6600000-0000-0000-0000-0000000000ad',
      $$select public.retirer_essai('e6600000-0000-0000-0000-0000000000a3')$$), 'retire')),
  'programme,retire',
  'programmé — l''essai de Paul, programmé, est retiré avant la mise en production'
);

-- Paul a reçu plus haut l'annonce des leçons offertes à tous : seules ses
-- notifications d'essai comptent ici.
select ok(
  public.annoncer_essais_programmes() >= 0
  and (select count(*) from public.notifications
        where id_profil = 'e6600000-0000-0000-0000-0000000000a3'
          and cle_evenement like 'essai%') = 0
  and (select retire_le is not null from public.essais
        where id_profil = 'e6600000-0000-0000-0000-0000000000a3'),
  'programmé — la mise en production ne lui écrit rien, et l''essai retiré reste en base'
);

select * from finish();
rollback;
