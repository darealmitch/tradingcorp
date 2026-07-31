-- =============================================================================
-- TradingCorp — Le blocage « mot de passe à changer » ne se lève que sur un
-- changement réel (audit de pré-production du 31/07/2026, P-04)
--
-- confirmer_changement_mdp() posait doit_changer_mdp = false sans rien vérifier.
-- Exposée via /rest/v1/rpc/, elle était appelable seule, dans n'importe quel
-- ordre : un compte créé par un admin pouvait lever son propre blocage et
-- accéder à l'espace en CONSERVANT le mot de passe temporaire — connu de
-- l'admin qui l'a émis et transmis hors application. Le contrôle reposait
-- entièrement sur l'ordre des appels côté client.
--
-- Elle avait été pensée comme la seconde moitié d'une opération (« changer le
-- mot de passe, puis confirmer ») sans considérer qu'elle est en réalité un
-- point d'entrée indépendant de l'API. C'est l'inverse du raisonnement — juste —
-- appliqué dans terminer_lecon, qui vérifie ses préconditions avant d'agir.
--
-- Le drapeau est désormais levé par un trigger sur auth.users, déclenché quand
-- et seulement quand encrypted_password change vraiment : aucun ordre d'appel à
-- respecter, aucun client à croire sur parole. Le rattrapage par lien de
-- réinitialisation par e-mail — qui ne passe pas par la page dédiée — est
-- couvert lui aussi, ce que l'ancien mécanisme ne faisait pas.
--
-- Le schéma auth appartient à Supabase : y greffer un trigger crée une
-- dépendance à ses évolutions. Elle est assumée — on_auth_user_created y vit
-- depuis l'origine du projet — et c'est le seul endroit où l'information
-- « le mot de passe a changé » existe réellement : auth.users n'expose aucune
-- date de dernière modification du mot de passe, et updated_at bouge pour bien
-- d'autres raisons (confirmation d'e-mail, connexion…).
-- =============================================================================

create or replace function public.lever_changement_mdp_requis()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    update public.profils
       set doit_changer_mdp = false
     where id_profil = new.id
       and doit_changer_mdp;
  end if;
  return new;
end;
$$;

revoke execute on function public.lever_changement_mdp_requis() from public;

drop trigger if exists on_auth_password_changed on auth.users;
create trigger on_auth_password_changed
  after update of encrypted_password on auth.users
  for each row execute function public.lever_changement_mdp_requis();

-- La RPC n'a plus d'objet : la retirer supprime le vecteur de contournement
-- plutôt que de le laisser derrière une fonction devenue vide. Le front n'a
-- plus rien à appeler après updateUser (cf. AuthService.definirNouveauMotDePasse).
drop function if exists public.confirmer_changement_mdp();
