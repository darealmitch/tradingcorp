-- =============================================================================
-- TradingCorp — Accorder un essai à un élève, et le lui écrire
--
-- Demande du titulaire (12/10/2026) : un élève à qui l'on voulait offrir un
-- ESSAI a reçu par erreur l'accès COMPLET, retiré quinze secondes plus tard.
-- Rien ne permettait de faire le bon geste, ni de prévenir l'élève de ce
-- qu'il a. Il faut distinguer les deux, et lui écrire qu'il bénéficie d'un
-- essai : ce que l'essai comprend, et ce qu'il ne comprend pas.
--
-- TROIS CHOSES DIFFÉRENTES, QU'ON NE CONFOND PLUS :
--   • l'accès complet — une inscription active (achat, ou « Donner l'accès ») :
--     toute la formation, quiz, échanges et certificat compris ;
--   • l'essai — AUCUNE inscription : seules les leçons cochées « Offerte », et
--     l'introduction de leur module, s'ouvrent (`lecon_en_decouverte`), comme
--     à tout compte sans achat ;
--   • le compte de test (`est_test`) — un outil interne, qui ouvre TOUT
--     (`acces_demo`). Ce n'est pas un essai.
--
-- ACCORDER UN ESSAI N'OUVRE DONC AUCUN DROIT DE PLUS. Le geste refuse le compte
-- qui a l'accès complet ou qui est de test, à qui l'e-mail mentirait ; puis il
-- enregistre l'essai (`essais`), le journalise (`octroi_essai`) et prévient
-- l'élève : une notification `essai_accorde`, doublée d'un e-mail.
--
-- CET E-MAIL PART MÊME QUAND LES E-MAILS SONT EN MODE ESSAI. Ce mode
-- (`courriels_mode`) retient les e-mails AUTOMATIQUES — échanges, découverte —
-- tant que le titulaire n'a pas donné son feu vert. Celui-ci n'a rien
-- d'automatique : un administrateur désigne une personne, et confirme. Les
-- élèves ne peuvent pas écrire de notification (aucune policy d'insertion) :
-- seule `annoncer_essai` en pose une de cette famille.
--
-- L'ANNONCE PEUT ATTENDRE LA MISE EN PRODUCTION. Un essai « programmé »
-- (`annonce_le` nul) n'écrit rien chez l'élève, ni notification ni e-mail.
-- `annoncer_essais_programmes()`, appelée par la CI une fois le site et les
-- fonctions publiés, le prévient alors : quand le site qu'il ouvrira est
-- celui que l'e-mail décrit.
-- =============================================================================

create table public.essais (
  id_profil   uuid        primary key references public.profils (id_profil) on delete cascade,
  accorde_par uuid        references public.profils (id_profil) on delete set null,
  accorde_le  timestamptz not null default now(),
  annonce_le  timestamptz
);

comment on table public.essais is
  'Essais accordés par un administrateur. Aucun droit de plus que la découverte : un e-mail qui l''explique à l''élève.';
comment on column public.essais.annonce_le is
  'Date à laquelle l''élève a été prévenu ; nulle tant que l''annonce attend la mise en production.';

alter table public.essais enable row level security;

-- Lecture réservée aux administrateurs, pour l'écran Utilisateurs. Aucune
-- policy d'écriture : seules les fonctions ci-dessous y écrivent.
create policy essais_select_admin on public.essais
  for select to authenticated
  using ((select is_admin()));

revoke all on public.essais from anon, authenticated;
grant select on public.essais to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Prévenir l'élève : la notification, que `doubler_par_courriel` double
-- ─────────────────────────────────────────────────────────────────────────────

-- Le message cite les leçons offertes AU MOMENT de l'annonce : l'e-mail dit ce
-- que l'élève trouvera en cliquant. Le reste — ce que l'essai ne comprend pas,
-- et qu'il est gratuit — est le même pour tous : la fonction d'envoi l'ajoute.
create function public.annoncer_essai(p_id_profil uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  -- Guillemets à espaces insécables : ni « ni » ne finissent seuls une ligne,
  -- dans l'e-mail comme dans la cloche.
  v_ouvre     constant text := '«' || chr(160);
  v_ferme     constant text := chr(160) || '»';
  v_formation uuid;
  v_titre     text;
  v_lecons    text[];
  v_nombre    integer;
  v_liste     text;
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
  on conflict (id_profil, cle_evenement) where cle_evenement is not null do nothing;

  return found;
end;
$$;

revoke execute on function public.annoncer_essai(uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Le geste de l'administrateur
-- ─────────────────────────────────────────────────────────────────────────────

-- Rend 'annonce' si l'élève est prévenu tout de suite, 'programme' si l'annonce
-- attend la mise en production.
create function public.accorder_essai(p_id_profil uuid, p_programmer boolean default false)
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
    perform annoncer_essai(p_id_profil);
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
      'annonce', case when p_programmer then 'a_la_mise_en_production' else 'immediate' end
    )
  );

  return case when p_programmer then 'programme' else 'annonce' end;
end;
$$;

revoke execute on function public.accorder_essai(uuid, boolean) from public, anon;
grant execute on function public.accorder_essai(uuid, boolean) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- La mise en production : les annonces programmées partent
-- ─────────────────────────────────────────────────────────────────────────────

-- Appelée par la CI après la publication du site et des fonctions, sous le
-- rôle propriétaire de la base. Rend le nombre d'élèves prévenus ; rejouée,
-- elle ne prévient personne deux fois.
create function public.annoncer_essais_programmes()
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
    select e.id_profil from essais e where e.annonce_le is null for update skip locked
  loop
    perform annoncer_essai(v_profil);
    update essais set annonce_le = now() where id_profil = v_profil;
    v_annonces := v_annonces + 1;
  end loop;

  return v_annonces;
end;
$$;

revoke execute on function public.annoncer_essais_programmes() from public, anon, authenticated;
grant execute on function public.annoncer_essais_programmes() to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- La bienvenue automatique s'efface devant l'essai
-- ─────────────────────────────────────────────────────────────────────────────

-- Même corps qu'avant, plus une condition : un élève à qui un essai est
-- accordé a son propre e-mail, plus complet. Programmé, l'essai attend la mise
-- en production pour parler : la bienvenue ne le devance pas.
create or replace function public.accueillir_en_decouverte()
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

  if exists (select 1 from essais e where e.id_profil = auth.uid()) then
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

-- ─────────────────────────────────────────────────────────────────────────────
-- La file d'envoi : une famille de plus, hors du mode essai
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
         case
           -- L'essai accordé : une personne désignée par un administrateur qui
           -- confirme. Le mode essai ne retient que les envois automatiques.
           when split_part(n.cle_evenement, ':', 1) = 'essai_accorde' then 'a_envoyer'
           when courriel_autorise(n.id_profil, v_mode) then 'a_envoyer'
           else 'ecarte'
         end
    from nouvelles n
   where split_part(n.cle_evenement, ':', 1) in
         ('reponse_equipe', 'message_prive', 'a_moderer', 'publication', 'reponse_eleve',
          'visibilite', 'decouverte_accueil', 'decouverte_annonce', 'essai_accorde')
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
