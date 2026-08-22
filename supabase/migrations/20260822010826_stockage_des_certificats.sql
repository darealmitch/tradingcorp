-- =============================================================================
-- TradingCorp — Espace de stockage des certificats générés
--
-- La colonne certificats.chemin_storage attendait depuis le schéma initial le
-- fichier qu'elle devait désigner ; il n'existait pas. Ce bucket l'accueille.
--
-- PRIVÉ, et sans aucune policy de lecture pour les rôles de l'API. Un
-- certificat porte le nom, le prénom et la date de naissance de son titulaire :
-- un bucket public laisserait n'importe qui parcourir les diplômes en devinant
-- des chemins. L'accès se fait exclusivement par URL SIGNÉE, produite par
-- l'Edge Function generer-certificat pour le titulaire et valable dix minutes.
--
-- L'écriture est réservée au service_role, qui n'est pas soumis à la RLS : le
-- fichier ne peut naître que de la génération serveur, jamais d'un téléversement
-- client. Un apprenant ne peut donc pas déposer un faux diplôme à son nom.
--
-- Le type MIME et la taille sont bornés côté serveur : ce bucket ne reçoit que
-- des PDF, et rien qui dépasse 5 Mo — un diplôme composé nativement en pèse
-- environ six kilo-octets.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificats', 'certificats', false, 5 * 1024 * 1024, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
