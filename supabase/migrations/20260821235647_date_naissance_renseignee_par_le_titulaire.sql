-- =============================================================================
-- TradingCorp — Date de naissance manquante : la réclamer au titulaire
--
-- L'inscription par formulaire impose la date de naissance, et le trigger
-- majeur_si_date_connue refuse un mineur. La connexion Google ouvre une
-- seconde voie : Google ne transmet ni date de naissance ni âge (portée
-- limitée à `email profile`), le profil naît donc avec date_naissance à NULL
-- et la condition du trigger — « si date connue » — n'est jamais évaluée. Le
-- verrou des 18 ans était contourné pour ces comptes.
--
-- Plutôt que de dupliquer un contrôle, on referme la brèche au même endroit
-- que les autres écritures de profil : une RPC SECURITY DEFINER, seule voie
-- possible puisque `authenticated` n'a aucun privilège UPDATE sur profils.
--
-- Trois garde-fous portés par le SERVEUR, pas par l'écran :
--   • on n'écrit que sur SA PROPRE ligne (auth.uid()), jamais sur une autre ;
--   • on n'écrit que si la date est ENCORE NULLE — sans quoi un apprenant
--     pourrait rejouer l'appel pour se vieillir après coup, ou corriger une
--     saisie que l'admin serait seul à devoir arbitrer ;
--   • la majorité est revérifiée ici, en plus du trigger, pour que le message
--     d'erreur soit exploitable par l'interface.
-- =============================================================================

create or replace function public.definir_date_naissance(p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actuelle date;
begin
  select date_naissance into v_actuelle
  from profils where id_profil = auth.uid();

  if not found then
    raise exception 'Profil introuvable';
  end if;

  if v_actuelle is not null then
    raise exception 'La date de naissance est déjà renseignée'
      using errcode = 'check_violation';
  end if;

  if p_date is null then
    raise exception 'La date de naissance est obligatoire'
      using errcode = 'check_violation';
  end if;

  -- Bornes de plausibilité, alignées sur la contrainte profils_date_naissance_plausible.
  if p_date < date '1900-01-01' or p_date > current_date then
    raise exception 'Date de naissance invalide'
      using errcode = 'check_violation';
  end if;

  if p_date > (current_date - interval '18 years') then
    raise exception 'Tu dois avoir au moins 18 ans pour accéder à la formation.'
      using errcode = 'check_violation';
  end if;

  update profils
     set date_naissance = p_date
   where id_profil = auth.uid();
end;
$$;

comment on function public.definir_date_naissance(date) is
  'Renseigne la date de naissance de SON propre profil, une seule fois, si elle est absente. Referme le contournement du contrôle de majorité par la connexion Google, qui ne fournit pas cette information.';

-- Motif habituel du projet : PUBLIC englobe anon, donc révoquer puis accorder
-- au seul rôle légitime (cf. 20260724141508).
revoke execute on function public.definir_date_naissance(date) from public;
grant execute on function public.definir_date_naissance(date) to authenticated;
