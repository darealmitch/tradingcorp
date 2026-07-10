-- =============================================================================
-- TradingCorp — Le changement de rôle alimente la piste d'audit journal_admin
-- (la table existait sans producteur ; l'e-mail de la cible est résolu ici,
-- la fonction SECURITY DEFINER étant la seule à pouvoir lire auth.users).
-- =============================================================================

create or replace function public.changer_role(p_id_profil uuid, p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Réservé aux administrateurs';
  end if;
  if p_role not in ('apprenant', 'formateur', 'admin') then
    raise exception 'Rôle invalide : %', p_role;
  end if;
  if p_id_profil = auth.uid() then
    -- Garde-fou anti-verrouillage : impossible de rétrograder son propre
    -- compte (et donc le dernier admin) par mégarde.
    raise exception 'Impossible de modifier son propre rôle';
  end if;

  update profils set role = p_role where id_profil = p_id_profil;

  insert into journal_admin (id_profil, action, cible, meta)
  values (
    auth.uid(),
    'changement_role',
    (select u.email from auth.users u where u.id = p_id_profil),
    jsonb_build_object('id_profil', p_id_profil, 'nouveau_role', p_role)
  );
end;
$$;
