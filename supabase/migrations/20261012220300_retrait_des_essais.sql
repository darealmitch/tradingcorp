-- =============================================================================
-- TradingCorp — Retirer un essai
--
-- Demande du titulaire (13/10/2026) : pouvoir retirer à un élève l'essai qu'on
-- lui a accordé, après confirmation, comme on le lui accorde.
--
-- JUSQU'ICI, UN RETRAIT N'AURAIT RIEN COUPÉ. L'essai n'ajoute aucun droit : les
-- leçons offertes s'ouvrent à tout compte sans achat (`lecon_en_decouverte`,
-- `etats_modules`). Un essai RETIRÉ ferme donc désormais la découverte à ce
-- compte-là, et à lui seul : les autres comptes sans achat la gardent.
--
-- CE QUE LE RETRAIT TOUCHE, ET CE QU'IL LAISSE :
--   • il ferme les leçons offertes, et l'introduction de leur module ;
--   • il laisse tout le reste : l'accès complet (achat, ou « Donner l'accès »),
--     le compte de test, la progression déjà faite ;
--   • l'e-mail d'annonce pas encore parti ne part plus. Prévenu de l'ouverture,
--     l'élève lit la fin dans son espace — sans e-mail ;
--   • une annonce programmée tombe, et l'annonce des leçons offertes à tous les
--     comptes sans achat l'épargne.
--
-- RÉACCORDER RESTE POSSIBLE : l'essai retiré reprend, et l'élève est prévenu à
-- nouveau. Chaque octroi a sa propre notification (`essai_accorde:<date>`).
-- =============================================================================

alter table public.essais
  add column retire_le  timestamptz,
  add column retire_par uuid references public.profils (id_profil) on delete set null;

comment on column public.essais.retire_le is
  'Date du retrait de l''essai ; nulle tant qu''il est en cours. Un essai retiré ferme les leçons offertes à ce compte.';

-- Vrai si ce compte a vu son essai retiré.
create function public.essai_retire(p_id_profil uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from essais e
     where e.id_profil = p_id_profil
       and e.retire_le is not null
  );
$$;

revoke execute on function public.essai_retire(uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Les deux règles de la découverte apprennent le retrait
-- ─────────────────────────────────────────────────────────────────────────────

-- Même corps qu'avant, plus une condition. Tout ce qui ouvre une leçon y passe
-- (`lecon_debloquee`, la policy de `lecons`, la vidéo signée, les ressources,
-- `etats_lecons`) : le retrait ferme tout d'un coup.
create or replace function public.lecon_en_decouverte(p_id_lecon uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select auth.uid() is not null
    and not is_formateur_ou_admin()
    -- Un essai retiré ferme la découverte à ce compte-là.
    and not essai_retire(auth.uid())
    and exists (
      select 1
      from lecons l
      join sections s   on s.id_section   = l.id_section
      join formations f on f.id_formation = s.id_formation
      where l.id_lecon = p_id_lecon
        and l.est_publiee
        and s.est_publiee
        and f.est_publiee
        and not a_inscription_active(s.id_formation)
        and (
          l.est_decouverte
          or (
            l.type = 'intro'
            and exists (
              select 1 from lecons d
              where d.id_section = l.id_section
                and d.est_decouverte
                and d.est_publiee
            )
          )
        )
    );
$$;

-- Même corps qu'avant : seule `decouverte_possible` change. Sans elle, le
-- parcours d'un compte à l'essai retiré afficherait encore « N leçons
-- offertes » sur des leçons fermées.
create or replace function public.etats_modules(p_id_formation uuid)
returns table (
  id_section       uuid,
  titre            text,
  description      text,
  accroche         text,
  introduction     text,
  objectifs        text[],
  "position"       integer,
  total_lecons     integer,
  lecons_terminees integer,
  etat             text,
  lecons_offertes  integer
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with acces as (
    select
      (is_formateur_ou_admin() or a_inscription_active(p_id_formation)) as complet,
      (
        auth.uid() is not null
        and not essai_retire(auth.uid())
        and exists (
          select 1 from formations f
          where f.id_formation = p_id_formation and f.est_publiee
        )
      ) as decouverte_possible
  ),
  base as (
    select
      s.id_section,
      s.titre,
      s.description,
      s.accroche,
      s.introduction,
      s.objectifs,
      s.position as ordre,
      s.est_publiee as section_publiee,
      count(distinct l.id_lecon) as total,
      count(distinct pl.id_progression_lecon)
        filter (where pl.terminee_le is not null) as faites,
      count(distinct l.id_lecon) filter (where l.est_decouverte) as decouvertes
    from sections s
    left join lecons l
      on l.id_section = s.id_section and l.est_publiee
    left join progression_lecons pl
      on pl.id_lecon = l.id_lecon and pl.id_profil = auth.uid()
    where s.id_formation = p_id_formation
      and (s.est_publiee or is_formateur_ou_admin())
    group by s.id_section, s.titre, s.description, s.accroche, s.introduction,
             s.objectifs, s.position, s.est_publiee
  ),
  flags as (
    select base.*,
      (base.total > 0 and base.faites >= base.total) as est_termine,
      (base.faites > 0) as est_entame,
      case
        when not acces.complet and acces.decouverte_possible and base.section_publiee
          then base.decouvertes
        else 0
      end as offertes
    from base cross join acces
  ),
  seq as (
    select flags.*,
      coalesce(
        sum(case when not flags.est_termine then 1 else 0 end)
          over (order by flags.ordre rows between unbounded preceding and 1 preceding),
        0
      ) as predecesseurs_incomplets
    from flags
  )
  select
    seq.id_section,
    seq.titre,
    seq.description,
    seq.accroche,
    seq.introduction,
    seq.objectifs,
    seq.ordre,
    seq.total::integer,
    seq.faites::integer,
    case
      when not (select complet from acces) then
        case
          when seq.offertes = 0 then 'verrouille'
          when seq.est_entame then 'en_cours'
          else 'debloque'
        end
      when seq.est_termine then 'termine'
      when seq.est_entame then 'en_cours'
      when is_formateur_ou_admin() or acces_demo() or seq.predecesseurs_incomplets = 0 then 'debloque'
      else 'verrouille'
    end as etat,
    seq.offertes::integer
  from seq
  order by seq.ordre;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Accorder, annoncer : un essai retiré peut reprendre
-- ─────────────────────────────────────────────────────────────────────────────

-- Même corps qu'avant ; seule la clé change. Elle porte la date de l'octroi :
-- chaque octroi a sa notification, et un même octroi n'en a jamais deux.
create or replace function public.annoncer_essai(p_id_profil uuid, p_site text default null)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  -- Guillemets à espaces insécables : ni « ni » ne finissent seuls une ligne,
  -- dans l'e-mail comme dans la cloche.
  v_ouvre        constant text := '«' || chr(160);
  v_ferme        constant text := chr(160) || '»';
  v_formation    uuid;
  v_titre        text;
  v_lecons       text[];
  v_nombre       integer;
  v_liste        text;
  v_accorde_le   timestamptz;
  v_notification uuid;
begin
  -- La formation en vitrine, celle que le parcours montre à un non-inscrit.
  select f.id_formation, f.titre into v_formation, v_titre
    from formations f
   where f.est_publiee
   order by f.prix_centimes
   limit 1;

  select array_agg(l.titre order by s.position, l.position)
    into v_lecons
    from lecons l
    join sections s on s.id_section = l.id_section
   where s.id_formation = v_formation
     and l.est_decouverte
     and l.est_publiee
     and s.est_publiee;

  v_nombre := coalesce(array_length(v_lecons, 1), 0);
  if v_nombre = 0 then
    return false;
  end if;

  v_liste := case
    when v_nombre = 1 then v_ouvre || v_lecons[1] || v_ferme
    when v_nombre <= 5 then
      v_ouvre || array_to_string(v_lecons[1:v_nombre - 1], v_ferme || ', ' || v_ouvre)
      || v_ferme || ' et ' || v_ouvre || v_lecons[v_nombre] || v_ferme
    else
      v_ouvre || array_to_string(v_lecons[1:3], v_ferme || ', ' || v_ouvre) || v_ferme
      || ' et ' || (v_nombre - 3) || ' autres'
  end;

  select e.accorde_le into v_accorde_le from essais e where e.id_profil = p_id_profil;

  insert into notifications (id_profil, titre, message, type, lien, cle_evenement, priorite)
  values (
    p_id_profil,
    'Ton accès d''essai à TradingCorp est ouvert',
    case
      when v_nombre = 1 then 'Tu peux suivre gratuitement une leçon de '
      else 'Tu peux suivre gratuitement ' || v_nombre || ' leçons de '
    end || v_ouvre || v_titre || v_ferme || chr(160) || ': ' || v_liste || '.',
    'info',
    '/espace',
    'essai_accorde:' || to_char(coalesce(v_accorde_le, now()), 'YYYYMMDDHH24MISSUS'),
    'information'
  )
  on conflict (id_profil, cle_evenement) where cle_evenement is not null do nothing
  returning id_notification into v_notification;

  if v_notification is null then
    return false;
  end if;

  -- L'e-mail vient d'entrer dans la file (`doubler_par_courriel`). La fonction
  -- d'envoi ne le lira qu'une fois la transaction validée : site compris.
  if p_site is not null then
    update courriels set site = p_site where id_notification = v_notification;
  end if;

  return true;
end;
$$;

-- Même corps qu'avant, sauf l'enregistrement : un essai retiré reprend au lieu
-- d'être refusé, et le journal dit que c'est une reprise.
create or replace function public.accorder_essai(p_id_profil uuid, p_programmer boolean default false)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_role      text;
  v_test      boolean;
  v_formation uuid;
  v_titre     text;
  v_offertes  integer;
  v_reprise   boolean;
  v_site      text := case when not p_programmer then site_de_la_requete() end;
begin
  if not is_admin() then
    raise exception 'Réservé aux administrateurs';
  end if;

  -- Ligne verrouillée : un passage en compte de test simultané attend son tour.
  select role, est_test into v_role, v_test
    from profils
   where id_profil = p_id_profil
     for update;
  if v_role is null then
    raise exception 'Profil introuvable';
  end if;
  if v_role <> 'apprenant' then
    raise exception 'Formateurs et administrateurs accèdent déjà à tout le contenu';
  end if;
  if v_test then
    raise exception 'Un compte de test voit déjà tout le contenu : décoche « Test » avant d''accorder un essai';
  end if;

  select f.id_formation, f.titre into v_formation, v_titre
    from formations f
   where f.est_publiee
   order by f.prix_centimes
   limit 1;
  if v_formation is null then
    raise exception 'Aucune formation n''est publiée';
  end if;

  if exists (
    select 1 from inscriptions i
     where i.id_profil = p_id_profil
       and i.id_formation = v_formation
       and i.statut = 'active'
  ) then
    raise exception 'Cet élève a déjà l''accès complet : un essai ne lui apporterait rien';
  end if;

  select count(*) into v_offertes
    from lecons l
    join sections s on s.id_section = l.id_section
   where s.id_formation = v_formation
     and l.est_decouverte
     and l.est_publiee
     and s.est_publiee;
  if v_offertes = 0 then
    raise exception 'Aucune leçon n''est offerte : coche-en d''abord dans Contenus';
  end if;

  v_reprise := essai_retire(p_id_profil);

  -- Un essai en cours refuse un second octroi ; un essai retiré reprend.
  -- `clock_timestamp()` et non `now()`, figé pour toute la transaction : la
  -- date de l'octroi fait la clé de son annonce, et deux octrois ne doivent
  -- jamais la partager.
  insert into essais (id_profil, accorde_par, accorde_le, annonce_le)
  values (p_id_profil, auth.uid(), clock_timestamp(),
          case when p_programmer then null else clock_timestamp() end)
  on conflict (id_profil) do update
     set accorde_par = excluded.accorde_par,
         accorde_le  = excluded.accorde_le,
         annonce_le  = excluded.annonce_le,
         retire_le   = null,
         retire_par  = null
   where essais.retire_le is not null;
  if not found then
    raise exception 'Un essai a déjà été accordé à cet élève';
  end if;

  if not p_programmer then
    perform annoncer_essai(p_id_profil, v_site);
  end if;

  insert into journal_admin (id_profil, id_profil_cible, action, cible, meta)
  values (
    auth.uid(),
    p_id_profil,
    'octroi_essai',
    (select u.email from auth.users u where u.id = p_id_profil),
    jsonb_build_object(
      'id_formation', v_formation,
      'formation', v_titre,
      'lecons_offertes', v_offertes,
      'annonce', case when p_programmer then 'a_la_mise_en_production' else 'immediate' end,
      'site', v_site,
      'reprise', v_reprise
    )
  );

  return case when p_programmer then 'programme' else 'annonce' end;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Le retrait
-- ─────────────────────────────────────────────────────────────────────────────

create function public.retirer_essai(p_id_profil uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_accorde_le timestamptz;
  v_annonce_le timestamptz;
begin
  if not is_admin() then
    raise exception 'Réservé aux administrateurs';
  end if;

  -- Ligne verrouillée : un octroi simultané attend son tour.
  select e.accorde_le, e.annonce_le into v_accorde_le, v_annonce_le
    from essais e
   where e.id_profil = p_id_profil
     and e.retire_le is null
     for update;
  if not found then
    raise exception 'Aucun essai en cours pour cet élève';
  end if;

  update essais
     set retire_le = clock_timestamp(), retire_par = auth.uid()
   where id_profil = p_id_profil;

  -- L'annonce pas encore partie ne part plus : elle dirait le contraire.
  update courriels c
     set statut = 'ecarte'
    from notifications n
   where n.id_notification = c.id_notification
     and n.id_profil = p_id_profil
     and split_part(n.cle_evenement, ':', 1) = 'essai_accorde'
     and c.statut = 'a_envoyer';

  -- Prévenu de l'ouverture, l'élève lit la fin au même endroit : dans son
  -- espace. Pas d'e-mail — `doubler_par_courriel` ignore cette famille.
  if v_annonce_le is not null then
    insert into notifications (id_profil, titre, message, type, lien, cle_evenement, priorite)
    values (
      p_id_profil,
      'Ton accès d''essai a pris fin',
      'Les leçons offertes ne sont plus ouvertes à ton compte. Ta progression est conservée.',
      'info',
      '/espace',
      'essai_retire:' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS'),
      'information'
    )
    on conflict (id_profil, cle_evenement) where cle_evenement is not null do nothing;
  end if;

  insert into journal_admin (id_profil, id_profil_cible, action, cible, meta)
  values (
    auth.uid(),
    p_id_profil,
    'retrait_essai',
    (select u.email from auth.users u where u.id = p_id_profil),
    jsonb_build_object(
      'accorde_le', v_accorde_le,
      'annonce', case when v_annonce_le is null then 'programmee' else 'envoyee' end
    )
  );
end;
$$;

revoke execute on function public.retirer_essai(uuid) from public, anon;
grant execute on function public.retirer_essai(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Les annonces épargnent un essai retiré
-- ─────────────────────────────────────────────────────────────────────────────

-- Même corps qu'avant ; un essai programmé puis retiré ne part plus, et reste
-- en base pour l'historique.
create or replace function public.annoncer_essais_programmes()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_formation uuid;
  v_profil    uuid;
  v_annonces  integer := 0;
begin
  select f.id_formation into v_formation
    from formations f
   where f.est_publiee
   order by f.prix_centimes
   limit 1;

  -- Ce qui a changé depuis la programmation — un achat, un passage en compte
  -- de test ou dans l'équipe — rend l'e-mail faux : l'annonce tombe. L'octroi
  -- reste au journal.
  delete from essais e
   using profils p
   where e.annonce_le is null
     and e.retire_le is null
     and p.id_profil = e.id_profil
     and (p.role <> 'apprenant'
          or p.est_test
          or exists (
            select 1 from inscriptions i
             where i.id_profil = e.id_profil
               and i.id_formation = v_formation
               and i.statut = 'active'
          ));

  -- Plus aucune leçon offerte : rien à annoncer, les essais attendent la
  -- mise en production suivante.
  if not exists (
    select 1
      from lecons l
      join sections s on s.id_section = l.id_section
     where s.id_formation = v_formation
       and l.est_decouverte
       and l.est_publiee
       and s.est_publiee
  ) then
    return 0;
  end if;

  for v_profil in
    select e.id_profil from essais e
     where e.annonce_le is null
       and e.retire_le is null
       for update skip locked
  loop
    perform annoncer_essai(v_profil);
    update essais set annonce_le = now() where id_profil = v_profil;
    v_annonces := v_annonces + 1;
  end loop;

  return v_annonces;
end;
$$;

-- Même corps qu'avant ; les cibles excluent un compte dont l'essai a été
-- retiré : lui annoncer des leçons qu'il ne peut plus ouvrir le tromperait.
create or replace function public.annoncer_lecons_offertes(p_essai boolean default false)
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
                  and not essai_retire(p.id_profil)
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
