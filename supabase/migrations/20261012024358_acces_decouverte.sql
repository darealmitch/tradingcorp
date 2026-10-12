-- =============================================================================
-- TradingCorp — Accès découverte : quelques leçons offertes à tout compte
--
-- Demande du titulaire (12/10/2026), issue du plan de croissance : à 997 €,
-- presque personne n'achète au premier clic. Un compte créé sans achat doit
-- pouvoir suivre quelques leçons choisies, pour juger la formation sur pièce.
--
-- LES ADMINISTRATEURS CHOISISSENT LES LEÇONS. Une case `est_decouverte` par
-- leçon, cochée par `definir_lecon_decouverte` — réservée aux administrateurs
-- et journalisée : offrir du contenu payant est une décision commerciale.
-- Vidéos et articles seulement ; un quiz demande une inscription
-- (`quiz_select_gated`, `corriger-quiz`), il ne s'offre pas.
--
-- UNE SEULE RÈGLE, DANS `lecon_debloquee`. Tout ce qui ouvre une leçon y passe
-- déjà : la lecture de `lecons` (policy), le contenu (`lecon_contenu`), la
-- vidéo signée (`video-signee` lit `lecons` sous l'identité de l'appelant),
-- les ressources, la validation (`terminer_lecon`) et les états du parcours.
-- Rien n'est recopié ailleurs.
--
-- QUI EN PROFITE : un compte connecté sans inscription active. L'élève
-- inscrit garde l'ordre imposé des étapes — une leçon offerte ne lui sert pas
-- de raccourci. L'introduction d'un module qui contient une leçon offerte
-- s'ouvre aussi : c'est par elle qu'on entre dans le module.
--
-- INERTE TANT QUE RIEN N'EST COCHÉ : la colonne vaut `false` partout, et
-- chaque branche ajoutée exige au moins une leçon cochée.
-- =============================================================================

alter table public.lecons
  add column est_decouverte boolean not null default false;

alter table public.lecons
  add constraint lecons_decouverte_hors_quiz
  check (not est_decouverte or type in ('video', 'article'));

grant select (est_decouverte) on public.lecons to authenticated;

-- `authenticated` détient UPDATE sur toute la table (la RLS le réserve au
-- personnel) : un privilège de colonne ne suffit donc pas à fermer la case aux
-- formateurs. Le garde vit dans un trigger, valable quel que soit le chemin
-- d'écriture. Les rôles de service (auth.uid() nul) restent libres.
create function public.garder_decouverte_aux_admins()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if (tg_op = 'INSERT' and new.est_decouverte
      or tg_op = 'UPDATE' and new.est_decouverte is distinct from old.est_decouverte)
     and auth.uid() is not null
     and not is_admin() then
    raise exception 'Seul un administrateur choisit les leçons offertes';
  end if;
  return new;
end;
$$;

create trigger trg_lecons_decouverte_admin
  before insert or update of est_decouverte on public.lecons
  for each row execute function public.garder_decouverte_aux_admins();

comment on column public.lecons.est_decouverte is
  'Leçon offerte aux comptes sans inscription (accès découverte). Se règle par definir_lecon_decouverte.';

-- ─────────────────────────────────────────────────────────────────────────────
-- La règle : cette leçon est-elle ouverte à l'appelant au titre de la découverte ?
-- ─────────────────────────────────────────────────────────────────────────────

create function public.lecon_en_decouverte(p_id_lecon uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select auth.uid() is not null
    and not is_formateur_ou_admin()
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

revoke execute on function public.lecon_en_decouverte(uuid) from public, anon;
grant execute on function public.lecon_en_decouverte(uuid) to authenticated, service_role;

-- Même corps qu'avant, plus la branche découverte.
create or replace function public.lecon_debloquee(p_id_lecon uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    is_formateur_ou_admin()
    or acces_demo()
    or lecon_en_decouverte(p_id_lecon)
    or (
      exists (
        select 1 from lecons l
        join sections s on s.id_section = l.id_section
        where l.id_lecon = p_id_lecon and a_inscription_active(s.id_formation)
      )
      and not exists (
        select 1
        from lecons l
        join lecons prev
          on prev.id_section = l.id_section
          and prev.est_publiee
          and prev.position < l.position
        left join progression_lecons pl
          on pl.id_lecon = prev.id_lecon
          and pl.id_profil = auth.uid()
          and pl.terminee_le is not null
        where l.id_lecon = p_id_lecon
          and pl.id_progression_lecon is null
      )
    );
$$;

-- La lecture de la ligne : l'ancienne condition, ou une leçon offerte.
alter policy lecons_select_gated on public.lecons
  using (
    (select is_formateur_ou_admin())
    or (
      est_publiee
      and exists (
        select 1 from sections s
        where s.id_section = lecons.id_section and a_inscription_active(s.id_formation)
      )
      and lecon_debloquee(id_lecon)
    )
    or (est_publiee and lecon_en_decouverte(id_lecon))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Les états du parcours disent ce qui est offert
-- ─────────────────────────────────────────────────────────────────────────────

-- Nouvelle colonne `offerte` : le type de retour change, il faut recréer.
drop function public.etats_lecons(uuid);

create function public.etats_lecons(p_id_section uuid)
returns table (
  id_lecon      uuid,
  titre         text,
  type          text,
  "position"    integer,
  duree_s       integer,
  a_pdf         boolean,
  video_termine boolean,
  etat          text,
  offerte       boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    l.id_lecon,
    l.titre,
    l.type,
    l.position,
    l.duree_s,
    (l.pdf_public_id is not null),
    (pl.video_terminee_le is not null),
    case
      when not lecon_debloquee(l.id_lecon) then 'verrouille'
      when pl.terminee_le is not null then 'termine'
      when pl.video_terminee_le is not null then 'en_cours'
      else 'debloque'
    end,
    -- Ouverte à cet appelant au seul titre de la découverte : c'est ce qui
    -- dit à l'écran d'afficher « Offerte » et l'invitation à débloquer.
    lecon_en_decouverte(l.id_lecon)
  from lecons l
  left join progression_lecons pl
    on pl.id_lecon = l.id_lecon and pl.id_profil = auth.uid()
  where l.id_section = p_id_section
    and (l.est_publiee or is_formateur_ou_admin())
  order by l.position;
$$;

revoke execute on function public.etats_lecons(uuid) from public, anon;
grant execute on function public.etats_lecons(uuid) to authenticated, service_role;

-- Nouvelle colonne `lecons_offertes`, et un module qui contient une leçon
-- offerte s'ouvre au compte sans inscription.
drop function public.etats_modules(uuid);

create function public.etats_modules(p_id_formation uuid)
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

revoke execute on function public.etats_modules(uuid) from public, anon;
grant execute on function public.etats_modules(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Le réglage : un administrateur coche ou décoche une leçon
-- ─────────────────────────────────────────────────────────────────────────────

create function public.definir_lecon_decouverte(p_id_lecon uuid, p_actif boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lecon  lecons%rowtype;
  v_module text;
begin
  if not is_admin() then
    raise exception 'Réservé aux administrateurs';
  end if;

  select * into v_lecon from lecons where id_lecon = p_id_lecon for update;
  if not found then
    raise exception 'Leçon introuvable';
  end if;
  if p_actif and v_lecon.type not in ('video', 'article') then
    raise exception 'Seules les vidéos et les articles peuvent être offerts';
  end if;
  if v_lecon.est_decouverte = p_actif then
    return;
  end if;

  update lecons set est_decouverte = p_actif where id_lecon = p_id_lecon;

  select titre into v_module from sections where id_section = v_lecon.id_section;

  insert into journal_admin (id_profil, action, cible, meta)
  values (
    auth.uid(),
    case when p_actif then 'decouverte_ajoutee' else 'decouverte_retiree' end,
    v_lecon.titre,
    jsonb_build_object('id_lecon', p_id_lecon, 'lecon', v_lecon.titre, 'module', v_module)
  );
end;
$$;

revoke execute on function public.definir_lecon_decouverte(uuid, boolean) from public, anon;
grant execute on function public.definir_lecon_decouverte(uuid, boolean) to authenticated;
