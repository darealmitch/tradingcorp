import { Vitrine, prixAffiche } from './vitrine.model';
import { compte, dureeAnnoncee, dureeCourte, lignesInclus, phraseEssai } from './vitrine.textes';

/**
 * Les phrases de la vitrine sont des engagements commerciaux : chacune doit
 * rester vraie au regard de la base. On éprouve ici ce qui les rendrait
 * fausses — un arrondi vers le haut, un accord manqué, un « à vie » revenu.
 */

/** La formation telle que la base la décrivait le 14/10/2026. */
const VITRINE: Vitrine = {
  id_formation: 'f-1',
  titre: 'Formation Trader Pro',
  prix_centimes: 99_700,
  devise: 'eur',
  delivre_certificat: true,
  modules: 8,
  lecons_video: 64,
  secondes_video: 145_044,
  quiz: 30,
  ressources: 15,
  lecons_offertes: [
    { titre: '1.1 Le processus', module: 'Développement personnel', duree_s: 1742 },
    { titre: '1.2 Confiance en soi', module: 'Développement personnel', duree_s: 1164 },
    { titre: '1.3 Tes rêves', module: 'Développement personnel', duree_s: 767 },
  ],
  programme: [
    {
      position: 1,
      titre: 'Développement personnel',
      accroche: null,
      objectifs: [],
      lecons_video: 5,
      secondes_video: 5040,
      quiz: 0,
      lecons_offertes: 3,
    },
    {
      position: 8,
      titre: 'Optimisation',
      accroche: null,
      objectifs: [],
      lecons_video: 2,
      secondes_video: 5760,
      quiz: 1,
      lecons_offertes: 0,
    },
  ],
};

/** Les espaces insécables comptent pour la typographie, pas pour l'assertion. */
function lisible(texte: string): string {
  return texte.replace(/\u00a0/g, ' ');
}

describe('Vitrine — prix', () => {
  it('affiche un prix rond sans centimes', () => {
    expect(lisible(prixAffiche(99_700, 'eur'))).toBe('997 €');
  });

  it('garde les centimes d’un prix qui en a, sans arrondir', () => {
    expect(lisible(prixAffiche(99_799, 'eur'))).toBe('997,99 €');
  });
});

describe('Vitrine — durées', () => {
  it('arrondit toujours vers le bas : 40 h 17 min, c’est « plus de 40 heures »', () => {
    expect(dureeAnnoncee(145_044)).toBe('plus de 40 heures');
  });

  it('dit « 1 heure » pour une heure pile, sans « plus de »', () => {
    expect(dureeAnnoncee(3600)).toBe('1 heure');
  });

  it('compte en minutes sous l’heure', () => {
    expect(lisible(dureeAnnoncee(1742))).toBe('29 min');
  });

  it('donne la durée d’un module au plus près, minutes comprises', () => {
    expect(lisible(dureeCourte(5040))).toBe('1 h 24');
    expect(lisible(dureeCourte(36_000))).toBe('10 h');
    expect(lisible(dureeCourte(600))).toBe('10 min');
  });

  it('accorde le nombre', () => {
    expect(lisible(compte(1, 'leçon', 'leçons'))).toBe('1 leçon');
    expect(lisible(compte(3, 'leçon', 'leçons'))).toBe('3 leçons');
  });
});

describe('Vitrine — ce que le prix comprend', () => {
  it('ne dit que ce que la base et les CGV établissent', () => {
    const lignes = lignesInclus(VITRINE).map(lisible);

    expect(lignes).toEqual([
      '8 modules, de « Développement personnel » à « Optimisation »',
      '64 leçons vidéo, soit plus de 40 heures de vidéo',
      '30 quiz pour vérifier tes acquis',
      '15 ressources complémentaires à consulter ou télécharger',
      'Un certificat d’achèvement, vérifiable en ligne grâce à son numéro',
      'Un accès sans limite de durée, sur ordinateur, tablette et téléphone',
    ]);
  });

  it('ne promet jamais un accès « à vie » ni un « diplôme »', () => {
    const texte = lignesInclus(VITRINE).join(' ');
    expect(texte).not.toContain('à vie');
    expect(texte.toLowerCase()).not.toContain('diplôme');
  });

  it('tait le certificat et les ressources quand la formation n’en a pas', () => {
    const lignes = lignesInclus({ ...VITRINE, delivre_certificat: false, ressources: 0 });
    expect(lignes.join(' ')).not.toContain('certificat');
    expect(lignes.join(' ')).not.toContain('ressource');
  });

  it('nomme le module des leçons offertes quand elles viennent du même', () => {
    expect(lisible(phraseEssai(VITRINE))).toBe(
      '3 leçons du module « Développement personnel » sont offertes.',
    );
  });

  it('accorde la phrase d’essai au singulier, et se passe du module s’il y en a plusieurs', () => {
    const une = { ...VITRINE, lecons_offertes: [VITRINE.lecons_offertes[0]] };
    expect(lisible(phraseEssai(une))).toBe(
      '1 leçon du module « Développement personnel » est offerte.',
    );

    const deuxModules = {
      ...VITRINE,
      lecons_offertes: [
        VITRINE.lecons_offertes[0],
        { titre: '2.1 Le budget', module: 'Éducation financière', duree_s: 900 },
      ],
    };
    expect(lisible(phraseEssai(deuxModules))).toBe('2 leçons sont offertes.');
  });
});
