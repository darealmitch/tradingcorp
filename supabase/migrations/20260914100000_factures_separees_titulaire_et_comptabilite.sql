-- =============================================================================
-- Les factures se lisent par deux chemins distincts : le sien, ou la comptabilité.
--
-- CE QUI N'ALLAIT PAS. `factures_select_titulaire` (20260913140000) disait
--
--   using (id_profil = auth.uid() or (select is_formateur_ou_admin()))
--
-- et l'écran « Mes factures » lisait la table sans filtre, la RLS étant censée
-- s'en charger. Pour un apprenant, elle s'en chargeait. Pour un membre du
-- staff, la même page rendait TOUTES les factures du site sous un titre qui
-- annonçait les siennes — un écran qui ment sur ce qu'il montre.
--
-- CE QUI CHANGE, en deux gestes indissociables.
--
-- 1. La policy se resserre à l'ADMINISTRATEUR. Une facture est une pièce
--    comptable, pas un élément pédagogique : un formateur n'a aucun motif de
--    lire le nom et l'adresse électronique des acheteurs. C'est exactement le
--    régime de `paiements_select_self_ou_admin` (20260825120000), dont les
--    factures sont la contrepartie documentaire — les deux tables disent
--    désormais la même chose sur qui voit quoi.
--
-- 2. Le périmètre de colonnes s'ouvre à ce qu'une facture porte d'identifiant.
--    `id_profil` d'abord : SANS LUI, « Mes factures » NE PEUT PAS SE FILTRER.
--    Un `where id_profil = auth.uid()` réclame le privilège SELECT sur cette
--    colonne — une colonne citée dans une clause WHERE est une colonne lue,
--    même si elle ne sort jamais du résultat. Le filtre explicite est ce qui
--    rend le titre de l'écran vrai pour tout le monde, y compris pour un
--    administrateur qui aurait acheté la formation.
--
-- POURQUOI OUVRIR `client_nom`, `client_email` ET `mode_test` EST SANS DANGER.
-- Un privilège de colonne se donne par RÔLE, pas par personne : impossible de
-- servir ces champs à l'administrateur seul, `authenticated` couvrant tout le
-- monde. Ce n'est pas un renoncement — la RLS filtre les LIGNES en amont, et
-- les seules lignes qu'un apprenant obtient sont les siennes. Il y lira donc
-- son propre nom et sa propre adresse. `paiements` expose `email` selon ce même
-- raisonnement depuis l'origine.
--
-- `chemin_storage` reste hors du périmètre, et c'est le seul champ qui compte
-- vraiment : le PDF s'obtient par URL signée via `generer-facture`, jamais en
-- devinant un chemin de stockage.
-- =============================================================================

-- 1. Qui voit quelles lignes -------------------------------------------------
drop policy if exists "factures_select_titulaire" on public.factures;
create policy "factures_select_titulaire" on public.factures for select
  to authenticated
  using (id_profil = (select auth.uid()) or (select is_admin()));

comment on policy "factures_select_titulaire" on public.factures is
  'Ses propres factures, ou toutes pour un administrateur. Le formateur en est '
  'écarté : une facture est une pièce comptable. Même régime que paiements.';

-- 2. Quelles colonnes sortent ------------------------------------------------
--
-- Liste rendue EXCLUSIVE, comme sur `lecons` (20260912103000) : une colonne
-- ajoutée plus tard à `factures` ne sera pas lisible tant qu'elle n'est pas
-- inscrite ici. Le défaut penche vers le silence plutôt que vers la fuite.
revoke select on public.factures from authenticated, anon;

grant select (
  id_facture,
  numero,
  designation,
  montant_centimes,
  devise,
  date_emission,
  -- Ajoutées ici : le filtre de l'écran « Mes factures » pour la première,
  -- l'identification du client et la distinction des ventes d'essai dans
  -- l'écran de facturation pour les autres.
  id_profil,
  client_nom,
  client_email,
  mode_test
) on public.factures to authenticated;

-- `id_paiement` et `chemin_storage` restent volontairement hors de la liste :
-- le premier n'a d'usage que pour le rapprochement interne, le second est
-- l'adresse du fichier.
