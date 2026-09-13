-- =============================================================================
-- Le lien partenaire XTB est retiré : le contrat est caduc.
--
-- La ressource était déjà désactivée (`est_active = false`), donc invisible aux
-- apprenants : la RLS `ressources_select_gated` écarte les ressources
-- inactives. Cette suppression ne change donc rien à ce qu'ils voient — elle
-- retire une adresse qui n'a plus lieu d'être annoncée comme partenariat, et
-- qu'un futur passage en revue des contenus aurait pu réactiver par erreur.
--
-- Capital.com est CONSERVÉ : c'est un courtier distinct, dont le partenariat
-- n'est pas concerné.
--
-- Le type de ressource `partenaire` reste en place : c'est une capacité du
-- schéma, pas une donnée. Un nouveau partenariat se rattache sans migration.
-- =============================================================================

delete from public.ressources
where id_ressource = '28967bea-e8c9-413d-bb77-82559cf55f46';
