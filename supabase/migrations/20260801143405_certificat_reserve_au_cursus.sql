-- =============================================================================
-- TradingCorp — Le certificat est celui du cursus, pas de chaque référence
--
-- La délivrance introduite par 20260801124805 se déclenchait à l'achèvement de
-- N'IMPORTE QUELLE formation. C'est une généralisation abusive : le certificat
-- TradingCorp atteste d'un cursus complet — 8 modules, 103 étapes — et n'a pas
-- vocation à tomber automatiquement au bout d'un futur atelier de deux heures
-- ou d'une masterclass gratuite.
--
-- Le droit au certificat devient donc une propriété explicite de la formation,
-- et son défaut est NON certifiant : ajouter une formation au catalogue ne
-- crée aucun certificat tant que personne ne l'a décidé. C'est le sens qu'on
-- veut — un oubli produit une absence de certificat, jamais un certificat de
-- trop.
-- =============================================================================

alter table public.formations
  add column if not exists delivre_certificat boolean not null default false;

comment on column public.formations.delivre_certificat is
  'La formation donne droit à un certificat à son achèvement intégral. Faux par défaut : le certificat atteste d''un cursus, pas de la traversée d''un contenu quelconque.';

-- Le cursus complet, seul certifiant à ce jour.
update public.formations set delivre_certificat = true where slug = 'trader-pro';

create or replace function public.delivrer_certificat(p_id_profil uuid, p_id_formation uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id_certificat uuid;
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

  -- L'unicité (id_profil, id_formation) rend l'opération idempotente : revalider
  -- la dernière étape, ou deux validations simultanées depuis deux onglets, ne
  -- produisent pas un second certificat.
  --
  -- La boucle ne couvre que la collision de NUMÉRO, dont la probabilité est
  -- infime mais non nulle ; sans elle, un tirage malheureux ferait échouer la
  -- validation de l'étape, qui n'y est pour rien.
  for v_essai in 1..5 loop
    begin
      insert into certificats (id_profil, id_formation, numero)
      values (p_id_profil, p_id_formation, numero_certificat())
      on conflict (id_profil, id_formation) do nothing
      returning id_certificat into v_id_certificat;
      return v_id_certificat;
    exception when unique_violation then
      -- numéro déjà pris : on retire au sort
    end;
  end loop;

  raise exception 'Impossible de générer un numéro de certificat unique';
end;
$$;

revoke execute on function public.delivrer_certificat(uuid, uuid) from public;

comment on function public.delivrer_certificat(uuid, uuid) is
  'Délivre le certificat si la formation est certifiante (formations.delivre_certificat), le parcours achevé, l''inscription active et le compte un apprenant réel (hors comptes de démonstration). Idempotente. Rend l''identifiant du certificat créé, ou null s''il n''y avait pas lieu d''en créer.';
