-- =============================================================================
-- La facturation est confiée à Stripe.
--
-- CE QUI CHANGE. Depuis 20260913140000, TradingCorp numérotait, composait et
-- conservait ses factures lui-même. Désormais, c'est Checkout qui émet la
-- facture au moment du paiement (`invoice_creation`), avec la numérotation de
-- Stripe, séquentielle à l'échelle du compte, et l'envoie par e-mail à
-- l'acheteur. La table `factures` ne produit plus rien : elle garde la trace
-- des factures de Stripe, pour que l'élève retrouve la sienne dans son espace
-- et que l'administrateur les voie toutes.
--
-- POURQUOI LA BASCULE EST PROPRE AUJOURD'HUI. Aucune facture n'a jamais été
-- émise par l'ancien système : `F2026-0001` n'a pas été consommé. Il n'existe
-- donc pas de première série à clore. Une seule vraie facture, et changer de
-- système aurait ouvert une seconde série de numéros en parallèle de la
-- première — précisément ce que l'exigence de numérotation continue interdit
-- (art. 242 nonies A, annexe II du CGI).
-- =============================================================================

-- 1. La numérotation maison disparaît -----------------------------------------
--
-- Le compteur et sa fonction n'ont plus d'appelant. Les garder, c'était laisser
-- une seconde source de numéros qu'un code futur aurait pu réveiller.
drop function if exists public.numero_facture();
drop table if exists public.compteur_factures;

-- 2. `factures` devient le reflet des factures Stripe -------------------------
--
-- Le PDF n'est plus stocké chez nous : il s'obtient auprès de Stripe, à la
-- demande, par `generer-facture`. Stocker le lien n'aurait servi à rien — ceux
-- de Stripe expirent (30 jours après l'échéance, 120 au plus). On conserve
-- l'identifiant, à partir duquel un lien frais se redemande à chaque clic.
alter table public.factures drop column if exists chemin_storage;

-- NOT NULL sans valeur par défaut : la table est vide (vérifié), et une ligne
-- sans facture Stripe derrière elle n'aurait aucun sens.
alter table public.factures add column if not exists stripe_invoice_id text not null;

comment on column public.factures.stripe_invoice_id is
  'Identifiant Stripe de la facture (in_…). Sert à redemander un lien de '
  'téléchargement frais : ceux de Stripe expirent. Hors du périmètre client.';

alter table public.factures
  drop constraint if exists factures_stripe_invoice_id_key,
  add constraint factures_stripe_invoice_id_key unique (stripe_invoice_id);

-- Le numéro n'est plus unique à lui seul : Stripe tient une séquence en mode
-- test et une autre en mode réel, sous le même préfixe. Une facture d'essai et
-- la première vraie vente peuvent donc porter le même numéro. L'unicité vaut à
-- l'intérieur de chaque série.
alter table public.factures
  drop constraint if exists factures_numero_key,
  drop constraint if exists factures_numero_mode_key,
  add constraint factures_numero_mode_key unique (numero, mode_test);

comment on table public.factures is
  'Reflet des factures émises par Stripe au paiement (Checkout, invoice_creation). '
  'Les données client sont celles de la facture ; la ligne se conserve dix ans, '
  'même après suppression du compte.';

-- 3. Privilèges : rien à ajouter ----------------------------------------------
--
-- La liste des colonnes lisibles est exclusive depuis 20260914100000 :
-- `stripe_invoice_id` n'y figure pas, et n'a pas à y figurer. Le client obtient
-- son PDF par `generer-facture`, qui établit le droit sous RLS avant de parler
-- à Stripe. La policy `factures_select_titulaire` est inchangée.

-- 4. Le bucket `factures` reste en place, vide -------------------------------
--
-- Supabase interdit de supprimer un bucket en SQL (storage.protect_delete :
-- « Use the Storage API instead »). Il est privé et vide ; il peut être retiré
-- depuis le tableau de bord (Storage), sans conséquence pour le code.
