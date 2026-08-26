-- =============================================================================
-- TradingCorp — La vérification publique d'un diplôme en dit assez, pas plus
--
-- Audit du 31/07/2026, P-18. `verifier_certificat` est exécutable sans compte —
-- c'est voulu : un employeur doit pouvoir contrôler une attestation. Trois
-- garde-fous manquaient, dont deux sont levés ici.
--
-- 1. LE NUMÉRO — réglé depuis. Il est désormais tiré au hasard (pgcrypto,
--    alphabet sans caractères ambigus) : on ne le devine pas, on le détient.
--    C'était le vrai risque d'énumération.
--
-- 2. L'IDENTITÉ COMPLÈTE. La fonction renvoyait prénom ET nom du titulaire à
--    qui présentait un numéro. Un service de vérification n'a pas à divulguer
--    une identité : celui qui contrôle une attestation l'a sous les yeux et
--    veut la CONFRONTER. Le nom est donc réduit à son initiale — « Jean D. »
--    suffit à confirmer ou infirmer, et ne constitue pas un annuaire.
--
-- 3. LE DÉBIT. Il ne peut pas se compter ici : PostgREST n'expose pas l'adresse
--    de l'appelant à la base. La fonction sort donc du chemin public, et passe
--    derrière l'Edge Function `verifier-certificat`, qui limite par IP — la
--    même mécanique que le relais CoinMarketCap. `anon` perd le droit de
--    l'appeler en direct ; l'Edge Function agit en rôle de service.
--
-- ATTENTION AU DÉPLOIEMENT : cette migration et l'Edge Function vont ensemble.
-- Appliquée seule, la page publique de vérification cesse de répondre.
-- =============================================================================

create or replace function public.verifier_certificat(p_numero text)
returns table (
  numero           text,
  titre_formation  text,
  prenom           text,
  nom              text,
  date_obtention   timestamp with time zone
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    c.numero,
    f.titre,
    p.prenom,
    -- Initiale suivie d'un point : « Dupont » devient « D. ». `left()` sur une
    -- chaîne vide rend une chaîne vide, jamais NULL — un nom absent n'affiche
    -- donc pas un point orphelin.
    nullif(left(p.nom, 1), '') || case when p.nom <> '' then '.' else '' end,
    c.date_obtention
  from certificats c
  join formations f on f.id_formation = c.id_formation
  join profils p    on p.id_profil    = c.id_profil
  where c.numero = p_numero;
$function$;

comment on function public.verifier_certificat(text) is
  'Vérification publique d''un certificat par son numéro. Ne divulgue pas l''identité complète : le nom est réduit à son initiale (P-18). Appelée par l''Edge Function verifier-certificat, qui limite le débit — anon ne l''appelle plus en direct.';

revoke execute on function public.verifier_certificat(text) from anon;
