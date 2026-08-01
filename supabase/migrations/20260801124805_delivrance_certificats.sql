-- =============================================================================
-- TradingCorp — Délivrance des certificats
--
-- Toute l'infrastructure existait depuis le schéma initial : la table, son
-- unicité (un certificat par apprenant et par formation, un numéro unique), sa
-- policy de lecture, la fonction publique de vérification, et jusqu'au
-- compteur du tableau de bord. Il ne manquait que l'écrivain — aucune ligne de
-- code n'a jamais inséré dans `certificats`, et le compteur était donc figé à
-- zéro par construction.
--
-- Le point de déclenchement, lui, existait aussi : `notifier_progression`
-- sait déjà reconnaître l'achèvement intégral d'une formation, puisqu'il émet
-- une notification à ce moment précis. La délivrance se greffe là, dans la
-- même transaction que la validation de la dernière étape : un certificat ne
-- peut donc pas exister sans la progression complète qui le justifie.
-- =============================================================================

-- 1. Critère d'achèvement -----------------------------------------------------
--
-- Extrait de `notifier_progression`, à l'identique, pour que « formation
-- terminée » veuille dire la même chose partout : une section publiée sans
-- aucune leçon publiée compte comme non terminée — un module annoncé mais vide
-- n'achève rien.
--
-- S'y ajoute l'examen final : aucun quiz n'est aujourd'hui marqué
-- `est_examen_final`, la condition est donc sans effet. Le jour où l'un le
-- sera, le critère se durcira de lui-même, sans retoucher cette fonction.
create or replace function public.formation_achevee(p_id_profil uuid, p_id_formation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- au moins une section publiée, et aucune section publiée incomplète
    exists (
      select 1 from sections s
      where s.id_formation = p_id_formation and s.est_publiee
    )
    and not exists (
      select 1 from sections s
      where s.id_formation = p_id_formation
        and s.est_publiee
        and (
          not exists (
            select 1 from lecons l where l.id_section = s.id_section and l.est_publiee
          )
          or exists (
            select 1 from lecons l
            where l.id_section = s.id_section
              and l.est_publiee
              and not exists (
                select 1 from progression_lecons pl
                where pl.id_lecon = l.id_lecon
                  and pl.id_profil = p_id_profil
                  and pl.terminee_le is not null
              )
          )
        )
    )
    -- et tout examen final de la formation a été réussi
    and not exists (
      select 1 from quiz q
      where q.id_formation = p_id_formation
        and q.est_examen_final
        and not exists (
          select 1 from tentatives_quiz t
          where t.id_quiz = q.id_quiz and t.id_profil = p_id_profil and t.reussi
        )
    );
$$;

revoke execute on function public.formation_achevee(uuid, uuid) from public;

-- 2. Numéro de certificat -----------------------------------------------------
--
-- Le numéro circule : un employeur le recopie pour vérifier le certificat sur
-- une page publique. Deux exigences en découlent — il ne doit pas se deviner
-- (donc rien de séquentiel), et il doit se lire à l'œil et se retaper sans
-- ambiguïté (donc pas de I, L, O, 0 ni 1 dans l'alphabet).
--
-- 8 caractères sur 31 symboles : de l'ordre de 8·10^11 combinaisons, hors de
-- portée d'une énumération à travers une API publique.
create or replace function public.numero_certificat()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  -- pgcrypto vit dans `extensions`, hors du search_path volontairement
  -- restreint de cette fonction : on la qualifie plutôt que d'élargir le
  -- chemin, ce qui rouvrirait la porte que `set search_path` referme.
  v_octets bytea := extensions.gen_random_bytes(8);
  v_code text := '';
begin
  for i in 1..8 loop
    v_code := v_code || substr(c_alphabet, (get_byte(v_octets, i - 1) % length(c_alphabet)) + 1, 1);
  end loop;
  return 'TC-' || to_char(now(), 'YYYY') || '-' || v_code;
end;
$$;

revoke execute on function public.numero_certificat() from public;

-- 3. Délivrance ---------------------------------------------------------------
--
-- Rend l'identifiant du certificat CRÉÉ, ou null s'il n'y avait pas lieu d'en
-- créer — parcours incomplet, ou certificat déjà délivré. Cette distinction
-- sert à l'appelant pour ne notifier qu'une fois.
--
-- Trois refus explicites :
--   • un non-apprenant : le staff traverse les contenus pour les vérifier ;
--   • un compte de démonstration : son bypass lui ouvre les étapes dans le
--     désordre, et un certificat vérifiable par un tiers ne peut pas reposer
--     là-dessus ;
--   • une inscription non active : l'accès au contenu l'exige déjà, sa
--     conclusion aussi.
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

-- 4. Greffe sur la détection d'achèvement -------------------------------------
--
-- Reprise intégrale de `notifier_progression`, avec le seul ajout du bloc de
-- délivrance dans la branche « formation terminée ».
create or replace function public.notifier_progression()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id_section      uuid;
  v_titre_section   text;
  v_id_formation    uuid;
  v_titre_formation text;
  v_publiees        integer;
  v_restantes       integer;
  v_nom             text;
  v_id_certificat   uuid;
begin
  if not est_apprenant(new.id_profil) then
    return new;
  end if;

  select s.id_section, s.titre, s.id_formation
    into v_id_section, v_titre_section, v_id_formation
  from lecons l
  join sections s on s.id_section = l.id_section
  where l.id_lecon = new.id_lecon;
  if v_id_section is null then
    return new;
  end if;

  select count(*) filter (where l.est_publiee),
         count(*) filter (
           where l.est_publiee
             and not exists (
               select 1 from progression_lecons pl
               where pl.id_lecon = l.id_lecon
                 and pl.id_profil = new.id_profil
                 and pl.terminee_le is not null
             )
         )
    into v_publiees, v_restantes
  from lecons l
  where l.id_section = v_id_section;

  if v_publiees = 0 or v_restantes > 0 then
    return new;
  end if;

  v_nom := nom_affichage(new.id_profil);
  perform notifier_admins(
    'Module terminé',
    v_nom || ' a terminé le module « ' || v_titre_section || ' ».',
    'info',
    '/espace/apprenants',
    'module_termine:' || new.id_profil || ':' || v_id_section,
    'information'
  );

  if formation_achevee(new.id_profil, v_id_formation) then
    select f.titre into v_titre_formation
    from formations f where f.id_formation = v_id_formation;

    perform notifier_admins(
      'Formation terminée',
      v_nom || ' a terminé la formation « ' || coalesce(v_titre_formation, 'formation') || ' ».',
      'succes',
      '/espace/apprenants',
      'formation_terminee:' || new.id_profil || ':' || v_id_formation,
      'information'
    );

    -- Le certificat naît ici, dans la transaction qui valide la dernière
    -- étape : il ne peut pas y avoir de certificat sans le parcours qui va
    -- avec, ni de parcours achevé sans certificat.
    v_id_certificat := delivrer_certificat(new.id_profil, v_id_formation);
    if v_id_certificat is not null then
      insert into notifications (id_profil, titre, message, type, lien, cle_evenement, priorite)
      values (
        new.id_profil,
        'Certificat obtenu',
        'Tu as terminé « ' || coalesce(v_titre_formation, 'ta formation')
          || ' ». Ton certificat est disponible dans ton espace.',
        'succes',
        '/espace/formations',
        'certificat:' || v_id_certificat,
        'urgente'
      )
      on conflict (id_profil, cle_evenement) where cle_evenement is not null do nothing;
    end if;
  end if;

  return new;
end;
$$;

-- 5. Documentation en base ----------------------------------------------------

comment on table public.certificats is
  'Certificats délivrés automatiquement par delivrer_certificat(), appelée à l''achèvement intégral d''une formation. Aucune policy d''écriture n''est ouverte au client : la seule voie est cette fonction SECURITY DEFINER.';

comment on function public.delivrer_certificat(uuid, uuid) is
  'Délivre le certificat si le parcours est achevé, l''inscription active et le compte un apprenant réel (hors comptes de démonstration). Idempotente. Rend l''identifiant du certificat créé, ou null s''il n''y avait pas lieu d''en créer.';

comment on function public.formation_achevee(uuid, uuid) is
  'Toutes les sections publiées de la formation sont complètes (une section publiée sans leçon publiée compte comme incomplète) et tout examen final a été réussi.';
