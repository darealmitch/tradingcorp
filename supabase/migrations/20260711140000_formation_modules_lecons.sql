-- =============================================================================
-- TradingCorp — Structure de formation : modules, étapes, médias (Cloudinary)
--
-- ANALYSE de l'existant (init_schema) — rien à recréer, tout est déjà là :
--   • sections            = MODULES d'une formation (titre, description, ordre)
--   • lecons              = ÉTAPES / leçons d'un module (titre, ordre, durée…)
--   • ressources          = ressources complémentaires d'une leçon
--   • progression_lecons  = progression + validation (terminee_le) + reprise
--                           vidéo (position_video_s)                [déjà prêt]
--   • RLS                 = lecture inscrit/aperçu, écriture staff  [déjà prêt]
--
-- On ÉTEND ces tables (aucun doublon) pour couvrir le besoin :
--   - statut de publication (module + étape) ;
--   - description d'étape ;
--   - références des médias Cloudinary : vidéo (video_provider='cloudinary')
--     et PDF (pdf_public_id) ; ressources complémentaires -> Cloudinary.
--
-- Les fichiers (vidéos/PDF, fournis plus tard) ne sont jamais dans le code :
-- seule leur RÉFÉRENCE Cloudinary (public_id) vit en base, liée à la leçon.
-- =============================================================================

-- 1. Modules (sections) : statut de publication -------------------------------
alter table sections add column if not exists est_publiee boolean not null default false;

-- 2. Étapes (lecons) : description, publication, PDF, vidéo Cloudinary ---------
alter table lecons add column if not exists description text;
alter table lecons add column if not exists est_publiee boolean not null default false;
alter table lecons add column if not exists pdf_public_id text;

-- La vidéo peut désormais provenir de Cloudinary (nouveau défaut), en plus de
-- youtube / bunny déjà prévus.
alter table lecons alter column video_provider set default 'cloudinary';
alter table lecons drop constraint if exists lecons_video_provider_check;
alter table lecons add constraint lecons_video_provider_check
  check (video_provider in ('youtube', 'bunny', 'cloudinary'));

-- 3. Ressources complémentaires : référence Cloudinary ------------------------
alter table ressources add column if not exists cloudinary_public_id text;
-- Une ressource vient soit de Cloudinary (cloudinary_public_id), soit d'un
-- stockage tiers (chemin_storage) : ce dernier n'est donc plus obligatoire.
alter table ressources alter column chemin_storage drop not null;

-- 4. RLS : le contenu NON publié reste invisible aux non-staff ----------------
drop policy if exists "sections_select_public" on sections;
create policy "sections_select_public" on sections for select
  using (
    is_formateur_ou_admin()
    or (
      est_publiee
      and exists (
        select 1 from formations f
        where f.id_formation = sections.id_formation and f.est_publiee
      )
    )
  );

drop policy if exists "lecons_select_gated" on lecons;
create policy "lecons_select_gated" on lecons for select
  using (
    is_formateur_ou_admin()
    or (
      est_publiee
      and (
        apercu_gratuit
        or exists (
          select 1 from sections s
          where s.id_section = lecons.id_section and a_inscription_active(s.id_formation)
        )
      )
    )
  );

drop policy if exists "ressources_select_gated" on ressources;
create policy "ressources_select_gated" on ressources for select
  using (
    is_formateur_ou_admin()
    or exists (
      select 1 from lecons l
      join sections s on s.id_section = l.id_section
      where l.id_lecon = ressources.id_lecon
        and l.est_publiee
        and (l.apercu_gratuit or a_inscription_active(s.id_formation))
    )
  );
