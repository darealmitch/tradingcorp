-- =============================================================================
-- TradingCorp — Le privilège le plus étendu laisse enfin une trace
--
-- Audit du 31/07/2026, P-19. `definir_compte_test` était la seule des trois
-- fonctions d'administration de profil à n'écrire nulle part — `changer_role`
-- et `corriger_identite` journalisent toutes deux.
--
-- Or `est_test` n'est pas un drapeau d'affichage : via `acces_demo()`, il fait
-- répondre vrai à `a_inscription_active()` pour TOUTES les formations et à
-- `lecon_debloquee()` pour TOUTES les leçons. C'est l'accès intégral au
-- catalogue payant, accordé d'un appel, sans qu'aucun registre n'en garde
-- mémoire. Le retrait du drapeau est journalisé au même titre que son octroi :
-- ce qui compte, c'est de pouvoir reconstituer qui a eu cet accès et quand.
-- =============================================================================

create or replace function public.definir_compte_test(p_id_profil uuid, p_est_test boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ancien boolean;
begin
  if not is_admin() then
    raise exception 'Réservé aux administrateurs';
  end if;

  select est_test into v_ancien from profils where id_profil = p_id_profil;
  if v_ancien is null then
    raise exception 'Profil introuvable';
  end if;

  -- Sans changement réel, rien à écrire : le journal doit se lire comme une
  -- suite de décisions, pas comme une trace d'appels.
  if v_ancien = p_est_test then
    return;
  end if;

  update profils set est_test = p_est_test where id_profil = p_id_profil;

  insert into journal_admin (id_profil, action, cible, meta)
  values (
    auth.uid(),
    case when p_est_test then 'octroi_compte_test' else 'retrait_compte_test' end,
    (select u.email from auth.users u where u.id = p_id_profil),
    jsonb_build_object('id_profil', p_id_profil, 'est_test', p_est_test)
  );
end;
$function$;

comment on function public.definir_compte_test(uuid, boolean) is
  'Accorde ou retire l''accès intégral au catalogue (acces_demo). Réservée aux administrateurs et journalisée dans journal_admin — c''est le privilège le plus étendu après le rôle admin.';
