-- Commentaires : l'équipe ne décide plus que par moderer_commentaire.
--
-- Deuxième temps du lot du 05/10/2026 (« élargir puis resserrer »). Tant que
-- l'ancien écran de modération était en production, il changeait le statut par
-- un UPDATE direct : la migration 20261005083456 lui avait laissé ce droit. Le
-- nouvel écran est en ligne depuis le 05/10/2026 et passe par
-- `moderer_commentaire` ; le droit direct ne servirait plus qu'à contourner les
-- règles de cette fonction — approuver une réponse de l'équipe, publier un
-- message écrit en privé.
--
--   • la policy de modification perd sa branche « équipe » et retrouve son nom
--     d'origine, celui que contrôle le test P-03 du socle de sécurité ;
--   • `statut` n'est plus modifiable par l'API : il ne reste que `contenu`, que
--     l'auteur corrige tant que son message attend la modération.
--
-- Les fonctions de l'équipe (moderer_commentaire, repondre_en_equipe,
-- supprimer_commentaire) appartiennent au propriétaire de la table : ni la
-- policy ni le droit de colonne ne les concernent.

drop policy if exists commentaires_update_staff_ou_auteur_en_attente on public.commentaires;
drop policy if exists commentaires_update_soi_en_attente on public.commentaires;

-- USING et WITH CHECK identiques (P-03) : l'auteur ne peut pas faire sortir son
-- message de l'état où il a le droit d'y toucher.
create policy commentaires_update_soi_en_attente on public.commentaires
  for update to authenticated
  using (
    id_profil = (select auth.uid())
    and statut = 'en_attente'
    and not par_equipe
    and not est_prive
  )
  with check (
    id_profil = (select auth.uid())
    and statut = 'en_attente'
    and not par_equipe
    and not est_prive
  );

revoke update (statut) on public.commentaires from authenticated;
