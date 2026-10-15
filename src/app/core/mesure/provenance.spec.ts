import { Provenance } from './mesure.model';
import { provenanceDe } from './provenance';

/**
 * La provenance décide à quel canal une inscription est attribuée : une
 * erreur ici fait juger une publicité sur les résultats d'une autre. Chaque
 * cas ci-dessous est une arrivée réelle, telle que le navigateur la décrit.
 */
describe('provenanceDe', () => {
  const cas: [string, string, string, Provenance | null][] = [
    ['adresse tapée ou favori', '', '', 'direct'],
    ['recherche Google', '', 'https://www.google.com/', 'recherche'],
    ['recherche Qwant', '', 'https://www.qwant.com/', 'recherche'],
    ['recherche Brave', '', 'https://search.brave.com/', 'recherche'],
    [
      'annonce Google, balisage automatique',
      '?gclid=Cj0K',
      'https://www.google.com/',
      'google-ads',
    ],
    ['annonce YouTube', '?gclid=Cj0K&utm_source=youtube', '', 'youtube-ads'],
    ['annonce Meta balisée', '?utm_source=facebook&utm_medium=paid&fbclid=Iw', '', 'meta-ads'],
    ['annonce Instagram balisée', '?utm_source=ig&utm_medium=cpc', '', 'meta-ads'],
    ['annonce TikTok', '?ttclid=E.C.P', '', 'tiktok-ads'],
    ['annonce TikTok balisée', '?utm_source=tiktok&utm_medium=paid_social', '', 'tiktok-ads'],
    ['publication Facebook gratuite', '?fbclid=Iw', 'https://l.facebook.com/', 'reseaux'],
    ['lien en bio Instagram', '?utm_source=instagram&utm_medium=social', '', 'reseaux'],
    ['vidéo YouTube', '', 'https://www.youtube.com/', 'reseaux'],
    ['lettre d’information', '?utm_source=brevo&utm_medium=email', '', 'email'],
    ['lien ouvert depuis Gmail', '', 'https://mail.google.com/', 'email'],
    ['article d’un autre site', '', 'https://blog.exemple.fr/article', 'autre-site'],
    ['campagne payante d’une autre régie', '?utm_source=bing&utm_medium=cpc', '', 'autre-site'],
    ['page rechargée depuis le site', '', 'https://tradingcorp.fr/programme', null],
    ['retour de la recette', '', 'https://dev.tradingcorp.fr/', null],
    ['retour de la page de paiement', '', 'https://checkout.stripe.com/c/pay/cs', null],
    ['retour de la connexion Google', '', 'https://accounts.google.com/', null],
  ];

  it.each(cas)('%s', (_libelle, recherche, referent, attendu) => {
    expect(provenanceDe({ recherche, referent })).toBe(attendu);
  });

  it('ignore une adresse d’origine illisible', () => {
    expect(provenanceDe({ recherche: '', referent: 'pas une adresse' })).toBe('direct');
  });
});
