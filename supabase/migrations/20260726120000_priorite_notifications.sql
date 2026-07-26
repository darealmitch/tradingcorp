-- =============================================================================
-- TradingCorp — Deux natures de notification : à traiter vs. suivi
--
-- Tous les événements n'appellent pas la même réaction. Un achat engage un
-- client et demande une action commerciale : il doit sauter aux yeux. Une
-- création de compte ou un module terminé relèvent du suivi — on les lit en
-- volume, pas à l'unité.
--
-- `priorite` porte cette distinction, séparée de `type` qui reste la teinte
-- d'affichage (info / succes). Deux axes, deux colonnes : une notification
-- peut être « succes » sans être urgente.
--
--   urgente     : achat d'une formation                  -> à traiter
--   information : compte créé, module/formation terminés -> suivi quantitatif
--
-- Les notifications adressées aux apprenants (confirmation de paiement posée
-- par le webhook Stripe) restent en 'information' : rien à traiter pour eux.
-- =============================================================================

alter table notifications
  add column if not exists priorite text not null default 'information';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notifications_priorite_check'
  ) then
    alter table notifications add constraint notifications_priorite_check
      check (priorite in ('urgente', 'information'));
  end if;
end $$;

comment on column notifications.priorite is
  'urgente = demande une action (achat) ; information = suivi de la plateforme.';

-- Les achats déjà notifiés basculent en urgent (rejouable sans effet de bord).
update notifications set priorite = 'urgente'
where cle_evenement like 'achat:%' and priorite <> 'urgente';

-- Index partiel : le compteur « à traiter » ne balaye que les lignes utiles.
create index if not exists idx_notifications_urgentes_non_lues
  on notifications (id_profil)
  where priorite = 'urgente' and lu_le is null;

-- La signature change (5 -> 6 paramètres) : on retire l'ancienne plutôt que
-- de laisser une surcharge orpheline que plus rien n'appelle.
drop function if exists public.notifier_admins(text, text, text, text, text);

create or replace function public.notifier_admins(
  p_titre text,
  p_message text,
  p_type text,
  p_lien text,
  p_cle text,
  p_priorite text
)
returns void
language sql security definer set search_path = public
as $$
  insert into notifications (id_profil, titre, message, type, lien, cle_evenement, priorite)
  select a.id_profil, p_titre, p_message, p_type, p_lien, p_cle, p_priorite
  from profils a
  where a.role = 'admin'
  on conflict (id_profil, cle_evenement) where cle_evenement is not null do nothing;
$$;

-- anon/authenticated inclus : sans cela la fonction serait appelable en REST
-- par n'importe quel visiteur (cf. notifications_admin).
revoke execute on function public.notifier_admins(text, text, text, text, text, text)
  from public, anon, authenticated;

-- --- Report de la priorité sur les trois émetteurs ---------------------------

create or replace function public.notifier_compte_cree()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform notifier_admins(
    'Nouveau compte',
    nom_affichage(new.id_profil) || ' a créé un compte.',
    'info',
    '/espace/utilisateurs',
    'compte_cree:' || new.id_profil,
    'information'
  );
  return new;
end;
$$;

revoke execute on function public.notifier_compte_cree() from public, anon, authenticated;

create or replace function public.notifier_achat_formation()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_titre_formation text;
begin
  if new.source <> 'paiement' or not est_apprenant(new.id_profil) then
    return new;
  end if;

  select f.titre into v_titre_formation
  from formations f where f.id_formation = new.id_formation;

  perform notifier_admins(
    'Nouvel achat',
    nom_affichage(new.id_profil) || ' a acheté la formation « '
      || coalesce(v_titre_formation, 'formation supprimée') || ' ».',
    'succes',
    '/espace/paiements',
    'achat:' || new.id_inscription,
    'urgente'
  );
  return new;
end;
$$;

revoke execute on function public.notifier_achat_formation() from public, anon, authenticated;

create or replace function public.notifier_progression()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_id_section   uuid;
  v_titre_section text;
  v_id_formation uuid;
  v_titre_formation text;
  v_publiees integer;
  v_restantes integer;
  v_nom text;
begin
  -- La transition « pas terminée -> terminée » est filtrée par la clause WHEN
  -- des deux déclencheurs : ici, la leçon vient d'être validée.
  if not est_apprenant(new.id_profil) then
    return new;
  end if;

  select s.id_section, s.titre, s.id_formation
    into v_id_section, v_titre_section, v_id_formation
  from lecons l
  join sections s on s.id_section = l.id_section
  where l.id_lecon = new.id_lecon;
  if v_id_section is null then
    return new;
  end if;

  select count(*) filter (where l.est_publiee),
         count(*) filter (
           where l.est_publiee
             and not exists (
               select 1 from progression_lecons pl
               where pl.id_lecon = l.id_lecon
                 and pl.id_profil = new.id_profil
                 and pl.terminee_le is not null
             )
         )
    into v_publiees, v_restantes
  from lecons l
  where l.id_section = v_id_section;

  if v_publiees = 0 or v_restantes > 0 then
    return new;
  end if;

  v_nom := nom_affichage(new.id_profil);
  perform notifier_admins(
    'Module terminé',
    v_nom || ' a terminé le module « ' || v_titre_section || ' ».',
    'info',
    '/espace/apprenants',
    'module_termine:' || new.id_profil || ':' || v_id_section,
    'information'
  );

  select count(*) filter (where s.est_publiee),
         count(*) filter (
           where s.est_publiee
             and (
               not exists (
                 select 1 from lecons l
                 where l.id_section = s.id_section and l.est_publiee
               )
               or exists (
                 select 1 from lecons l
                 where l.id_section = s.id_section
                   and l.est_publiee
                   and not exists (
                     select 1 from progression_lecons pl
                     where pl.id_lecon = l.id_lecon
                       and pl.id_profil = new.id_profil
                       and pl.terminee_le is not null
                   )
               )
             )
         )
    into v_publiees, v_restantes
  from sections s
  where s.id_formation = v_id_formation;

  if v_publiees > 0 and v_restantes = 0 then
    select f.titre into v_titre_formation
    from formations f where f.id_formation = v_id_formation;

    perform notifier_admins(
      'Formation terminée',
      v_nom || ' a terminé la formation « ' || coalesce(v_titre_formation, 'formation') || ' ».',
      'succes',
      '/espace/apprenants',
      'formation_terminee:' || new.id_profil || ':' || v_id_formation,
      'information'
    );
  end if;

  return new;
end;
$$;

revoke execute on function public.notifier_progression() from public, anon, authenticated;
