/** Un ancien élève tel que l'export Wix le décrit, une fois nettoyé. */
export interface EleveAMigrer {
  email: string;
  /** Compteur d'étapes achevées chez Wix ; traduit en autant de leçons. */
  etapes_terminees: number;
  prenom?: string;
  nom?: string;
}

/** Ce que la migration a fait — ou ferait — pour un élève donné. */
export interface BilanMigration {
  email: string;
  compte: 'cree' | 'rattache' | 'ignore';
  inscription: 'creee' | 'deja_presente' | 'aucune';
  lecons_marquees: number;
  pourcentage: number | null;
  reprise_a: string | null;
  invitation: 'envoyee' | 'non_demandee' | 'echec';
  probleme: string | null;
}

export interface ResultatMigration {
  simulation: boolean;
  total: number;
  bilans: BilanMigration[];
}
