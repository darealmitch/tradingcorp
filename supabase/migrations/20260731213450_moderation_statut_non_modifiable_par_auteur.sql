-- =============================================================================
-- TradingCorp — Le statut d'un avis ou d'un commentaire n'appartient pas à son
-- auteur (audit de pré-production du 31/07/2026, P-03)
--
-- Les policies d'origine filtraient bien la ligne de DÉPART (USING : statut =
-- 'en_attente') mais leur WITH CHECK ne contraignait que la propriété de la
-- ligne. Or USING filtre AVANT modification et WITH CHECK valide APRÈS : rien
-- n'empêchait donc l'auteur de faire passer sa propre contribution en
-- 'approuve' — valeur autorisée par la contrainte de statut — et de contourner
-- entièrement la file de modération. La note moyenne publique de la formation,
-- calculée sur les avis approuvés, en devenait manipulable.
--
-- Piège classique de la RLS : WITH CHECK hérite silencieusement de USING quand
-- il est omis, mais dès qu'il est écrit il le REMPLACE au lieu de le compléter.
-- Il avait ici été écrit plus permissif que USING.
--
-- WITH CHECK reprend désormais l'invariant complet : l'auteur peut corriger le
-- texte ou la note tant que sa contribution est en attente, jamais en changer
-- le statut. La transition de statut reste le monopole des policies de
-- modération réservées au staff (avis_moderation_staff,
-- commentaires_moderation_staff), inchangées.
-- =============================================================================

drop policy if exists avis_update_soi_en_attente on public.avis;
create policy avis_update_soi_en_attente on public.avis
  for update
  using       (id_profil = auth.uid() and statut = 'en_attente')
  with check  (id_profil = auth.uid() and statut = 'en_attente');

drop policy if exists commentaires_update_soi_en_attente on public.commentaires;
create policy commentaires_update_soi_en_attente on public.commentaires
  for update
  using       (id_profil = auth.uid() and statut = 'en_attente')
  with check  (id_profil = auth.uid() and statut = 'en_attente');
