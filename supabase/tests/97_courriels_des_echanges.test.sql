-- Notifications et e-mails des échanges : qui est prévenu de quoi.
--
-- Un e-mail parti à la mauvaise personne ne casse aucun écran : il est lu,
-- simplement, et ne se rattrape pas. Ces tests jouent tout le parcours d'un
-- fil — publication, réponse d'une camarade, échange privé, changements de
-- visibilité, rejet — et vérifient à chaque pas la liste exacte des personnes
-- prévenues : Ana, élève auteure du fil ; Bea, autre élève ; Fio, formatrice
-- qui prend part à l'échange ; Gus, formateur resté à l'écart ; Ada,
-- administratrice ; Tom, compte de test.

begin;
create extension if not exists pgtap with schema extensions;

select plan(40);

-- Ada d'abord, et administratrice avant l'arrivée des autres : elle reçoit
-- ainsi leurs notifications « Nouveau compte », qui ne partent pas par e-mail.
insert into auth.users (id, email, raw_user_meta_data) values
  ('97000000-0000-0000-0000-0000000000ad', 'ada-courriels@essai.local',
   '{"prenom":"Ada","nom":"Admin","date_naissance":"1980-04-04"}'::jsonb);
update public.profils set role = 'admin'
 where id_profil = '97000000-0000-0000-0000-0000000000ad';

insert into auth.users (id, email, raw_user_meta_data) values
  ('97000000-0000-0000-0000-0000000000a1', 'ana-courriels@essai.local',
   '{"prenom":"Ana","nom":"Apprenante","date_naissance":"1994-02-02"}'::jsonb),
  ('97000000-0000-0000-0000-0000000000b2', 'bea-courriels@essai.local',
   '{"prenom":"Bea","nom":"Camarade","date_naissance":"1993-03-03"}'::jsonb),
  ('97000000-0000-0000-0000-0000000000f3', 'fio-courriels@essai.local',
   '{"prenom":"Fio","nom":"Formatrice","date_naissance":"1985-05-05"}'::jsonb),
  ('97000000-0000-0000-0000-0000000000f4', 'gus-courriels@essai.local',
   '{"prenom":"Gus","nom":"Formateur","date_naissance":"1986-06-06"}'::jsonb),
  ('97000000-0000-0000-0000-0000000000e5', 'tom-courriels@essai.local',
   '{"prenom":"Tom","nom":"Essai","date_naissance":"1992-07-07"}'::jsonb);
update public.profils set role = 'formateur'
 where id_profil in ('97000000-0000-0000-0000-0000000000f3', '97000000-0000-0000-0000-0000000000f4');
update public.profils set est_test = true
 where id_profil = '97000000-0000-0000-0000-0000000000e5';

insert into public.formations (id_formation, titre, slug, est_publiee)
values ('f9700000-0000-0000-0000-00000000000f', 'Formation des courriels', 'essai-courriels', true);
insert into public.sections (id_section, id_formation, titre, position, est_publiee)
values ('59700000-0000-0000-0000-000000000005', 'f9700000-0000-0000-0000-00000000000f', 'Module', 1, true);
insert into public.lecons (id_lecon, id_section, titre, position, est_publiee)
values ('19700000-0000-0000-0000-000000000001', '59700000-0000-0000-0000-000000000005', 'Leçon des échanges', 1, true);
insert into public.inscriptions (id_profil, id_formation) values
  ('97000000-0000-0000-0000-0000000000a1', 'f9700000-0000-0000-0000-00000000000f'),
  ('97000000-0000-0000-0000-0000000000b2', 'f9700000-0000-0000-0000-00000000000f');

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

-- Les personnes du jeu d'essai prévenues par ces clés. Les vrais
-- administrateurs, présents en production, restent hors du compte.
create function pg_temp.prevenus(p_cles text) returns text
language sql as $$
  select coalesce(string_agg(distinct p.prenom, ',' order by p.prenom), '(personne)')
    from public.notifications n
    join public.profils p on p.id_profil = n.id_profil
   where n.cle_evenement like p_cles
     and n.id_profil::text like '97000000-%';
$$;

-- Ce que cette personne a lu, pour ces clés : titre — message.
create function pg_temp.lu(p_prenom text, p_cles text) returns text
language sql as $$
  select string_agg(n.titre || ' — ' || coalesce(n.message, ''), ' / ' order by n.titre)
    from public.notifications n
    join public.profils p on p.id_profil = n.id_profil
   where n.cle_evenement like p_cles
     and n.id_profil::text like '97000000-%'
     and p.prenom = p_prenom;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- LES DROITS — la file ne se lit ni ne s'écrit depuis l'API
-- ─────────────────────────────────────────────────────────────────────────────

select ok(
  has_function_privilege('service_role', 'public.reserver_courriels(integer)', 'execute')
  and has_function_privilege('service_role', 'public.conclure_courriel(uuid, boolean)', 'execute')
  and has_function_privilege('service_role', 'public.courriels_cle_valide(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.reserver_courriels(integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.conclure_courriel(uuid, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.courriels_cle_valide(text)', 'execute'),
  'droits — seule la fonction d''envoi, en rôle de service, réserve et conclut les e-mails'
);

select ok(
  not has_function_privilege('service_role', 'public.courriels_reglage(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.courriels_reglage(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.notifier_echange(uuid, text, text, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.courriel_autorise(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.signature_publique(uuid)', 'execute'),
  'droits — le coffre et les notifications ne s''atteignent pas depuis l''API'
);

select is(
  public.courriels_cle_valide('mauvaise-cle') or public.courriels_cle_valide(null),
  false,
  'droits — une clé fausse ou absente ne réveille pas l''envoi'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- UN MESSAGE EN ATTENTE — ceux qui le modèrent, et eux seuls
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('97000000-0000-0000-0000-0000000000a1',
    $$insert into public.commentaires (id_commentaire, id_profil, id_lecon, contenu)
      values ('c9700000-0000-0000-0000-000000000001', '97000000-0000-0000-0000-0000000000a1',
              '19700000-0000-0000-0000-000000000001', 'CONFIDENTIEL question d''Ana')$$),
  null::text,
  'attente — Ana publie son message'
);

select is(
  pg_temp.prevenus('a_moderer:c9700000-0000-0000-0000-000000000001'),
  'Ada,Fio,Gus',
  'attente — administratrice et formateurs sont prévenus, aucun élève'
);

select is(
  pg_temp.lu('Ada', 'a_moderer:c9700000-0000-0000-0000-000000000001'),
  'Message à modérer — Ana Apprenante a écrit sous la leçon « Leçon des échanges » : son message attend une décision.',
  'attente — l''équipe lit le nom complet de l''auteure, jamais son message'
);

select is(
  (select count(*)::int from public.courriels c
     join public.notifications n using (id_notification)
    where n.cle_evenement = 'a_moderer:c9700000-0000-0000-0000-000000000001'
      and n.id_profil::text like '97000000-%'),
  3,
  'attente — chacune de ces notifications a son e-mail'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LA PUBLICATION — l'auteure l'apprend, pas celle qui décide
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('97000000-0000-0000-0000-0000000000f3',
    $$select public.moderer_commentaire('c9700000-0000-0000-0000-000000000001', 'approuver')$$),
  null::text,
  'publication — Fio publie le message d''Ana'
);

select is(
  pg_temp.prevenus('publication:c9700000-0000-0000-0000-000000000001'),
  'Ana',
  'publication — seule Ana est prévenue'
);

select is(
  pg_temp.lu('Ana', 'publication:c9700000-0000-0000-0000-000000000001'),
  'Ton message est publié — L''équipe TradingCorp a publié ton message sous la leçon « Leçon des échanges » : les autres élèves peuvent le lire.',
  'publication — l''élève lit « l''équipe TradingCorp », jamais le nom de la formatrice'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LA RÉPONSE D'UNE CAMARADE — après la modération seulement
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('97000000-0000-0000-0000-0000000000b2',
    $$insert into public.commentaires (id_commentaire, id_profil, id_lecon, id_parent, contenu)
      values ('c9700000-0000-0000-0000-000000000011', '97000000-0000-0000-0000-0000000000b2',
              '19700000-0000-0000-0000-000000000001', 'c9700000-0000-0000-0000-000000000001',
              'CONFIDENTIEL réponse de Bea')$$),
  null::text,
  'réponse — Bea répond publiquement à Ana'
);

select is(
  pg_temp.prevenus('reponse_eleve:c9700000-0000-0000-0000-000000000011'),
  '(personne)',
  'réponse — tant qu''elle attend la modération, Ana n''en sait rien'
);

select is(
  pg_temp.lu('Ada', 'a_moderer:c9700000-0000-0000-0000-000000000011'),
  'Message à modérer — Bea Camarade a répondu sous la leçon « Leçon des échanges » : sa réponse attend une décision.',
  'réponse — l''équipe est prévenue d''une réponse à modérer'
);

select is(
  pg_temp.erreur_sous('97000000-0000-0000-0000-0000000000ad',
    $$select public.moderer_commentaire('c9700000-0000-0000-0000-000000000011', 'approuver')$$),
  null::text,
  'réponse — Ada la publie'
);

select is(
  pg_temp.lu('Ana', 'reponse_eleve:c9700000-0000-0000-0000-000000000011'),
  'Nouvelle réponse à ton message — Bea C. a répondu à ton message sous la leçon « Leçon des échanges ».',
  'réponse — Ana l''apprend, sous le nom public de Bea'
);

select is(
  pg_temp.prevenus('reponse_eleve:c9700000-0000-0000-0000-000000000011')
    || ' / ' || pg_temp.prevenus('publication:c9700000-0000-0000-0000-000000000011'),
  'Ana / Bea',
  'réponse — Ana pour la réponse reçue, Bea pour sa publication, personne d''autre'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- L'ÉCHANGE PRIVÉ — l'élève, et l'équipe qui y prend part
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('97000000-0000-0000-0000-0000000000f3',
    $$select public.repondre_en_equipe('c9700000-0000-0000-0000-000000000001', 'CONFIDENTIEL réponse privée de Fio', true)$$),
  null::text,
  'privé — Fio répond en privé à Ana'
);

select is(
  (select string_agg(p.prenom || ' : ' || (c.id_courriel is not null)::text, ',')
     from public.notifications n
     join public.profils p on p.id_profil = n.id_profil
     left join public.courriels c using (id_notification)
    where n.cle_evenement like 'reponse_equipe:%'
      and n.id_profil::text like '97000000-%'),
  'Ana : true',
  'privé — la notification qui existait reste la même, et part désormais aussi par e-mail'
);

select is(
  pg_temp.erreur_sous('97000000-0000-0000-0000-0000000000a1',
    $$select public.repondre_en_prive('c9700000-0000-0000-0000-000000000001', 'CONFIDENTIEL précision d''Ana')$$),
  null::text,
  'privé — Ana poursuit l''échange'
);

select is(
  pg_temp.prevenus('message_prive:%'),
  'Ada,Fio',
  'privé — l''administratrice et la formatrice de l''échange ; ni Gus, ni Bea'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LA VISIBILITÉ — chaque passage prévient l'élève concernée
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  pg_temp.erreur_sous('97000000-0000-0000-0000-0000000000f3',
    $$select public.moderer_commentaire('c9700000-0000-0000-0000-000000000001', 'rendre_prive')$$),
  null::text,
  'visibilité — Fio rend le fil d''Ana privé'
);

select is(
  pg_temp.prevenus('visibilite:c9700000-0000-0000-0000-000000000001:%'),
  'Ana',
  'visibilité — Ana est prévenue ; Bea, qui avait répondu, ne l''est pas'
);

select is(
  pg_temp.erreur_sous('97000000-0000-0000-0000-0000000000ad',
    $$select public.moderer_commentaire('c9700000-0000-0000-0000-000000000001', 'rendre_public')$$),
  null::text,
  'visibilité — Ada le rend de nouveau public'
);

select is(
  (select string_agg(titre, ' / ' order by titre) from public.notifications
    where id_profil = '97000000-0000-0000-0000-0000000000a1'
      and cle_evenement like 'visibilite:c9700000-0000-0000-0000-000000000001:%'),
  'Ton message est passé en privé / Ton message est public',
  'visibilité — un retour en arrière prévient aussi'
);

select is(
  pg_temp.erreur_sous('97000000-0000-0000-0000-0000000000ad',
    format('select public.moderer_commentaire(%L, ''rendre_public'')',
      (select id_commentaire from public.commentaires
        where id_parent = 'c9700000-0000-0000-0000-000000000001' and par_equipe))),
  null::text,
  'visibilité — Ada rend publique la réponse de Fio'
);

select is(
  (select string_agg(p.prenom, ',') from public.notifications n
     join public.profils p on p.id_profil = n.id_profil
    where n.titre = 'Réponse de l''équipe rendue publique'
      and n.id_profil::text like '97000000-%'),
  'Ana',
  'visibilité — l''élève à qui l''équipe répondait en est prévenue'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- CE QUI NE PRÉVIENT PERSONNE
-- ─────────────────────────────────────────────────────────────────────────────

-- `concat` et non `||` : un seul code d'erreur suffit à faire échouer
-- l'assertion, quand `||` le noierait dans le null de l'autre.
select is(
  concat(
    pg_temp.erreur_sous('97000000-0000-0000-0000-0000000000b2',
      $$insert into public.commentaires (id_commentaire, id_profil, id_lecon, contenu)
        values ('c9700000-0000-0000-0000-000000000002', '97000000-0000-0000-0000-0000000000b2',
                '19700000-0000-0000-0000-000000000001', 'CONFIDENTIEL hors sujet de Bea')$$),
    pg_temp.erreur_sous('97000000-0000-0000-0000-0000000000ad',
      $$select public.moderer_commentaire('c9700000-0000-0000-0000-000000000002', 'rejeter')$$)
  ),
  '',
  'rejet — Bea publie, Ada rejette'
);

select is(
  (select count(*)::int from public.notifications
    where id_profil = '97000000-0000-0000-0000-0000000000b2'
      and cle_evenement like '%c9700000-0000-0000-0000-000000000002%'),
  0,
  'rejet — l''auteure n''est pas prévenue (décision du 06/10/2026)'
);

select is(
  (select count(*)::int from public.notifications
    where id_profil = '97000000-0000-0000-0000-0000000000f3'
      and split_part(cle_evenement, ':', 1) in ('publication', 'visibilite', 'reponse_eleve')),
  0,
  'acteur — Fio n''est jamais prévenue de ses propres décisions'
);

select is(
  (select count(*)::int from public.notifications n
     left join public.courriels c using (id_notification)
    where n.id_profil::text like '97000000-%'
      and (n.titre || coalesce(n.message, '') || coalesce(c.objet, '') || coalesce(c.message, ''))
          ilike '%CONFIDENTIEL%'),
  0,
  'confidentialité — aucun message n''est recopié, ni dans l''espace ni par e-mail'
);

select is(
  (select count(n.id_notification)::text || ' / ' || count(c.id_courriel)::text
     from public.notifications n
     left join public.courriels c using (id_notification)
    where n.id_profil = '97000000-0000-0000-0000-0000000000ad'
      and n.cle_evenement like 'compte_cree:%'),
  '5 / 0',
  'familles — « Nouveau compte » reste dans l''espace, sans e-mail'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LE MODE ESSAI ET LA LECTURE DE LA FILE
-- ─────────────────────────────────────────────────────────────────────────────

select is(
  array[
    public.courriel_autorise('97000000-0000-0000-0000-0000000000a1', 'essai'),
    public.courriel_autorise('97000000-0000-0000-0000-0000000000e5', 'essai'),
    public.courriel_autorise('97000000-0000-0000-0000-0000000000a1', 'actif'),
    public.courriel_autorise('97000000-0000-0000-0000-0000000000a1', null)
  ],
  array[false, true, true, false],
  'essai — seul le compte de test reçoit, tant que l''envoi n''est pas ouvert à tous'
);

select is(
  pg_temp.sous('97000000-0000-0000-0000-0000000000a1', 'select count(*)::text from public.courriels')
    || ' / '
    || (pg_temp.sous('97000000-0000-0000-0000-0000000000ad', 'select count(*)::text from public.courriels')::int > 0)::text,
  '0 / true',
  'lecture — une élève ne lit aucun e-mail de la file, l''administratrice les suit'
);

select is(
  pg_temp.erreur_sous('97000000-0000-0000-0000-0000000000a1',
    $$insert into public.courriels (id_notification, objet)
      select id_notification, 'Hameçon' from public.notifications
       where id_profil = '97000000-0000-0000-0000-0000000000a1' limit 1$$),
  '42501',
  'lecture — une élève n''écrit pas dans la file'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- L'ENVOI — réserver, échouer, réessayer, conclure
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.notifications (id_profil, titre, message, lien, cle_evenement) values
  ('97000000-0000-0000-0000-0000000000e5', 'Ton message est publié', 'Essai A', '/espace', 'publication:essai-97a'),
  ('97000000-0000-0000-0000-0000000000e5', 'Ton message est publié', 'Essai B', '/espace', 'publication:essai-97b');

create temporary table lot on commit drop as
  select * from public.reserver_courriels(50);

select is(
  (select l.destinataire || ' / ' || c.statut || ' / ' || c.tentatives
     from lot l
     join public.courriels c using (id_courriel)
     join public.notifications n using (id_notification)
    where n.cle_evenement = 'publication:essai-97a'),
  'tom-courriels@essai.local / en_cours / 1',
  'envoi — l''e-mail est réservé, avec l''adresse de son destinataire'
);

select lives_ok(
  $$select public.conclure_courriel(
      (select c.id_courriel from public.courriels c join public.notifications n using (id_notification)
        where n.cle_evenement = 'publication:essai-97a'), false)$$,
  'envoi — un refus de Brevo se consigne'
);

select is(
  (select c.statut || ' / ' || (c.prochain_essai >= now() + interval '4 minutes')::text
     from public.courriels c join public.notifications n using (id_notification)
    where n.cle_evenement = 'publication:essai-97a'),
  'a_envoyer / true',
  'envoi — le refusé repart dans la file, cinq minutes plus tard'
);

select is(
  (select count(*)::int from public.reserver_courriels(50) repris
     join public.courriels c using (id_courriel)
     join public.notifications n using (id_notification)
    where n.cle_evenement = 'publication:essai-97a'),
  0,
  'envoi — il n''est pas repris avant son heure'
);

select lives_ok(
  $$select public.conclure_courriel(
      (select c.id_courriel from public.courriels c join public.notifications n using (id_notification)
        where n.cle_evenement = 'publication:essai-97b'), true)$$,
  'envoi — un envoi réussi se consigne'
);

select is(
  (select c.statut || ' / ' || (c.envoye_le is not null)::text
     from public.courriels c join public.notifications n using (id_notification)
    where n.cle_evenement = 'publication:essai-97b'),
  'envoye / true',
  'envoi — l''e-mail parti sort de la file'
);

select * from finish();
rollback;
