-- =============================================================================
-- E-mails des échanges : chaque action sur un commentaire prévient, dans
-- l'espace ET par e-mail, les personnes qu'elle concerne — et elles seules
--
-- CE QUI EXISTAIT, ET RESTE TEL QUEL. Deux notifications de l'espace, sans
-- e-mail :
--   • la réponse de l'équipe prévient l'élève (`repondre_en_equipe`) ;
--   • la réponse privée d'un élève prévient les administrateurs
--     (`repondre_en_prive`).
-- Rien ne prévenait d'une publication, d'un passage en privé ou en public, de
-- la réponse d'un autre élève, ni d'un message en attente de modération.
--
-- QUI EST PRÉVENU, désormais :
--   • message ou réponse publique d'un élève, en attente
--                                   → administrateurs et formateurs, seuls à
--                                     pouvoir le modérer ;
--   • message publié                → son auteur ;
--   • réponse d'un élève publiée    → son auteur, et l'auteur du message
--                                     auquel elle répond ;
--   • message rendu privé ou public → son auteur ;
--   • réponse de l'équipe rendue privée ou publique
--                                   → l'élève à qui elle répond ;
--   • réponse privée d'un élève     → les administrateurs, comme avant, et
--                                     les formateurs qui ont écrit dans cet
--                                     échange — personne d'autre.
-- Jamais l'auteur de l'action lui-même. Le rejet ne prévient personne
-- (décision du 06/10/2026) : l'élève lit « non publié » sous son message.
--
-- Ces règles vivent dans la base, et non dans le navigateur : elles
-- s'appliquent quel que soit le chemin de l'action, et un client ne peut ni
-- choisir les destinataires, ni oublier de les prévenir.
--
-- QUI EST NOMMÉ. Un élève lit « l'équipe TradingCorp », jamais le nom d'un
-- membre : c'est ainsi que l'équipe signe ses réponses (article 6 des CGU).
-- Entre élèves, « Prénom I. », comme sous les messages publiés. L'équipe lit
-- le nom complet, comme dans l'écran de modération. Le CONTENU d'un message
-- n'apparaît jamais, ni dans la notification ni dans l'e-mail : un e-mail se
-- transfère, et un échange privé se lit sur la plateforme, après connexion.
--
-- L'E-MAIL double la notification, au même texte et au même lien. Il est
-- rangé dans `courriels` par la transaction même de l'action — il n'existe
-- que si l'action a eu lieu —, puis la base réveille la fonction Edge
-- `envoyer-courriels` par pg_net, dont la requête ne part qu'au COMMIT. Un
-- refus de Brevo est retenté 5, 10, 20 puis 40 minutes plus tard, et
-- abandonné à la cinquième tentative ; un passage planifié toutes les dix
-- minutes relance ce qui attend.
--
-- RÉGLAGES DU COFFRE (Vault) — jamais dans ce dépôt, qui est public. À poser
-- une fois, par le SQL editor :
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/envoyer-courriels', 'courriels_url');
--   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'courriels_cle');
--   select vault.create_secret('essai', 'courriels_mode');
-- Sans adresse ni clé, rien ne part : c'est le cas de la base éphémère de la
-- CI. En mode « essai » — le défaut —, seuls les comptes de test et le
-- propriétaire reçoivent l'e-mail ; les autres sont rangés « écartés », ce qui
-- montre ce qui serait parti avant d'ouvrir l'envoi à tous (mode « actif »).
-- =============================================================================

-- pg_net : la base appelle la fonction d'envoi. Défensif, comme pg_cron : là
-- où l'extension manque, la migration passe et les e-mails restent en file.
do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net indisponible ici (%) : les e-mails restent en file.', sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- La file des e-mails
-- -----------------------------------------------------------------------------

create table public.courriels (
  id_courriel     uuid primary key default gen_random_uuid(),
  -- L'e-mail double UNE notification et disparaît avec elle : rétention de
  -- douze mois, suppression du compte.
  id_notification uuid not null unique
                  references public.notifications (id_notification) on delete cascade,
  -- Recopiés à l'écriture : le destinataire peut modifier sa notification (il
  -- la marque lue), jamais l'e-mail que TradingCorp lui envoie.
  objet           text not null,
  message         text,
  lien            text,
  statut          text not null default 'a_envoyer',
  tentatives      smallint not null default 0,
  prochain_essai  timestamptz not null default now(),
  reserve_le      timestamptz,
  envoye_le       timestamptz,
  cree_le         timestamptz not null default now(),
  constraint courriels_statut_check
    check (statut in ('a_envoyer', 'en_cours', 'envoye', 'abandonne', 'ecarte'))
);

comment on table public.courriels is
  'E-mails qui doublent les notifications des échanges, rangés par la base au moment de l''action et envoyés par la fonction Edge envoyer-courriels. Statuts : a_envoyer ; en_cours (réservé par un envoi) ; envoye ; abandonne (cinq refus de Brevo, ou compte sans adresse) ; ecarte (mode essai : ni compte de test, ni propriétaire).';

-- Ce que chaque passage relit : ce qui attend, par échéance.
create index idx_courriels_en_file on public.courriels (prochain_essai)
  where statut in ('a_envoyer', 'en_cours');

alter table public.courriels enable row level security;

-- Lecture réservée aux administrateurs, pour suivre les envois. Aucune policy
-- d'écriture : seules la base et la fonction d'envoi, en rôle de service, y
-- écrivent.
create policy courriels_select_admin on public.courriels
  for select to authenticated
  using ((select is_admin()));

revoke all on public.courriels from anon, authenticated;
grant select on public.courriels to authenticated;

-- -----------------------------------------------------------------------------
-- Les réglages, et qui reçoit l'e-mail
-- -----------------------------------------------------------------------------

-- Un réglage du coffre, ou null s'il n'est pas posé. Limité aux trois noms de
-- cette fonctionnalité : le coffre garde d'autres secrets.
create function public.courriels_reglage(p_nom text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.decrypted_secret
    from vault.decrypted_secrets s
   where s.name = p_nom
     and p_nom in ('courriels_url', 'courriels_cle', 'courriels_mode');
$$;

-- En mode « essai » — le défaut —, seuls les comptes de test et le
-- propriétaire reçoivent l'e-mail ; en mode « actif », tout destinataire.
create function public.courriel_autorise(p_id_profil uuid, p_mode text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_mode, 'essai') = 'actif'
      or exists (
        select 1 from profils p
         where p.id_profil = p_id_profil and (p.est_test or p.est_proprietaire)
      );
$$;

-- Les familles de notifications qui partent AUSSI par e-mail : celles des
-- échanges. Les autres — compte créé, module terminé, achat — restent dans
-- l'espace ; l'annonce des conditions a son propre envoi.
--
-- Une fois par instruction : les notifications d'une même action — tous les
-- administrateurs, par exemple — entrent dans la file d'un seul coup, et ne
-- réveillent la fonction d'envoi qu'une fois.
create function public.doubler_par_courriel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text := courriels_reglage('courriels_mode');
begin
  insert into courriels (id_notification, objet, message, lien, statut)
  select n.id_notification, n.titre, n.message, n.lien,
         case when courriel_autorise(n.id_profil, v_mode) then 'a_envoyer' else 'ecarte' end
    from nouvelles n
   where split_part(n.cle_evenement, ':', 1) in
         ('reponse_equipe', 'message_prive', 'a_moderer', 'publication', 'reponse_eleve', 'visibilite');
  return null;
end;
$$;

create trigger trg_notifications_courriel
  after insert on public.notifications
  referencing new table as nouvelles
  for each statement
  execute function public.doubler_par_courriel();

-- -----------------------------------------------------------------------------
-- Le réveil de la fonction d'envoi
-- -----------------------------------------------------------------------------

-- N'échoue JAMAIS : une réponse de l'équipe ne doit pas être refusée parce que
-- la messagerie tousse — l'e-mail attendra le passage suivant.
create function public.reveiller_envoi_courriels()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := courriels_reglage('courriels_url');
  v_cle text := courriels_reglage('courriels_cle');
begin
  if v_url is null or v_cle is null then
    return;
  end if;
  -- La clé voyage dans le corps plutôt qu'en en-tête : un en-tête peut finir
  -- dans un journal d'accès, un corps n'y figure pas.
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('cle', v_cle),
    timeout_milliseconds := 30000
  );
exception when others then
  raise warning 'Envoi des e-mails non réveillé : %', sqlerrm;
end;
$$;

-- Seulement si un e-mail est à envoyer : une notification hors des échanges,
-- ou un e-mail écarté par le mode essai, ne réveille rien.
create function public.courriels_en_file()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from nouveaux where statut = 'a_envoyer') then
    perform reveiller_envoi_courriels();
  end if;
  return null;
end;
$$;

create trigger trg_courriels_reveil
  after insert on public.courriels
  referencing new table as nouveaux
  for each statement
  execute function public.courriels_en_file();

-- Le passage planifié : relance ce qui attend son nouvel essai, et ce qu'un
-- envoi interrompu a laissé réservé.
create function public.relancer_courriels()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from courriels
     where (statut = 'a_envoyer' and prochain_essai <= now())
        or (statut = 'en_cours' and reserve_le < now() - interval '15 minutes')
  ) then
    perform reveiller_envoi_courriels();
  end if;
end;
$$;

do $$
begin
  perform cron.unschedule('relance_courriels')
  where exists (select 1 from cron.job where jobname = 'relance_courriels');
  perform cron.schedule(
    'relance_courriels',
    '*/10 * * * *',
    $tache$ select public.relancer_courriels(); $tache$
  );
exception when others then
  raise notice 'pg_cron indisponible ici (%) : un e-mail en retard attendra l''envoi suivant.', sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- Ce que la fonction d'envoi appelle, en rôle de service
-- -----------------------------------------------------------------------------

-- La base s'authentifie auprès de la fonction par la clé du coffre. Comparées
-- par leur empreinte : la durée de la comparaison ne dit rien de la clé.
create function public.courriels_cle_valide(p_cle text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    extensions.digest(p_cle, 'sha256')
      = extensions.digest(courriels_reglage('courriels_cle'), 'sha256'),
    false
  );
$$;

-- Réserve un lot. `for update skip locked` : deux envois simultanés se
-- partagent la file au lieu d'envoyer deux fois le même e-mail. Un e-mail
-- resté « en cours » plus d'un quart d'heure — envoi interrompu — y revient.
create function public.reserver_courriels(p_nombre integer default 20)
returns table (
  id_courriel  uuid,
  objet        text,
  message      text,
  lien         text,
  destinataire text,
  prenom       text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  -- Hors de la file pour de bon : un compte sans adresse, ou un envoi
  -- interrompu après sa dernière tentative.
  update courriels c
     set statut = 'abandonne', reserve_le = null
   where (c.statut = 'a_envoyer'
          and not exists (
            select 1 from notifications n
              join auth.users u on u.id = n.id_profil
             where n.id_notification = c.id_notification and u.email is not null))
      or (c.statut = 'en_cours'
          and c.reserve_le < now() - interval '15 minutes'
          and c.tentatives >= 5);

  return query
  with choisis as (
    select c.id_courriel
      from courriels c
     where (c.statut = 'a_envoyer' and c.prochain_essai <= now())
        or (c.statut = 'en_cours' and c.reserve_le < now() - interval '15 minutes')
     order by c.cree_le
     limit least(greatest(coalesce(p_nombre, 20), 1), 50)
     for update skip locked
  ), reserves as (
    update courriels c
       set statut = 'en_cours', reserve_le = now(), tentatives = c.tentatives + 1
      from choisis
     where c.id_courriel = choisis.id_courriel
    returning c.id_courriel, c.id_notification, c.objet, c.message, c.lien
  )
  select r.id_courriel, r.objet, r.message, r.lien, u.email::text, p.prenom
    from reserves r
    join notifications n on n.id_notification = r.id_notification
    join profils p on p.id_profil = n.id_profil
    join auth.users u on u.id = p.id_profil;
end;
$$;

-- Le compte rendu d'un envoi. Un refus repart plus tard — 5, 10, 20 puis 40
-- minutes —, et la cinquième tentative manquée l'abandonne.
create function public.conclure_courriel(p_id_courriel uuid, p_envoye boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update courriels
     set statut = case
                    when p_envoye then 'envoye'
                    when tentatives >= 5 then 'abandonne'
                    else 'a_envoyer'
                  end,
         envoye_le = case when p_envoye then now() end,
         prochain_essai = case
                            when p_envoye then prochain_essai
                            else now() + make_interval(mins => 5 * (2 ^ (tentatives - 1))::integer)
                          end,
         reserve_le = null
   where id_courriel = p_id_courriel
     and statut = 'en_cours';
$$;

-- -----------------------------------------------------------------------------
-- Les notifications des échanges
-- -----------------------------------------------------------------------------

-- « Léa M. » : le nom sous lequel un élève apparaît aux autres élèves, comme
-- dans `noms_publics_commentaires`. L'équipe y est « L'équipe TradingCorp ».
create function public.signature_publique(p_id_profil uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when p.role in ('formateur', 'admin') then 'L''équipe TradingCorp'
           else coalesce(
             nullif(btrim(
               coalesce(p.prenom, '') || ' '
               || coalesce(nullif(left(btrim(p.nom), 1), '') || '.', '')
             ), ''),
             'Un autre élève'
           )
         end
    from profils p
   where p.id_profil = p_id_profil;
$$;

-- Sa clé rend la notification unique par personne : une action rejouée ne
-- prévient pas deux fois.
create function public.notifier_echange(
  p_id_profil uuid,
  p_titre     text,
  p_message   text,
  p_lien      text,
  p_cle       text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into notifications (id_profil, titre, message, type, lien, cle_evenement, priorite)
  values (p_id_profil, p_titre, p_message, 'info', p_lien, p_cle, 'information')
  on conflict (id_profil, cle_evenement) where cle_evenement is not null do nothing;
$$;

-- Un élève écrit : son message attend la modération. Le préviennent ceux qui
-- peuvent en décider — sauf l'auteur, s'il est de l'équipe et inscrit.
create function public.notifier_message_a_moderer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (id_profil, titre, message, type, lien, cle_evenement, priorite)
  select e.id_profil,
         'Message à modérer',
         nom_affichage(new.id_profil)
           || case when new.id_parent is null
                then ' a écrit sous la leçon « ' || l.titre || ' » : son message attend une décision.'
                else ' a répondu sous la leçon « ' || l.titre || ' » : sa réponse attend une décision.'
              end,
         'info',
         '/espace/moderation?onglet=a-moderer',
         'a_moderer:' || new.id_commentaire,
         'information'
    from profils e
    join lecons l on l.id_lecon = new.id_lecon
   where e.role in ('formateur', 'admin')
     and e.id_profil <> new.id_profil
  on conflict (id_profil, cle_evenement) where cle_evenement is not null do nothing;
  return null;
end;
$$;

create trigger trg_commentaires_a_moderer
  after insert on public.commentaires
  for each row
  when (new.statut = 'en_attente')
  execute function public.notifier_message_a_moderer();

-- Une décision de l'équipe change l'état d'un message. `auth.uid()` est celui
-- qui décide : il n'est jamais prévenu de sa propre décision.
create function public.notifier_decision_sur_commentaire()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acteur  uuid := auth.uid();
  v_lecon   text;
  v_lien    text;
  v_origine commentaires%rowtype;
begin
  select l.titre, '/parcours/' || l.id_section || '/lecon/' || l.id_lecon || '#echanges'
    into v_lecon, v_lien
    from lecons l
   where l.id_lecon = new.id_lecon;

  if new.id_parent is not null then
    select * into v_origine from commentaires where id_commentaire = new.id_parent;
  end if;

  -- Le message d'origine d'un élève passe en privé ou en public — ce qui le
  -- publie aussi, s'il attendait la modération.
  if new.id_parent is null and new.est_prive is distinct from old.est_prive then
    if new.id_profil is distinct from v_acteur then
      perform notifier_echange(
        new.id_profil,
        case when new.est_prive then 'Ton message est passé en privé' else 'Ton message est public' end,
        case when new.est_prive
          then 'L''équipe TradingCorp a rendu privé ton message sous la leçon « ' || v_lecon
               || ' » : seuls toi et l''équipe pouvez le lire, et l''échange se poursuit en privé.'
          else 'L''équipe TradingCorp a rendu public ton message sous la leçon « ' || v_lecon
               || ' » : les autres élèves peuvent le lire.'
        end,
        v_lien,
        -- Chaque passage prévient : une clé fixe tairait un retour en arrière.
        'visibilite:' || new.id_commentaire || ':' || gen_random_uuid()
      );
    end if;

  -- Une réponse de l'équipe passe en privé ou en public : l'élève à qui elle
  -- répond la lisait déjà, les autres élèves la lisent désormais — ou plus.
  elsif new.par_equipe then
    if new.est_prive is distinct from old.est_prive
       and est_apprenant(v_origine.id_profil)
       and v_origine.id_profil is distinct from v_acteur then
      perform notifier_echange(
        v_origine.id_profil,
        case when new.est_prive
          then 'Réponse de l''équipe passée en privé'
          else 'Réponse de l''équipe rendue publique'
        end,
        case when new.est_prive
          then 'L''équipe TradingCorp a rendu privée sa réponse à ton message sous la leçon « '
               || v_lecon || ' » : toi seul peux la lire.'
          else 'L''équipe TradingCorp a rendu publique sa réponse à ton message sous la leçon « '
               || v_lecon || ' » : les autres élèves peuvent la lire.'
        end,
        v_lien,
        'visibilite:' || new.id_commentaire || ':' || gen_random_uuid()
      );
    end if;

  -- Le message d'un élève est publié : son auteur l'apprend, et — pour une
  -- réponse — l'auteur du message auquel elle répond, qui peut la lire.
  elsif new.statut = 'approuve' and old.statut <> 'approuve' then
    if new.id_profil is distinct from v_acteur then
      perform notifier_echange(
        new.id_profil,
        case
          when new.id_parent is null then 'Ton message est publié'
          when v_origine.est_prive then 'Ta réponse est validée'
          else 'Ta réponse est publiée'
        end,
        case
          when new.id_parent is null
            then 'L''équipe TradingCorp a publié ton message sous la leçon « ' || v_lecon
                 || ' » : les autres élèves peuvent le lire.'
          -- Sous un message devenu privé entre-temps, la réponse n'est lue que
          -- de l'auteur du message et de l'équipe : « publiée » mentirait.
          when v_origine.est_prive
            then 'L''équipe TradingCorp a validé ta réponse sous la leçon « ' || v_lecon || ' ».'
          else 'L''équipe TradingCorp a publié ta réponse sous la leçon « ' || v_lecon
               || ' » : les autres élèves peuvent la lire.'
        end,
        v_lien,
        'publication:' || new.id_commentaire
      );
    end if;

    if new.id_parent is not null
       and v_origine.id_profil is distinct from new.id_profil
       and v_origine.id_profil is distinct from v_acteur then
      perform notifier_echange(
        v_origine.id_profil,
        'Nouvelle réponse à ton message',
        signature_publique(new.id_profil) || ' a répondu à ton message sous la leçon « '
          || v_lecon || ' ».',
        v_lien,
        'reponse_eleve:' || new.id_commentaire
      );
    end if;
  end if;

  return null;
end;
$$;

create trigger trg_commentaires_decision
  after update of statut, est_prive on public.commentaires
  for each row
  when (old.statut is distinct from new.statut or old.est_prive is distinct from new.est_prive)
  execute function public.notifier_decision_sur_commentaire();

-- -----------------------------------------------------------------------------
-- Réponse privée d'un élève : les formateurs de l'échange sont prévenus aussi
--
-- Seul change, dans `repondre_en_prive` (20261005084718), le second envoi de
-- notifications : un formateur qui a écrit dans l'échange attend la suite
-- autant qu'un administrateur. Celui qui n'y a pas pris part n'est pas
-- dérangé.
-- -----------------------------------------------------------------------------

create or replace function public.repondre_en_prive(
  p_id_commentaire uuid,
  p_contenu        text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_message   commentaires%rowtype;
  v_contenu   text := btrim(coalesce(p_contenu, ''));
  v_id        uuid;
  v_formation uuid;
  v_lecon     text;
begin
  if v_contenu = '' then
    raise exception 'Le message est vide';
  end if;
  if length(v_contenu) > 5000 then
    raise exception 'Le message dépasse 5000 caractères';
  end if;

  select * into v_message from commentaires where id_commentaire = p_id_commentaire;
  if not found then
    raise exception 'Ce message n''existe plus';
  end if;
  if v_message.id_parent is not null then
    raise exception 'On répond au message d''origine, pas à une réponse';
  end if;
  if v_message.id_profil is distinct from auth.uid() then
    raise exception 'Seul l''auteur du message peut écrire dans cet échange privé';
  end if;
  if not (v_message.est_prive or exists (
    select 1 from commentaires r
    where r.id_parent = v_message.id_commentaire and r.par_equipe and r.est_prive
  )) then
    raise exception 'Aucun échange privé n''est ouvert sur ce message';
  end if;

  select s.id_formation, l.titre into v_formation, v_lecon
  from lecons l
  join sections s on s.id_section = l.id_section
  where l.id_lecon = v_message.id_lecon;
  if not a_inscription_active(v_formation) then
    raise exception 'Ton accès à cette formation n''est plus actif';
  end if;

  insert into commentaires (id_profil, id_lecon, id_parent, contenu, statut, par_equipe, est_prive)
  values (auth.uid(), v_message.id_lecon, v_message.id_commentaire, v_contenu, 'approuve', false, true)
  returning id_commentaire into v_id;

  perform notifier_admins(
    'Message privé d''un élève',
    nom_affichage(auth.uid()) || ' a répondu en privé sous la leçon « ' || v_lecon || ' ».',
    'info',
    '/espace/moderation?onglet=prives',
    'message_prive:' || v_id,
    'information'
  );

  insert into notifications (id_profil, titre, message, type, lien, cle_evenement, priorite)
  select distinct r.id_profil,
         'Message privé d''un élève',
         nom_affichage(auth.uid()) || ' a répondu en privé sous la leçon « ' || v_lecon || ' ».',
         'info',
         '/espace/moderation?onglet=prives',
         'message_prive:' || v_id,
         'information'
    from commentaires r
    join profils e on e.id_profil = r.id_profil
   where r.id_parent = v_message.id_commentaire
     and r.par_equipe
     and e.role = 'formateur'
  on conflict (id_profil, cle_evenement) where cle_evenement is not null do nothing;

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Droits : rien de tout cela ne s'appelle depuis l'API, sauf par la fonction
-- d'envoi, en rôle de service. Le coffre n'est lu par personne d'autre que la
-- base elle-même.
-- -----------------------------------------------------------------------------

revoke execute on function public.courriels_reglage(text) from public, anon, authenticated, service_role;
revoke execute on function public.courriel_autorise(uuid, text) from public, anon, authenticated;
revoke execute on function public.doubler_par_courriel() from public, anon, authenticated;
revoke execute on function public.reveiller_envoi_courriels() from public, anon, authenticated;
revoke execute on function public.courriels_en_file() from public, anon, authenticated;
revoke execute on function public.relancer_courriels() from public, anon, authenticated;
revoke execute on function public.signature_publique(uuid) from public, anon, authenticated;
revoke execute on function public.notifier_echange(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.notifier_message_a_moderer() from public, anon, authenticated;
revoke execute on function public.notifier_decision_sur_commentaire() from public, anon, authenticated;

revoke execute on function public.courriels_cle_valide(text) from public, anon, authenticated;
revoke execute on function public.reserver_courriels(integer) from public, anon, authenticated;
revoke execute on function public.conclure_courriel(uuid, boolean) from public, anon, authenticated;
grant execute on function public.courriels_cle_valide(text) to service_role;
grant execute on function public.reserver_courriels(integer) to service_role;
grant execute on function public.conclure_courriel(uuid, boolean) to service_role;
