-- Essai accordé par un administrateur (demande du 12/10/2026).
--
-- Ce qui compte : qu'accorder un essai n'ouvre AUCUN droit de plus que la
-- découverte — pas d'inscription, seules les leçons offertes ; que le geste
-- soit réservé aux administrateurs et refuse les comptes à qui l'e-mail
-- mentirait ; que l'e-mail parte à la personne désignée, même en mode essai
-- des e-mails, et à elle seule ; que l'annonce programmée n'écrive rien avant
-- la mise en production, puis parte une fois.
--
-- Les assertions portent sur les comptes du jeu d'essai, jamais sur des
-- totaux : rejoué contre la vraie base, l'annonce des essais programmés
-- viserait aussi les vrais comptes, avant que tout soit annulé.

begin;
create extension if not exists pgtap with schema extensions;

select plan(36);

insert into auth.users (id, email, raw_user_meta_data) values
  ('e5500000-0000-0000-0000-0000000000a1', 'lea-essai@essai.local',
   '{"prenom":"Lea","nom":"Essai","date_naissance":"1996-06-06"}'::jsonb),
  ('e5500000-0000-0000-0000-0000000000a2', 'zoe-essai@essai.local',
   '{"prenom":"Zoe","nom":"Voisine","date_naissance":"1995-05-05"}'::jsonb),
  ('e5500000-0000-0000-0000-0000000000a3', 'paul-essai@essai.local',
   '{"prenom":"Paul","nom":"Programme","date_naissance":"1993-03-03"}'::jsonb),
  ('e5500000-0000-0000-0000-0000000000a4', 'remi-essai@essai.local',
   '{"prenom":"Remi","nom":"Acheteur","date_naissance":"1992-02-02"}'::jsonb),
  ('e5500000-0000-0000-0000-0000000000b5', 'bea-essai@essai.local',
   '{"prenom":"Bea","nom":"Inscrite","date_naissance":"1991-01-01"}'::jsonb),
  ('e5500000-0000-0000-0000-0000000000e6', 'tess-essai@essai.local',
   '{"prenom":"Tess","nom":"Test","date_naissance":"1990-01-01"}'::jsonb),
  ('e5500000-0000-0000-0000-0000000000f7', 'fred-essai@essai.local',
   '{"prenom":"Fred","nom":"Formateur","date_naissance":"1985-08-08"}'::jsonb),
  ('e5500000-0000-0000-0000-0000000000ad', 'ada-essai@essai.local',
   '{"prenom":"Ada","nom":"Admin","date_naissance":"1980-04-04"}'::jsonb);
update public.profils set est_test = true
 where id_profil = 'e5500000-0000-0000-0000-0000000000e6';
update public.profils set role = 'formateur'
 where id_profil = 'e5500000-0000-0000-0000-0000000000f7';
update public.profils set role = 'admin'
 where id_profil = 'e5500000-0000-0000-0000-0000000000ad';

-- Prix nul : la formation la moins chère est celle que montre la vitrine.
insert into public.formations (id_formation, titre, slug, est_publiee, prix_centimes) values
  ('fe550000-0000-0000-0000-000000000001', 'Formation d''essai', 'essai-accorde', true, 0);
insert into public.sections (id_section, id_formation, titre, position, est_publiee) values
  ('5e550000-0000-0000-0000-000000000001', 'fe550000-0000-0000-0000-000000000001',
   'Module 1', 1, true);
insert into public.lecons (id_lecon, id_section, titre, position, est_publiee, type) values
  ('1e550000-0000-0000-0000-000000000000', '5e550000-0000-0000-0000-000000000001',
   'Présentation', 0, true, 'intro'),
  ('1e550000-0000-0000-0000-00000000000a', '5e550000-0000-0000-0000-000000000001',
   'Vidéo A', 1, true, 'video'),
  ('1e550000-0000-0000-0000-00000000000b', '5e550000-0000-0000-0000-000000000001',
   'Vidéo B', 2, true, 'video');

insert into public.inscriptions (id_profil, id_formation, source) values
  ('e5500000-0000-0000-0000-0000000000b5', 'fe550000-0000-0000-0000-000000000001', 'paiement');

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

-- ─────────────────────────────────────────────────────────────────────────────
-- QUI PEUT ACCORDER — un administrateur, et personne d'autre
-- ─────────────────────────────────────────────────────────────────────────────

select ok(
  not has_function_privilege('anon', 'public.accorder_essai(uuid, boolean)', 'execute'),
  'droits — un visiteur n''accorde rien'
);

select ok(
  not has_function_privilege('authenticated', 'public.annoncer_essai(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.annoncer_essais_programmes()', 'execute'),
  'droits — ni l''annonce d''un essai, ni celle des essais programmés, ne s''appellent depuis le site'
);

select is(
  concat_ws(',',
    pg_temp.erreur_sous('e5500000-0000-0000-0000-0000000000a2',
      $$select public.accorder_essai('e5500000-0000-0000-0000-0000000000a1')$$),
    pg_temp.erreur_sous('e5500000-0000-0000-0000-0000000000f7',
      $$select public.accorder_essai('e5500000-0000-0000-0000-0000000000a1')$$)),
  'P0001,P0001',
  'droits — ni une élève ni un formateur n''accordent d''essai'
);

select is(
  pg_temp.erreur_sous('e5500000-0000-0000-0000-0000000000ad',
    $$select public.accorder_essai('e5500000-0000-0000-0000-0000000000a1')$$),
  'P0001',
  'refus — pas d''essai tant qu''aucune leçon n''est offerte'
);

update public.lecons set est_decouverte = true
 where id_lecon = '1e550000-0000-0000-0000-00000000000a';

select is(
  concat_ws(',',
    pg_temp.erreur_sous('e5500000-0000-0000-0000-0000000000ad',
      $$select public.accorder_essai('e5500000-0000-0000-0000-0000000000b5')$$),
    pg_temp.erreur_sous('e5500000-0000-0000-0000-0000000000ad',
      $$select public.accorder_essai('e5500000-0000-0000-0000-0000000000e6')$$),
    pg_temp.erreur_sous('e5500000-0000-0000-0000-0000000000ad',
      $$select public.accorder_essai('e5500000-0000-0000-0000-0000000000f7')$$)),
  'P0001,P0001,P0001',
  'refus — ni l''inscrite, ni le compte de test, ni le formateur : l''e-mail leur mentirait'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- L'ESSAI ACCORDÉ — aucun droit de plus, un e-mail à elle seule
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.sous('e5500000-0000-0000-0000-0000000000ad',
    $$select public.accorder_essai('e5500000-0000-0000-0000-0000000000a1')$$),
  'annonce',
  'essai — l''administratrice l''accorde à Lea, prévenue tout de suite'
);

select is(
  (select count(*)::int from public.inscriptions
    where id_profil = 'e5500000-0000-0000-0000-0000000000a1'),
  0,
  'essai — aucune inscription : Lea n''a pas l''accès complet'
);

select is(
  pg_temp.sous('e5500000-0000-0000-0000-0000000000a1',
    $$select concat_ws(',',
        public.lecon_debloquee('1e550000-0000-0000-0000-000000000000'),
        public.lecon_debloquee('1e550000-0000-0000-0000-00000000000a'),
        public.lecon_debloquee('1e550000-0000-0000-0000-00000000000b'),
        public.a_inscription_active('fe550000-0000-0000-0000-000000000001'))$$),
  't,t,f,f',
  'essai — Lea ouvre l''introduction et la leçon offerte, pas la suivante, et n''est pas inscrite'
);

-- Les espaces insécables (chr(160)) sont ramenés à des espaces ordinaires pour
-- comparer le texte ; l'assertion suivante vérifie qu'ils sont bien là.
select is(
  (select titre || ' | ' || lien || ' | ' || replace(message, chr(160), ' ')
     from public.notifications
    where id_profil = 'e5500000-0000-0000-0000-0000000000a1'
      and cle_evenement = 'essai_accorde'),
  'Ton accès d''essai à TradingCorp est ouvert | /espace | '
  || 'Tu peux suivre gratuitement une leçon de « Formation d''essai » : « Vidéo A ».',
  'essai — la notification dit ce que l''essai ouvre, et mène à l''espace'
);

select ok(
  (select position('«' || chr(160) in message) > 0
          and position('« ' in message) = 0
          and position(' »' in message) = 0
          and position(' :' in message) = 0
     from public.notifications
    where id_profil = 'e5500000-0000-0000-0000-0000000000a1'
      and cle_evenement = 'essai_accorde'),
  'essai — guillemets et deux-points à espaces insécables : aucun ne finit seul une ligne'
);

select is(
  (select c.statut from public.courriels c
     join public.notifications n on n.id_notification = c.id_notification
    where n.id_profil = 'e5500000-0000-0000-0000-0000000000a1'
      and n.cle_evenement = 'essai_accorde'),
  'a_envoyer',
  'e-mail — il part, même quand les e-mails sont en mode essai'
);

select is(
  (select rc.famille from public.reserver_courriels(50) rc
    where rc.id_courriel = (
      select c.id_courriel from public.courriels c
        join public.notifications n on n.id_notification = c.id_notification
       where n.id_profil = 'e5500000-0000-0000-0000-0000000000a1'
         and n.cle_evenement = 'essai_accorde')),
  'essai_accorde',
  'e-mail — la fonction d''envoi sait qu''elle écrit un e-mail d''essai'
);

select is(
  pg_temp.erreur_sous('e5500000-0000-0000-0000-0000000000ad',
    $$select public.accorder_essai('e5500000-0000-0000-0000-0000000000a1')$$),
  'P0001',
  'essai — une seule fois par élève'
);

select is(
  (select count(*)::int from public.notifications
    where id_profil = 'e5500000-0000-0000-0000-0000000000a1'
      and cle_evenement = 'essai_accorde'),
  1,
  'essai — le second geste refusé n''a rien envoyé'
);

select is(
  (select count(*)::int || ' / ' || min(meta ->> 'annonce') || ' / ' || min(meta ->> 'lecons_offertes')
     from public.journal_admin
    where action = 'octroi_essai'
      and id_profil = 'e5500000-0000-0000-0000-0000000000ad'
      and id_profil_cible = 'e5500000-0000-0000-0000-0000000000a1'),
  '1 / immediate / 1',
  'journal — l''octroi est tracé, avec son auteur'
);

select is(
  concat_ws(',',
    pg_temp.sous('e5500000-0000-0000-0000-0000000000ad',
      $$select count(*)::text from public.essais
         where id_profil = 'e5500000-0000-0000-0000-0000000000a1'$$),
    pg_temp.sous('e5500000-0000-0000-0000-0000000000a1',
      $$select count(*)::text from public.essais$$)),
  '1,0',
  'lecture — l''administratrice voit l''essai ; Lea, elle, ne lit pas la table'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PERSONNE D'AUTRE N'EST TOUCHÉ
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  (select string_agg(p.prenom || ':' || (
            select count(*) from public.notifications n
             where n.id_profil = p.id_profil) || ':' || (
            select count(*) from public.essais e
             where e.id_profil = p.id_profil), ',' order by p.prenom)
     from public.profils p
    where p.id_profil in ('e5500000-0000-0000-0000-0000000000a2',
                          'e5500000-0000-0000-0000-0000000000b5',
                          'e5500000-0000-0000-0000-0000000000e6')),
  'Bea:0:0,Tess:0:0,Zoe:0:0',
  'voisins — ni notification ni essai pour les autres comptes'
);

select is(
  (select statut from public.inscriptions
    where id_profil = 'e5500000-0000-0000-0000-0000000000b5'),
  'active',
  'voisins — l''inscrite garde son accès complet'
);

select is(
  pg_temp.sous('e5500000-0000-0000-0000-0000000000a1',
    $$select public.accueillir_en_decouverte()::text$$),
  'false',
  'bienvenue — Lea a son e-mail d''essai : pas de seconde bienvenue'
);

select is(
  pg_temp.sous('e5500000-0000-0000-0000-0000000000a2',
    $$select public.accueillir_en_decouverte()::text$$),
  'true',
  'bienvenue — Zoe, sans essai, est accueillie comme avant'
);

select is(
  (select c.statut from public.courriels c
     join public.notifications n on n.id_notification = c.id_notification
    where n.id_profil = 'e5500000-0000-0000-0000-0000000000a2'
      and n.cle_evenement = 'decouverte_accueil'),
  'ecarte',
  'bienvenue — son e-mail reste retenu par le mode essai : seule la famille de l''essai y échappe'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- L'ESSAI PROGRAMMÉ — rien avant la mise en production, puis une fois
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.sous('e5500000-0000-0000-0000-0000000000ad',
    $$select public.accorder_essai('e5500000-0000-0000-0000-0000000000a3', true)$$),
  'programme',
  'programmé — l''essai de Paul attend la mise en production'
);

select is(
  (select count(*)::int from public.notifications
    where id_profil = 'e5500000-0000-0000-0000-0000000000a3'),
  0,
  'programmé — rien chez Paul : ni notification, ni e-mail'
);

select ok(
  (select annonce_le is null and accorde_par = 'e5500000-0000-0000-0000-0000000000ad'
     from public.essais where id_profil = 'e5500000-0000-0000-0000-0000000000a3'),
  'programmé — l''essai est enregistré, son annonce en attente'
);

select is(
  (select min(meta ->> 'annonce') from public.journal_admin
    where action = 'octroi_essai'
      and id_profil_cible = 'e5500000-0000-0000-0000-0000000000a3'),
  'a_la_mise_en_production',
  'programmé — le journal dit quand il partira'
);

select is(
  pg_temp.sous('e5500000-0000-0000-0000-0000000000a3',
    $$select public.accueillir_en_decouverte()::text$$),
  'false',
  'programmé — la bienvenue automatique ne le devance pas'
);

select is(
  pg_temp.sous('e5500000-0000-0000-0000-0000000000ad',
    $$select public.accorder_essai('e5500000-0000-0000-0000-0000000000a4', true)$$),
  'programme',
  'programmé — celui de Remi aussi'
);

-- Remi achète avant la mise en production ; une deuxième leçon est offerte.
insert into public.inscriptions (id_profil, id_formation, source) values
  ('e5500000-0000-0000-0000-0000000000a4', 'fe550000-0000-0000-0000-000000000001', 'paiement');
update public.lecons set est_decouverte = true
 where id_lecon = '1e550000-0000-0000-0000-00000000000b';

select ok(
  public.annoncer_essais_programmes() >= 1,
  'mise en production — les annonces programmées partent'
);

select is(
  (select replace(n.message, chr(160), ' ') || ' | ' || c.statut from public.notifications n
     join public.courriels c on c.id_notification = n.id_notification
    where n.id_profil = 'e5500000-0000-0000-0000-0000000000a3'
      and n.cle_evenement = 'essai_accorde'),
  'Tu peux suivre gratuitement 2 leçons de « Formation d''essai » : « Vidéo A » et « Vidéo B ». | a_envoyer',
  'mise en production — Paul est prévenu, avec les leçons offertes à ce moment-là'
);

select ok(
  (select annonce_le is not null from public.essais
    where id_profil = 'e5500000-0000-0000-0000-0000000000a3'),
  'mise en production — son annonce est datée'
);

select is(
  (select count(*)::int from public.essais
    where id_profil = 'e5500000-0000-0000-0000-0000000000a4')
  + (select count(*)::int from public.notifications
      where id_profil = 'e5500000-0000-0000-0000-0000000000a4'),
  0,
  'mise en production — Remi a acheté entre-temps : l''annonce tombe, rien ne lui est écrit'
);

select is(
  (select count(*)::int from public.journal_admin
    where action = 'octroi_essai'
      and id_profil_cible = 'e5500000-0000-0000-0000-0000000000a4'),
  1,
  'mise en production — l''octroi de Remi reste au journal'
);

select lives_ok(
  $$select public.annoncer_essais_programmes()$$,
  'mise en production — rejouée sans erreur'
);

select is(
  (select count(*)::int from public.notifications
    where id_profil = 'e5500000-0000-0000-0000-0000000000a3'
      and cle_evenement = 'essai_accorde'),
  1,
  'mise en production — rejouée, elle ne prévient personne deux fois'
);

select is(
  (select count(*)::int from public.notifications
    where id_profil in ('e5500000-0000-0000-0000-0000000000a2',
                        'e5500000-0000-0000-0000-0000000000b5',
                        'e5500000-0000-0000-0000-0000000000e6')
      and cle_evenement = 'essai_accorde'),
  0,
  'mise en production — aucun essai annoncé à qui n''en a pas reçu'
);

select is(
  pg_temp.sous('e5500000-0000-0000-0000-0000000000a3',
    $$select concat_ws(',',
        public.lecon_debloquee('1e550000-0000-0000-0000-00000000000b'),
        public.a_inscription_active('fe550000-0000-0000-0000-000000000001'))$$),
  't,f',
  'mise en production — Paul ouvre les leçons offertes, sans être inscrit'
);

select * from finish();
rollback;
