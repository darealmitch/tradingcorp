-- =============================================================================
-- TradingCorp — Donner ou retirer l'accès à une formation, à la main
--
-- Demande du titulaire (11/10/2026) : une élève inscrite gratuitement n'avait
-- pas été rattachée à la formation à la création de son compte, et rien dans
-- l'espace ne permettait de réparer l'oubli. Les administrateurs doivent
-- pouvoir, à tout moment, ouvrir ou fermer l'accès de n'importe quel élève.
--
-- RETIRER N'EFFACE RIEN. L'inscription passe « révoquée », comme après un
-- remboursement : la progression, les tentatives de quiz et un éventuel
-- certificat restent. Rendre l'accès réactive la même inscription, avec sa
-- date et son origine (achat ou geste manuel) : l'historique reste exact.
--
-- LE PERSONNEL N'EST PAS CONCERNÉ : formateurs et administrateurs voient tout
-- le contenu par leur rôle (policies `*_select_gated`). Leur ouvrir un accès
-- ne servirait à rien.
--
-- Chaque geste est journalisé (`octroi_acces`, `retrait_acces`) avec l'état
-- d'avant. Un geste sans effet — rendre un accès déjà ouvert — n'écrit rien.
-- =============================================================================

create function public.definir_acces_formation(
  p_id_profil    uuid,
  p_id_formation uuid,
  p_actif        boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_role  text;
  v_titre text;
  v_avant text;
begin
  if not is_admin() then
    raise exception 'Réservé aux administrateurs';
  end if;

  select role into v_role from profils where id_profil = p_id_profil;
  if v_role is null then
    raise exception 'Profil introuvable';
  end if;
  if v_role <> 'apprenant' then
    raise exception 'Formateurs et administrateurs accèdent déjà à tout le contenu';
  end if;

  select titre into v_titre from formations where id_formation = p_id_formation;
  if v_titre is null then
    raise exception 'Formation introuvable';
  end if;

  -- Ligne verrouillée : deux gestes simultanés sur une même inscription se
  -- succèdent au lieu de se croiser.
  select statut into v_avant
    from inscriptions
   where id_profil = p_id_profil and id_formation = p_id_formation
     for update;

  if p_actif then
    if v_avant = 'active' then
      return;
    end if;
    insert into inscriptions (id_profil, id_formation, statut, source)
    values (p_id_profil, p_id_formation, 'active', 'manuel')
    on conflict (id_profil, id_formation) do update set statut = 'active';
  else
    if v_avant is distinct from 'active' then
      return;
    end if;
    update inscriptions
       set statut = 'revoquee'
     where id_profil = p_id_profil and id_formation = p_id_formation;
  end if;

  insert into journal_admin (id_profil, id_profil_cible, action, cible, meta)
  values (
    auth.uid(),
    p_id_profil,
    case when p_actif then 'octroi_acces' else 'retrait_acces' end,
    (select u.email from auth.users u where u.id = p_id_profil),
    jsonb_build_object(
      'id_formation', p_id_formation,
      'formation', v_titre,
      'avant', coalesce(v_avant, 'aucune')
    )
  );
end;
$$;

revoke execute on function public.definir_acces_formation(uuid, uuid, boolean) from public, anon;
grant execute on function public.definir_acces_formation(uuid, uuid, boolean) to authenticated;
