-- =============================================================================
-- TradingCorp — Envois de l'accès découverte : bienvenue et annonces
--
-- Demande du titulaire (12/10/2026) : prévenir, dans l'espace ET par e-mail,
--   • chaque compte sans achat, une fois, des leçons qui lui sont offertes —
--     la « bienvenue », posée à sa première visite de l'espace ;
--   • tous les comptes sans achat, quand un administrateur l'annonce depuis
--     Contenus — après un essai sur les comptes de test.
--
-- LE CIRCUIT EST CELUI DES ÉCHANGES : une notification, doublée d'un e-mail par
-- `doubler_par_courriel`, sous le même mode essai/actif. Deux familles de plus :
-- `decouverte_accueil` et `decouverte_annonce`.
--
-- L'ANNONCE EST DE LA PROSPECTION : un e-mail qui promeut la formation auprès
-- de personnes qui ne l'ont pas achetée exige leur accord préalable (CPCE,
-- art. L34-5). D'où `profils.accepte_nouveautes`, jamais coché d'office :
-- recueilli à l'inscription, réglable depuis le profil, retiré d'un clic par le
-- lien de chaque e-mail (`jeton_nouveautes`). Sans accord, la notification
-- dans l'espace demeure : elle n'est pas un e-mail.
--
-- LA BIENVENUE est un message de service : elle décrit ce que contient le
-- compte qu'on vient d'ouvrir, une seule fois, sans rien proposer d'acheter.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- L'accord aux nouveautés
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profils
  add column accepte_nouveautes    boolean     not null default false,
  add column nouveautes_reglees_le timestamptz,
  add column jeton_nouveautes      uuid        not null default gen_random_uuid();

-- Le jeton désigne un compte dans le lien de désinscription : il doit être unique.
create unique index profils_jeton_nouveautes on public.profils (jeton_nouveautes);

comment on column public.profils.accepte_nouveautes is
  'Accord aux e-mails de nouveautés et d''offres (prospection, CPCE L34-5). Jamais coché d''office.';
comment on column public.profils.nouveautes_reglees_le is
  'Date du dernier choix sur les nouveautés : preuve de l''accord, ou de son retrait.';
comment on column public.profils.jeton_nouveautes is
  'Clé du lien de désinscription en un clic, glissé dans chaque e-mail d''annonce.';

-- Même corps qu'avant, plus la case « nouveautés » du formulaire : seul un
-- `true` explicite vaut accord. Les comptes créés par un administrateur et la
-- connexion Google n'en portent pas : ils partent sans accord.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_brut       text := nullif(new.raw_user_meta_data ->> 'date_naissance', '');
  v_date       date;
  v_admin      boolean := coalesce(new.raw_user_meta_data ->> 'cree_par_admin', '') = 'true';
  v_nouveautes boolean := coalesce(new.raw_user_meta_data ->> 'accepte_nouveautes', '') = 'true';
begin
  if v_brut is not null then
    begin
      v_date := v_brut::date;
    exception when others then
      raise exception 'Date de naissance invalide.';
    end;
  end if;

  if not v_admin and (v_date is null or v_date > current_date - interval '18 years') then
    raise exception 'Tu dois avoir au moins 18 ans pour t''inscrire.';
  end if;

  insert into public.profils (
    id_profil, prenom, nom, date_naissance, role, accepte_nouveautes, nouveautes_reglees_le
  )
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'prenom', ''),
      new.raw_user_meta_data ->> 'given_name',
      ''
    ),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'nom', ''),
      new.raw_user_meta_data ->> 'family_name',
      ''
    ),
    v_date,
    'apprenant',
    v_nouveautes,
    case when v_nouveautes then now() end
  );
  return new;
end;
$$;

-- Le titulaire du compte règle son accord depuis son profil.
create function public.definir_mes_nouveautes(p_accepte boolean)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update profils
     set accepte_nouveautes = p_accepte,
         nouveautes_reglees_le = now()
   where id_profil = auth.uid()
     and accepte_nouveautes is distinct from p_accepte;
$$;

revoke execute on function public.definir_mes_nouveautes(boolean) from public, anon;
grant execute on function public.definir_mes_nouveautes(boolean) to authenticated;

-- Le lien de chaque annonce : sans connexion, d'un clic. Le jeton suffit à
-- désigner le compte ; il n'en révèle rien. Rend vrai si le jeton existe — un
-- compte déjà désinscrit l'est toujours, ce n'est pas une erreur.
create function public.desinscrire_nouveautes(p_jeton uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update profils
     set accepte_nouveautes = false,
         nouveautes_reglees_le = now()
   where jeton_nouveautes = p_jeton
     and accepte_nouveautes;

  return exists (select 1 from profils where jeton_nouveautes = p_jeton);
end;
$$;

revoke execute on function public.desinscrire_nouveautes(uuid) from public;
grant execute on function public.desinscrire_nouveautes(uuid) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- La bienvenue : une fois par compte sans achat, s'il y a des leçons offertes
-- ─────────────────────────────────────────────────────────────────────────────

create function public.accueillir_en_decouverte()
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_formation uuid;
  v_offertes  integer;
begin
  if auth.uid() is null or is_formateur_ou_admin() then
    return false;
  end if;

  -- La formation en vitrine, celle que le parcours montre à un non-inscrit.
  select f.id_formation into v_formation
    from formations f
   where f.est_publiee
   order by f.prix_centimes
   limit 1;

  -- `a_inscription_active` vaut aussi pour les comptes de démonstration, qui
  -- voient tout : ni eux ni les inscrits ne sont « en découverte ».
  if v_formation is null or a_inscription_active(v_formation) then
    return false;
  end if;

  select count(*) into v_offertes
    from lecons l
    join sections s on s.id_section = l.id_section
   where s.id_formation = v_formation
     and l.est_decouverte
     and l.est_publiee
     and s.est_publiee;

  if v_offertes = 0 then
    return false;
  end if;

  insert into notifications (id_profil, titre, message, type, lien, cle_evenement, priorite)
  values (
    auth.uid(),
    'Tes leçons offertes t''attendent',
    case
      when v_offertes > 1 then
        v_offertes || ' leçons de la formation sont ouvertes à ton compte, sans engagement. '
        || 'Commence quand tu veux depuis ton parcours.'
      else
        'Une leçon de la formation est ouverte à ton compte, sans engagement. '
        || 'Commence quand tu veux depuis ton parcours.'
    end,
    'info',
    '/parcours',
    'decouverte_accueil',
    'information'
  )
  on conflict (id_profil, cle_evenement) where cle_evenement is not null do nothing;

  return found;
end;
$$;

revoke execute on function public.accueillir_en_decouverte() from public, anon;
grant execute on function public.accueillir_en_decouverte() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- L'annonce : un administrateur prévient les comptes sans achat
-- ─────────────────────────────────────────────────────────────────────────────

create function public.annoncer_lecons_offertes(p_essai boolean default false)
returns table (notifies integer, par_courriel integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_formation uuid;
  v_titres    text[];
  v_ids       text;
  v_nombre    integer;
  v_message   text;
  v_cle       text;
  v_notifies  integer;
  v_courriel  integer;
begin
  if not is_admin() then
    raise exception 'Réservé aux administrateurs';
  end if;

  select f.id_formation into v_formation
    from formations f
   where f.est_publiee
   order by f.prix_centimes
   limit 1;

  select array_agg(l.titre order by s.position, l.position),
         string_agg(l.id_lecon::text, ',' order by l.id_lecon),
         count(*)
    into v_titres, v_ids, v_nombre
    from lecons l
    join sections s on s.id_section = l.id_section
   where s.id_formation = v_formation
     and l.est_decouverte
     and l.est_publiee
     and s.est_publiee;

  if coalesce(v_nombre, 0) = 0 then
    raise exception 'Aucune leçon n''est offerte : coche-en d''abord dans le tableau.';
  end if;

  v_message := case
    when v_nombre = 1 then
      'La leçon « ' || v_titres[1] || ' » est ouverte à ton compte, sans engagement.'
    when v_nombre = 2 then
      'Les leçons « ' || v_titres[1] || ' » et « ' || v_titres[2]
      || ' » sont ouvertes à ton compte, sans engagement.'
    else
      v_nombre || ' leçons sont ouvertes à ton compte, sans engagement, dont « '
      || v_titres[1] || ' » et « ' || v_titres[2] || ' ».'
  end;

  -- Une même sélection de leçons ne s'annonce qu'une fois à chacun ; changer
  -- la sélection ouvre une nouvelle annonce. Un essai repart à chaque demande.
  v_cle := 'decouverte_annonce:' || case
    when p_essai then 'essai:' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')
    else md5(v_ids)
  end;

  with cibles as (
    select p.id_profil
      from profils p
     where case
             when p_essai then p.est_test
             else p.role = 'apprenant'
                  and not p.est_test
                  and not exists (
                    select 1 from inscriptions i
                     where i.id_profil = p.id_profil
                       and i.id_formation = v_formation
                       and i.statut = 'active'
                  )
           end
  ),
  posees as (
    insert into notifications (id_profil, titre, message, type, lien, cle_evenement, priorite)
    select c.id_profil, 'De nouvelles leçons t''attendent', v_message, 'info', '/parcours',
           v_cle, 'information'
      from cibles c
    on conflict (id_profil, cle_evenement) where cle_evenement is not null do nothing
    returning notifications.id_profil
  )
  select count(*)::integer,
         (count(*) filter (where pr.accepte_nouveautes or pr.est_test))::integer
    into v_notifies, v_courriel
    from posees po
    join profils pr on pr.id_profil = po.id_profil;

  -- Comme pour l'annonce des conditions : l'essai ne laisse pas de trace.
  if not p_essai then
    insert into journal_admin (id_profil, action, cible, meta)
    values (
      auth.uid(),
      'annonce_decouverte',
      null,
      jsonb_build_object('lecons', v_nombre, 'notifies', v_notifies, 'par_courriel', v_courriel)
    );
  end if;

  return query select v_notifies, v_courriel;
end;
$$;

revoke execute on function public.annoncer_lecons_offertes(boolean) from public, anon;
grant execute on function public.annoncer_lecons_offertes(boolean) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- La file d'envoi : deux familles de plus, et l'accord vérifié deux fois
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.doubler_par_courriel()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mode text := courriels_reglage('courriels_mode');
begin
  insert into courriels (id_notification, objet, message, lien, statut)
  select n.id_notification, n.titre, n.message, n.lien,
         case when courriel_autorise(n.id_profil, v_mode) then 'a_envoyer' else 'ecarte' end
    from nouvelles n
   where split_part(n.cle_evenement, ':', 1) in
         ('reponse_equipe', 'message_prive', 'a_moderer', 'publication', 'reponse_eleve',
          'visibilite', 'decouverte_accueil', 'decouverte_annonce')
     -- Une annonce est de la prospection : pas d'e-mail sans l'accord du
     -- destinataire. Les comptes de test la reçoivent, pour l'essai.
     and (split_part(n.cle_evenement, ':', 1) <> 'decouverte_annonce'
          or exists (
            select 1 from profils p
             where p.id_profil = n.id_profil
               and (p.accepte_nouveautes or p.est_test)
          ));
  return null;
end;
$$;

-- Deux colonnes de plus pour la fonction d'envoi : la famille, qui choisit le
-- pied de l'e-mail, et le jeton du lien de désinscription des annonces.
drop function public.reserver_courriels(integer);

create function public.reserver_courriels(p_nombre integer default 20)
returns table (
  id_courriel  uuid,
  objet        text,
  message      text,
  lien         text,
  destinataire text,
  prenom       text,
  famille      text,
  jeton        text
)
language plpgsql
security definer
set search_path to 'public'
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

  -- Accord retiré depuis la mise en file : l'annonce ne part plus.
  update courriels c
     set statut = 'ecarte'
    from notifications n
    join profils p on p.id_profil = n.id_profil
   where c.statut = 'a_envoyer'
     and n.id_notification = c.id_notification
     and split_part(n.cle_evenement, ':', 1) = 'decouverte_annonce'
     and not (p.accepte_nouveautes or p.est_test);

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
  select r.id_courriel, r.objet, r.message, r.lien, u.email::text, p.prenom,
         split_part(n.cle_evenement, ':', 1),
         case
           when split_part(n.cle_evenement, ':', 1) = 'decouverte_annonce'
             then p.jeton_nouveautes::text
         end
    from reserves r
    join notifications n on n.id_notification = r.id_notification
    join profils p on p.id_profil = n.id_profil
    join auth.users u on u.id = p.id_profil;
end;
$$;

revoke execute on function public.reserver_courriels(integer) from public, anon, authenticated;
grant execute on function public.reserver_courriels(integer) to service_role;
