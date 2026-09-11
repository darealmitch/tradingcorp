-- ═══════════════════════════════════════════════════════════════════════════
-- Journal d'administration : plus aucune adresse e-mail de la reprise Wix.
--
-- La reprise des anciens élèves journalisait la LISTE de leurs adresses
-- (`meta.emails`). Or la suppression d'un compte ne savait retirer une adresse
-- que des champs simples — `cible`, `auteur` — ainsi que le prénom et le nom
-- de `meta`. Une adresse rangée dans une liste y survivait : un ancien élève
-- qui supprimait son compte restait nommé dans le journal, contrairement à ce
-- que promet sa page de profil (« sans ton nom ni ton adresse, qui en sont
-- retirés immédiatement »).
--
-- Trois corrections, de la source vers les garde-fous :
--   1. les lignes existantes : les adresses deviennent des identifiants de
--      compte, comme `id_profil_cible` partout ailleurs ;
--   2. la suppression d'un compte retire aussi l'adresse des listes ;
--   3. la rétention à 12 mois efface la clé `emails` avec `prenom` et `nom`.
--
-- La fonction `migrer-eleves` écrit désormais des identifiants. Les deux
-- garde-fous servent à ce qu'une adresse ne puisse plus jamais y survivre,
-- d'où qu'elle vienne.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Les adresses déjà journalisées deviennent des identifiants.
update public.journal_admin j
   set meta = (j.meta - 'emails') || jsonb_build_object(
         'profils',
         coalesce(
           (select jsonb_agg(u.id order by u.id)
              from jsonb_array_elements_text(j.meta -> 'emails') as e(adresse)
              join auth.users u on lower(u.email) = lower(e.adresse)),
           '[]'::jsonb
         )
       )
 where jsonb_typeof(j.meta -> 'emails') = 'array';

-- 2) Suppression d'un compte : l'adresse quitte aussi les listes.
create or replace function public.anonymiser_journal_personne(
  p_id_profil uuid,
  p_email     text default null
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lignes integer;
  v_listes integer := 0;
begin
  update journal_admin
     set cible  = case
                    when id_profil_cible = p_id_profil
                      or (p_email is not null and cible = p_email)
                    then null else cible
                  end,
         auteur = case
                    when p_email is not null and auteur = p_email
                    then null else auteur
                  end,
         meta   = case
                    when id_profil_cible = p_id_profil
                      or (p_email is not null and cible = p_email)
                    then meta - 'prenom' - 'nom'
                    else meta
                  end
   where id_profil_cible = p_id_profil
      or id_profil = p_id_profil
      or (p_email is not null and (cible = p_email or auteur = p_email));

  get diagnostics v_lignes = row_count;

  -- Une adresse rangée dans une liste n'est pas dans `cible` : on la retire
  -- élément par élément, sans toucher aux autres adresses de la même ligne.
  if p_email is not null then
    update journal_admin
       set meta = jsonb_set(
             meta,
             '{emails}',
             coalesce(
               (select jsonb_agg(e)
                  from jsonb_array_elements(meta -> 'emails') e
                 where lower(e #>> '{}') <> lower(p_email)),
               '[]'::jsonb
             )
           )
     where jsonb_typeof(meta -> 'emails') = 'array'
       and exists (select 1
                     from jsonb_array_elements_text(meta -> 'emails') x
                    where lower(x) = lower(p_email));

    get diagnostics v_listes = row_count;
  end if;

  return v_lignes + v_listes;
end;
$$;

-- 3) Rétention à 12 mois : `emails` s'efface comme `prenom` et `nom`.
create or replace function public.appliquer_retention_journal(p_mois integer default 12)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lignes integer;
begin
  update journal_admin
     set cible  = null,
         auteur = null,
         meta   = meta - 'prenom' - 'nom' - 'emails'
   where date_action < now() - make_interval(months => greatest(coalesce(p_mois, 12), 1))
     and (cible is not null or auteur is not null
          or meta ? 'prenom' or meta ? 'nom' or meta ? 'emails');

  get diagnostics v_lignes = row_count;
  return v_lignes;
end;
$$;
