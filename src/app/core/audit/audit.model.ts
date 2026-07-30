/** Une action sensible enregistrée dans la piste d'audit. */
export interface EntreeJournal {
  id_journal: string;
  action: string;
  cible: string | null;
  date_action: string;
  /** E-mail de l'auteur figé à l'écriture — seul repli si son compte a été supprimé. */
  auteur: string | null;
  /** Null quand le compte de l'auteur a été supprimé : l'entrée, elle, demeure. */
  profils: { prenom: string; nom: string } | null;
}
