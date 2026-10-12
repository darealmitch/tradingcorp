-- =============================================================================
-- TradingCorp — Le bouton de l'e-mail d'essai mène au site d'où l'essai part
--
-- Constaté le 12/10/2026 au soir, pendant l'essai sur Yannick : le bouton
-- « Commencer mon essai » menait à tradingcorp.fr, l'adresse unique de tous
-- les e-mails (SITE_URL). Or l'essai se recettait sur dev.tradingcorp.fr, et
-- la production n'avait pas encore les écrans de l'essai : le bouton ouvrait
-- l'ancien tableau de bord. « Caduc », a-t-il écrit.
--
-- Désormais, l'e-mail d'un essai accordé mène au site d'où l'administrateur
-- l'a accordé : celui que son navigateur annonce dans la requête (`Origin`, à
-- défaut `Referer`), que PostgREST expose dans `request.headers`. Pour un
-- essai sur dev, dev ; en production, tradingcorp.fr. Une annonce programmée,
-- partie de la CI sans navigateur, garde l'adresse par défaut.
--
-- La base n'en retient que la forme — https, un nom d'hôte, rien d'autre. La
-- fonction d'envoi ne s'en sert que si le site figure dans la liste blanche
-- de `_partages/cors.ts` : un e-mail signé TradingCorp ne mène jamais
-- ailleurs. Les autres familles d'e-mails ne changent pas.
-- =============================================================================

alter table public.courriels add column site text;

comment on column public.courriels.site is
  'Site où mènent les liens de cet e-mail (origine https), quand l''action est partie d''un site connu ; nul = adresse par défaut (SITE_URL).';

-- Le site que le navigateur annonce : `Origin`, à défaut l'origine du
-- `Referer`. Nul hors d'une requête HTTP (SQL direct, CI) ou si la valeur n'a
-- pas la forme d'une origine https.
create function public.site_de_la_requete()
returns text
language sql
stable
set search_path to 'public'
as $$
  select case when v ~ '^https://[a-z0-9.-]+(:[0-9]{1,5})?$' then v end
    from (
      select coalesce(
               e.h ->> 'origin',
               substring(e.h ->> 'referer' from '^(https://[^/]+)')
             ) as v
        from (select nullif(current_setting('request.headers', true), '')::json as h) e
    ) s;
$$;

revoke execute on function public.site_de_la_requete() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- L'annonce retient le site de son e-mail
-- ─────────────────────────────────────────────────────────────────────────────

-- Un paramètre de plus : l'ancienne signature disparaît, sans quoi un appel à
-- un seul argument hésiterait entre les deux.
drop function public.annoncer_essai(uuid);

create function public.annoncer_essai(p_id_profil uuid, p_site text default null)
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
    'essai_accorde',
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

revoke execute on function public.annoncer_essai(uuid, text) from public, anon, authenticated;

-- Même corps qu'avant ; l'annonce immédiate emporte le site de la requête, et
-- le journal le note.
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

  insert into essais (id_profil, accorde_par, annonce_le)
  values (p_id_profil, auth.uid(), case when p_programmer then null else now() end)
  on conflict (id_profil) do nothing;
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
      'site', v_site
    )
  );

  return case when p_programmer then 'programme' else 'annonce' end;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- La file d'envoi rend le site avec l'e-mail
-- ─────────────────────────────────────────────────────────────────────────────

-- Une colonne de plus en sortie : la fonction est recréée, ses droits reposés.
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
  jeton        text,
  site         text
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
    returning c.id_courriel, c.id_notification, c.objet, c.message, c.lien, c.site
  )
  select r.id_courriel, r.objet, r.message, r.lien, u.email::text, p.prenom,
         split_part(n.cle_evenement, ':', 1),
         case
           when split_part(n.cle_evenement, ':', 1) = 'decouverte_annonce'
             then p.jeton_nouveautes::text
         end,
         r.site
    from reserves r
    join notifications n on n.id_notification = r.id_notification
    join profils p on p.id_profil = n.id_profil
    join auth.users u on u.id = p.id_profil;
end;
$$;

revoke execute on function public.reserver_courriels(integer) from public, anon, authenticated;
grant execute on function public.reserver_courriels(integer) to service_role;
