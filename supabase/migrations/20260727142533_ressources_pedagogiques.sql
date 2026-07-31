-- =============================================================================
-- TradingCorp — Ressources pédagogiques : typage, sources et administration
--
-- ANALYSE DE L'EXISTANT. Tout le socle est déjà là et reste en place :
--   • table `ressources` (id_lecon, nom, type_mime, cloudinary_public_id,
--     chemin_storage, taille) — créée au schéma initial, étendue Cloudinary ;
--   • policy `ressources_select_gated` — une ressource n'est lisible que si sa
--     leçon est déverrouillée (même verrou séquentiel que le reste) ;
--   • `contenu.service.ts` charge déjà la table en même temps que la leçon ;
--   • `MediaService` gère l'upload signé et les URLs de livraison Cloudinary.
--
-- CE QUI MANQUAIT. La table ne savait décrire QUE des fichiers : un lien vers
-- TradingView, un bloc de documentation ou un exemple de code n'avaient pas de
-- place, et rien ne permettait de désactiver une ressource sans la supprimer.
-- On ÉTEND donc la table (aucune table parallèle) :
--
--   type        nature pédagogique, qui commande l'affichage
--   url         source externe (lien partenaire, vidéo Bunny, fichier distant)
--   contenu     texte embarqué des types 'documentation' et 'code'
--   langage     étiquette du bloc de code (bash, python…)
--   est_active  retrait sans suppression — les partenariats vont et viennent
--   position    ordre d'affichage dans la leçon
--
-- TROIS SOURCES POSSIBLES, exclusives par nature mais jamais toutes requises :
--   cloudinary_public_id  documents, audio, images    (Cloudinary)
--   url                   vidéos Bunny, liens externes, partenaires
--   contenu               documentation et code, écrits en base
-- La contrainte `ressources_source_coherente` garantit qu'une ressource porte
-- bien la source qu'exige son type — une ligne inexploitable est refusée à
-- l'écriture plutôt que découverte à l'affichage.
--
-- LIENS PARTENAIRES : rien n'est figé dans le code. Changer une URL, retirer
-- un partenaire ou le remplacer se fait par un UPDATE sur cette table, sans
-- redéploiement. `est_active = false` masque la ressource aux apprenants tout
-- en la gardant visible du staff (cf. policy plus bas).
-- =============================================================================

-- 1. Typage et sources ---------------------------------------------------------

alter table ressources add column if not exists type text not null default 'fichier';
alter table ressources add column if not exists url text;
alter table ressources add column if not exists description text;
alter table ressources add column if not exists contenu text;
alter table ressources add column if not exists langage text;
alter table ressources add column if not exists est_active boolean not null default true;
alter table ressources add column if not exists position integer not null default 0;

-- Un lien externe n'a pas de type MIME : la colonne ne peut plus être requise.
alter table ressources alter column type_mime drop not null;

comment on column ressources.type is
  'Nature pédagogique : commande la présentation côté client.';
comment on column ressources.url is
  'Source externe : lien partenaire, documentation, vidéo Bunny, fichier distant.';
comment on column ressources.contenu is
  'Texte embarqué des ressources ''documentation'' et ''code''.';
comment on column ressources.est_active is
  'false = masquée aux apprenants sans être supprimée (partenariat suspendu).';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ressources_type_check') then
    alter table ressources add constraint ressources_type_check check (
      type in ('pdf', 'audio', 'video', 'fichier', 'lien', 'documentation', 'code', 'partenaire')
    );
  end if;

  -- La cohérence n'est exigée que des ressources ACTIVES : une ligne inactive
  -- est un brouillon légitime — elle réserve sa place dans la leçon en
  -- attendant que le fichier soit téléversé ou que le partenariat soit signé.
  -- Ce qui est interdit, c'est qu'une ressource VISIBLE soit inexploitable.
  if not exists (select 1 from pg_constraint where conname = 'ressources_source_coherente') then
    alter table ressources add constraint ressources_source_coherente check (
      not est_active or case type
        -- Écrits en base : le texte EST la ressource.
        when 'documentation' then contenu is not null
        when 'code' then contenu is not null
        -- Purement externes : une URL, rien d'autre à héberger.
        when 'lien' then url is not null
        when 'partenaire' then url is not null
        -- Fichiers : Cloudinary en premier, URL ou chemin tiers en repli.
        else cloudinary_public_id is not null or url is not null or chemin_storage is not null
      end
    );
  end if;
end $$;

-- Ordre d'affichage stable, et lecture filtrée par leçon.
create index if not exists idx_ressources_lecon_ordre
  on ressources (id_lecon, position, date_creation);

-- Clé naturelle : deux ressources homonymes sur une même leçon n'ont pas de
-- sens, et cela donne au seed un point d'ancrage pour être rejoué (ON CONFLICT)
-- sans dupliquer ni écraser ce qui a été ajusté à la main entre-temps.
create unique index if not exists idx_ressources_lecon_nom
  on ressources (id_lecon, nom);

-- 2. RLS : une ressource désactivée disparaît côté apprenant --------------------
--    Le staff continue de la voir pour pouvoir la réactiver ou la corriger.
--    Le déblocage séquentiel de la leçon reste la condition première.

drop policy if exists "ressources_select_gated" on ressources;
create policy "ressources_select_gated" on ressources for select
  using (
    (est_active or is_formateur_ou_admin())
    and (is_formateur_ou_admin() or lecon_debloquee(id_lecon))
  );

-- 3. Écriture réservée au staff (inchangé dans l'esprit, explicité ici) --------

drop policy if exists "ressources_write_staff" on ressources;
create policy "ressources_write_staff" on ressources for all
  using (is_formateur_ou_admin()) with check (is_formateur_ou_admin());
