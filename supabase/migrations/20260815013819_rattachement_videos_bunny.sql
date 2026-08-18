-- =============================================================================
-- TradingCorp — Rattachement des chapitres à leurs vidéos Bunny
--
-- Les 63 chapitres dépubliés par 20260815005432 portaient un placeholder mort
-- et aucun video_provider_id : le lien entre la base et la bibliothèque Bunny
-- 708929 avait été perdu. Il est reconstruit ici à partir de l'inventaire réel
-- de la bibliothèque (65 vidéos, toutes encodées, statut 4).
--
-- L'appariement croise DEUX critères indépendants — le numéro de chapitre lu
-- dans le titre et la durée du fichier — et il a été contrôlé avant écriture :
-- 62 chapitres appariés un pour un, aucun chapitre à deux vidéos, aucune vidéo
-- servant deux chapitres.
--
-- Deux cas traités à part :
--   - « 4.10 Adoption » : code unique côté Bunny, mais 4290 s de fichier contre
--     4230 s en base — un chiffre inversé à la saisie. Rattachée ci-dessous par
--     un update dédié, et duree_s alignée sur la durée réelle du fichier.
--   - « 5.11 Les liquidités - Partie 3 » : aucune vidéo sur Bunny (sa duree_s
--     vaut encore 3600, le forfait du seed). Reste dépubliée : il n'y a rien à
--     rattacher tant que le tournage n'a pas eu lieu.
--
-- L'URL posée est le flux HLS (playlist.m3u8) : Bunny encode cinq qualités et
-- hls.js, déjà embarqué, l'alimente à la balise <video> — la reprise, l'anti-
-- avance et le `ended` qui déverrouille PDF et quiz continuent de fonctionner.
-- Lisibilité vérifiée avant écriture sur un échantillon couvrant les 8 modules :
-- manifeste servi, qualités annoncées, segment vidéo réellement téléchargé.
-- =============================================================================

with bunny(guid, code, duree) as (values
('366a949b-cd21-4ef6-a2e0-0384d327d901','1.1',1742),('b6915daf-f67a-45ef-8b13-fa1c1afb0801','1.2',1164),
('3959f925-3b02-410e-a41f-48dc0b72b666','1.3',767),('e3713d4b-af2f-4a4e-a209-c15ce657ad75','1.4',737),
('f5a896b5-34ab-43f6-921b-ba47f93c7278','1.5',725),('09044263-9a72-480f-a710-66bf3d463a2e','2.1',3977),
('dd4fb1b3-2c20-459f-960a-a5b76c0fa522','2.2',1422),('e31298d9-e6f4-43eb-8a58-7728f1312764','2.3',2407),
('71900b2a-b7b1-4b2b-9f1f-b4f7c033107e','2.5',2560),('886e2ce2-93e6-4389-8131-ba92c6bc010e','3.1',709),
('0234a50b-9fe6-4713-a91b-ad26f9d088b5','3.2',4497),('2201a2b4-0f39-49ed-ac1d-0ae3361871a2','3.3',1422),
('df1eef7f-c3d3-4b4b-a703-f2eeb7f61e95','4.1',3669),('84ceb6e6-8b4e-4765-a153-e403a6ce82b6','4.11',1340),
('b3ab95a8-3e69-4590-90bc-f6dba4b76eb2','4.2.1',4464),('2558e2b9-e8aa-43e5-990e-b9f1881a774f','4.2.2',1920),
('73be78a3-c44a-4c54-adaf-037f18241344','4.3',1156),('3ec2270f-50b8-4c6f-8649-2bb480601bb9','4.4.1',2262),
('1447d4bc-2c10-423b-9526-8d5de0c9711f','4.4.2',3110),('8e841355-156e-48da-accb-567d4dd56179','4.5',3017),
('6436d4d4-277d-44c3-97e6-776e48f5cc14','4.6',1716),('df678614-ef24-48fc-b879-85aa77734465','4.7',1141),
('55935bff-1222-499d-9b13-3113eec878bd','4.8.1',1596),('9f2ac2b9-00d5-47cb-bd72-43b2672cd69c','4.8.2',2515),
('8631f397-5ba0-4473-bf27-4c884dba1b4c','4.8.3',2682),('fd3c6c22-7a78-4a76-ae2f-f0616d910434','4.9',1198),
('a2d6f69c-2f31-4c53-8508-2b2c2394de2d','5.1',4475),('7e5345e7-6408-4e3c-a7c7-f6d7d76d9228','5.1.2',2089),
('5d0a6ca8-fb94-4645-80c8-7dabc13d2ebd','5.1.3',1988),('ad59f852-2eb4-4646-80f2-a214a95da575','5.10',1345),
('86ada143-a5bd-4533-95ef-331e3bda64a8','5.11.1',1894),('8296d809-ce34-40fa-b2b8-f151a38d909b','5.11.2',2202),
('92ec0ca4-ab38-471c-9829-22341fa10f09','5.12',3298),('4cd3e1d5-ad61-442a-b782-44101fa320cd','5.13',4447),
('296561e8-fe0f-4045-a689-e41af7700b3b','5.2.1',1926),('fbc73053-65cf-4d87-8926-cd2aa7fd1c4c','5.2.2',3628),
('e40f1c28-640f-463c-bfa0-773e35ef7e34','5.2.3',1443),('7a970887-3bc7-43f7-8d6a-963897b499dd','5.3',3168),
('7ae248ea-138b-4179-80a3-deb54f642263','5.4.1',2008),('769da7dc-a578-4761-8ebb-3adb6a7bb9a0','5.4.2',1745),
('a6010bbd-1155-4765-8f06-8e1d63b789af','5.4.3',1920),('544c7373-e90a-4006-b5e8-7f540c33b316','5.5',3760),
('4aecb7b1-9940-44aa-b5ac-14c407cfc8c6','5.6',2581),('93dee4af-3d5e-435d-9185-51f9a41634b0','5.7',1935),
('2356b3e3-d8b8-4049-b1fa-c23059775e62','5.7.2',2800),('b53c1de8-a5f1-4fa6-84c8-968ae64c515b','5.8',2408),
('caf75a4a-405f-4837-97be-87d530a61b4a','5.9',1639),('72dc564a-0393-4568-8128-f2d7a2736a53','6.1.1',4957),
('5b843635-88e8-47f0-93c3-1815a4126e41','6.1.2',1025),('bf7af45d-0925-4640-bcbd-e03b5e2bdc11','6.2.1',2262),
('d97aaec7-a3af-4c17-afe0-90e0f30f532d','6.2.2',2933),('787fc949-d67f-489b-bc7d-8cc76aaff720','6.3',3300),
('3336f139-1308-4b1c-90f4-e6f99452f9d4','6.4',1867),('09480a48-6d9c-4742-80e1-6faf2afe85cb','6.5',2096),
('15e40b2f-0514-4159-a558-ab22e40d5308','7.1',1129),('63367ac3-e422-47e9-b70d-1d3bd69115e4','7.2',587),
('505d5368-c02f-4b0a-8692-9c577b3f1aa1','7.3',4435),('cf1b3bc1-ace8-4cb2-b5f8-fd5fd08a25f4','7.4',1052),
('d3001c09-5a8d-4f2e-9729-b7b767101bbb','7.5',799),('3365d3d7-6a5e-4be4-8752-bcc071d56689','7.6',375),
('60402222-16ac-4321-b2e6-0228e9c5779f','8.1',2030),('5c8f8545-a515-4a08-a9bf-1d11a66e79a6','8.2',3760)
),
ch as (
  select l.id_lecon, l.duree_s, split_part(l.titre, ' ', 1) as num
  from lecons l where l.type = 'video'
),
appariement as (
  select ch.id_lecon, bunny.guid
  from ch join bunny
    on (bunny.code = ch.num or bunny.code like ch.num || '.%')
   and abs(ch.duree_s - bunny.duree) <= 1
)
update lecons l
   set video_provider    = 'bunny',
       video_provider_id = a.guid,
       video_url         = 'https://vz-8e333926-6ea.b-cdn.net/' || a.guid || '/playlist.m3u8',
       est_publiee       = true
  from appariement a
 where l.id_lecon = a.id_lecon;

-- « 4.10 Adoption » : traitée à part, la durée en base étant fausse de 60 s.
update lecons
   set video_provider    = 'bunny',
       video_provider_id = '41f9777b-8ab0-4683-a9f9-7175decb9177',
       video_url         = 'https://vz-8e333926-6ea.b-cdn.net/41f9777b-8ab0-4683-a9f9-7175decb9177/playlist.m3u8',
       duree_s           = 4290,
       est_publiee       = true
 where titre = '4.10 Adoption' and type = 'video';
