-- =============================================================================
-- TradingCorp — Retrait de l'aperçu gratuit
--
-- `lecons.apercu_gratuit` ouvrait une leçon publiée aux visiteurs non inscrits.
-- La notion est abandonnée : l'accès au contenu dépend désormais uniquement de
-- l'inscription active et du déblocage séquentiel.
--
-- ÉTAT AVANT RETRAIT (vérifié) : aucune des 103 leçons n'était en aperçu, et
-- une seule policy référençait la colonne — aucune fonction, aucune vue. Le
-- retrait ne retire donc l'accès à personne : il supprime une porte qui
-- n'était pas ouverte.
--
-- ORDRE IMPOSÉ : la policy est réécrite AVANT le drop, sinon Postgres refuse
-- de supprimer une colonne dont dépend une expression de sécurité.
-- =============================================================================

-- 1. La lecture d'une leçon ne connaît plus que l'inscription et le déblocage.
drop policy if exists "lecons_select_gated" on lecons;
create policy "lecons_select_gated" on lecons for select
  using (
    is_formateur_ou_admin()
    or (
      est_publiee
      and exists (
        select 1 from sections s
        where s.id_section = lecons.id_section
          and a_inscription_active(s.id_formation)
      )
      and lecon_debloquee(id_lecon)
    )
  );

-- 2. La colonne peut alors disparaître.
alter table lecons drop column if exists apercu_gratuit;
