/**
 * Échanges privés : comment on les regroupe, et quand l'équipe doit répondre.
 *
 * Un échange privé, c'est un fil — le message d'origine d'un élève — et ses
 * messages privés : réponses privées de l'équipe, réponses privées de l'élève,
 * et le message d'origine lui-même quand l'équipe a rendu tout le fil privé.
 *
 * La même règle « à répondre » alimente la pastille de la navigation et
 * l'onglet de la modération : elle n'est écrite qu'ici, pour que les deux ne
 * puissent pas se contredire.
 */

/** Ce qu'il faut savoir d'un message pour le situer dans un échange. */
export interface MessageDeFil {
  id_commentaire: string;
  id_parent: string | null;
  par_equipe: boolean;
  est_prive: boolean;
  date_creation: string;
}

/** Un échange privé, prêt à afficher. */
export interface EchangePrive<T extends MessageDeFil> {
  /** Le message d'origine de l'élève. */
  fil: T;
  /** Tout le fil est privé : l'équipe y a placé le message d'origine. */
  filPrive: boolean;
  /** Les réponses du fil, dans l'ordre où elles ont été écrites. */
  messages: T[];
  /** L'équipe doit répondre : c'est l'élève qui a écrit en dernier. */
  aRepondre: boolean;
  /** Date du dernier message, pour classer les échanges. */
  derniereActivite: string;
}

/** Le fil auquel appartient un message : le sien, ou celui de son parent. */
export function filDe(message: Pick<MessageDeFil, 'id_commentaire' | 'id_parent'>): string {
  return message.id_parent ?? message.id_commentaire;
}

/**
 * Ordre chronologique de deux dates renvoyées par la base.
 *
 * Comparaison caractère par caractère, pas `localeCompare` : Postgres n'écrit
 * pas la fraction d'une seconde ronde (« …:56+00:00 »), et l'ordre
 * linguistique range le point avant le signe plus — « …:56.5 » y passerait
 * avant « …:56 ».
 */
function chronologique(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Vrai quand l'équipe doit répondre à cet échange.
 *
 * `messages` : les messages privés d'UN échange, dans un ordre quelconque —
 * y compris le message d'origine quand tout le fil est privé.
 */
export function aRepondre(messages: readonly MessageDeFil[]): boolean {
  if (messages.length === 0) {
    return false;
  }
  const dernier = messages.reduce((plusRecent, m) =>
    chronologique(m.date_creation, plusRecent.date_creation) > 0 ? m : plusRecent,
  );
  return !dernier.par_equipe;
}

/** Nombre d'échanges privés qui attendent une réponse de l'équipe. */
export function compterARepondre(prives: readonly MessageDeFil[]): number {
  const parFil = new Map<string, MessageDeFil[]>();
  for (const message of prives) {
    const fil = filDe(message);
    parFil.set(fil, [...(parFil.get(fil) ?? []), message]);
  }
  return [...parFil.values()].filter((messages) => aRepondre(messages)).length;
}

/**
 * Regroupe en échanges les messages d'un ou plusieurs fils : chaque message
 * d'origine avec ses réponses. Un fil dont le message d'origine manque est
 * écarté — il n'y aurait rien à quoi rattacher la conversation.
 *
 * Les échanges qui attendent une réponse passent devant, puis les plus récents.
 */
export function regrouperEchanges<T extends MessageDeFil>(lignes: readonly T[]): EchangePrive<T>[] {
  const parFil = new Map<string, T[]>();
  for (const ligne of lignes) {
    const fil = filDe(ligne);
    parFil.set(fil, [...(parFil.get(fil) ?? []), ligne]);
  }

  const echanges: EchangePrive<T>[] = [];
  for (const [idFil, groupe] of parFil) {
    const fil = groupe.find((m) => m.id_commentaire === idFil);
    if (!fil) {
      continue;
    }
    const messages = groupe
      .filter((m) => m.id_commentaire !== idFil)
      .sort((a, b) => chronologique(a.date_creation, b.date_creation));
    const prives = groupe.filter((m) => m.est_prive);
    const dates = groupe.map((m) => m.date_creation).sort();
    echanges.push({
      fil,
      filPrive: fil.est_prive,
      messages,
      aRepondre: aRepondre(prives),
      derniereActivite: dates[dates.length - 1],
    });
  }

  return echanges.sort(
    (a, b) =>
      Number(b.aRepondre) - Number(a.aRepondre) ||
      chronologique(b.derniereActivite, a.derniereActivite),
  );
}
