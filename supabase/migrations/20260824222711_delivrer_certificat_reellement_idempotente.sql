-- =============================================================================
-- TradingCorp — delivrer_certificat rend enfin le certificat qui existe déjà
--
-- La fonction annonçait dans son propre commentaire une opération idempotente :
-- « L'unicité (id_profil, id_formation) rend l'opération idempotente ». Elle ne
-- l'était pas. L'insertion se terminait par
--
--     on conflict (id_profil, id_formation) do nothing
--     returning id_certificat into v_id_certificat;
--
-- et DO NOTHING ne renvoie AUCUNE ligne quand le certificat existe déjà : la
-- fonction rendait donc NULL, valeur qui signifie « pas de droit au certificat »
-- pour tous ses appelants.
--
-- Découvert en recette de bout en bout : le premier appel délivrait bien le
-- certificat, le second répondait null. L'Edge Function generer-certificat, qui
-- lit ce null comme un refus, aurait répondu « termine la formation » à un
-- diplômé venant retélécharger son propre diplôme — une fois le premier
-- téléchargement fait, le document devenait inaccessible.
--
-- Correction : on cherche d'abord le certificat existant et on le rend. Rien
-- d'autre ne change — mêmes conditions, même tirage de numéro, même boucle
-- anti-collision.
-- =============================================================================

create or replace function public.delivrer_certificat(p_id_profil uuid, p_id_formation uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id_certificat uuid;
  v_essai integer;
begin
  -- Premier refus, avant tout le reste : cette formation est-elle certifiante ?
  if not exists (
    select 1 from formations
    where id_formation = p_id_formation and delivre_certificat
  ) then
    return null;
  end if;

  if not exists (
    select 1 from profils
    where id_profil = p_id_profil and role = 'apprenant' and not est_test
  ) then
    return null;
  end if;

  if not exists (
    select 1 from inscriptions
    where id_profil = p_id_profil and id_formation = p_id_formation and statut = 'active'
  ) then
    return null;
  end if;

  if not formation_achevee(p_id_profil, p_id_formation) then
    return null;
  end if;

  -- Un certificat déjà délivré se rend tel quel. C'est ce que « idempotent »
  -- veut dire : rappeler la fonction ne crée pas un second document, mais ne
  -- doit pas non plus faire disparaître le premier.
  select id_certificat into v_id_certificat
  from certificats
  where id_profil = p_id_profil and id_formation = p_id_formation;
  if v_id_certificat is not null then
    return v_id_certificat;
  end if;

  -- La boucle ne couvre que la collision de NUMÉRO, dont la probabilité est
  -- infime mais non nulle ; sans elle, un tirage malheureux ferait échouer la
  -- validation de l'étape, qui n'y est pour rien.
  for v_essai in 1..5 loop
    begin
      insert into certificats (id_profil, id_formation, numero)
      values (p_id_profil, p_id_formation, numero_certificat())
      on conflict (id_profil, id_formation) do nothing
      returning id_certificat into v_id_certificat;

      -- Deux validations simultanées depuis deux onglets : l'autre a gagné la
      -- course, son certificat fait foi.
      if v_id_certificat is null then
        select id_certificat into v_id_certificat
        from certificats
        where id_profil = p_id_profil and id_formation = p_id_formation;
      end if;
      return v_id_certificat;
    exception when unique_violation then
      -- numéro déjà pris : on retire au sort
    end;
  end loop;

  raise exception 'Impossible de générer un numéro de certificat unique';
end;
$$;

comment on function public.delivrer_certificat(uuid, uuid) is
  'Délivre le certificat d''une formation achevée, ou rend celui déjà délivré. Rend null quand les conditions ne sont pas réunies. Réservée au cursus certifiant, aux apprenants non-test disposant d''une inscription active.';
