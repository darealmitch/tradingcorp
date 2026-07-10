-- =============================================================================
-- TradingCorp — Nom/prénom officiels, surnom limité, correction admin
--
--   Nom et prénom = informations officielles : l'utilisateur ne peut plus les
--   modifier (privilège de colonne retiré). Seul un admin les corrige, via une
--   RPC journalisée. L'utilisateur ne garde en écriture directe que avatar_url.
--
--   Surnom (pseudo) : modifiable une fois tous les 30 jours. La règle vit dans
--   une RPC SECURITY DEFINER — impossible à contourner en modifiant le front,
--   la colonne n'étant jamais accessible en écriture directe au client.
-- =============================================================================

alter table profils add column surnom text;
alter table profils add column surnom_modifie_le timestamptz;

-- L'utilisateur ne peut plus modifier directement que son avatar.
revoke update on profils from authenticated;
grant update (avatar_url) on profils to authenticated;

-- --- Surnom : une modification par période de 30 jours -----------------------

create or replace function public.changer_surnom(p_surnom text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_surnom text := nullif(btrim(p_surnom), '');
  v_dernier timestamptz;
begin
  if v_surnom is null then
    raise exception 'Le surnom ne peut pas être vide';
  end if;
  if length(v_surnom) > 30 then
    raise exception 'Le surnom ne doit pas dépasser 30 caractères';
  end if;

  select surnom_modifie_le into v_dernier from profils where id_profil = auth.uid();
  if v_dernier is not null and v_dernier > now() - interval '30 days' then
    raise exception 'Surnom déjà modifié récemment. Prochaine modification possible le %',
      to_char(v_dernier + interval '30 days', 'DD/MM/YYYY');
  end if;

  update profils
     set surnom = v_surnom, surnom_modifie_le = now()
   where id_profil = auth.uid();
end;
$$;

-- --- Correction du nom/prénom par un administrateur --------------------------

create or replace function public.corriger_identite(p_id_profil uuid, p_prenom text, p_nom text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_prenom text := btrim(p_prenom);
  v_nom text := btrim(p_nom);
begin
  if not is_admin() then
    raise exception 'Réservé aux administrateurs';
  end if;
  if v_prenom = '' or v_nom = '' then
    raise exception 'Le nom et le prénom sont obligatoires';
  end if;

  update profils set prenom = v_prenom, nom = v_nom where id_profil = p_id_profil;

  insert into journal_admin (id_profil, action, cible, meta)
  values (
    auth.uid(),
    'correction_identite',
    (select u.email from auth.users u where u.id = p_id_profil),
    jsonb_build_object('prenom', v_prenom, 'nom', v_nom)
  );
end;
$$;
