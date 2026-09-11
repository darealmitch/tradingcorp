import type { CookieConsentConfig } from 'vanilla-cookieconsent';

/** Catégorie du lecteur vidéo tiers — la seule qui demande un accord. */
export const CATEGORIE_VIDEOS = 'videos';

/**
 * Le bandeau de consentement : ce qu'il annonce, et comment il se présente.
 *
 * DEUX catégories, parce que le site ne dépose que deux sortes de choses : ce
 * qui le fait fonctionner, dispensé de consentement, et le lecteur de Bunny.net,
 * qui ne l'est pas. Inventer des catégories « statistiques » ou « marketing »
 * pour faire complet reviendrait à annoncer des traceurs qui n'existent pas —
 * et une information inexacte vicie le consentement qu'elle recueille.
 *
 * Tout ce qui est écrit ici doit rester d'accord avec la politique de cookies
 * (`features/legal/cookies`). Changer l'un sans l'autre, c'est promettre une
 * chose et en faire une autre.
 */
export const CONFIG_CONSENTEMENT: CookieConsentConfig = {
  // À relever dès que la liste des catégories change : les choix déjà faits
  // sont alors redemandés, un accord ne valant que pour ce qu'on a présenté.
  revision: 1,

  // Le bandeau paraît dès la première visite : l'information précède tout
  // clic, au lieu de surgir au moment où l'on veut lancer la vidéo.
  autoShow: true,

  hideFromBots: true,

  cookie: {
    name: 'tradingcorp-consentement',
    // Six mois : la durée de conservation du choix que retient la CNIL.
    expiresAfterDays: 182,
  },

  guiOptions: {
    // Accepter et refuser pèsent le même poids visuel : la CNIL exige que le
    // refus soit aussi simple que l'acceptation.
    consentModal: {
      layout: 'box inline',
      position: 'bottom left',
      equalWeightButtons: true,
      flipButtons: false,
    },
    preferencesModal: {
      layout: 'box',
      equalWeightButtons: true,
      flipButtons: false,
    },
  },

  categories: {
    necessaires: { enabled: true, readOnly: true },
    [CATEGORIE_VIDEOS]: {},
  },

  language: {
    default: 'fr',
    translations: {
      fr: {
        consentModal: {
          title: 'Vos préférences en matière de cookies',
          description:
            "TradingCorp n'utilise aucun cookie publicitaire ni outil de mesure d'audience. " +
            'Seule la <strong>vidéo de présentation</strong>, hébergée par Bunny.net, nécessite ' +
            'votre accord : son lecteur enregistre vos préférences de lecture sur votre terminal et ' +
            "transmet à Bunny.net des mesures techniques. Refuser n'affecte pas votre navigation.",
          acceptAllBtn: 'Tout accepter',
          acceptNecessaryBtn: 'Tout refuser',
          showPreferencesBtn: 'Personnaliser',
          footer:
            '<a href="/cookies">Politique de cookies</a><a href="/confidentialite">Politique de confidentialité</a>',
        },
        preferencesModal: {
          title: 'Gestion des cookies',
          acceptAllBtn: 'Tout accepter',
          acceptNecessaryBtn: 'Tout refuser',
          savePreferencesBtn: 'Enregistrer mes choix',
          closeIconLabel: 'Fermer',
          sections: [
            {
              title: 'Votre choix',
              description:
                'Votre choix est conservé six mois pour ce navigateur. Vous pouvez le modifier à tout moment depuis le lien « Gestion des cookies », en bas de chaque page.',
            },
            {
              title: 'Cookies strictement nécessaires',
              description:
                "Session de connexion, thème d'affichage et conservation de vos choix. Indispensables au fonctionnement du site, ils sont dispensés de consentement.",
              linkedCategory: 'necessaires',
            },
            {
              title: 'Vidéo de présentation — Bunny.net',
              description:
                "Le lecteur enregistre sur votre terminal vos préférences de lecture et le cache de ses icônes, et transmet à Bunny.net des mesures techniques pendant la lecture. Il n'est chargé qu'avec votre accord.",
              linkedCategory: CATEGORIE_VIDEOS,
            },
            {
              title: 'En savoir plus',
              description:
                'Le détail de chaque traceur figure dans la <a href="/cookies">politique de cookies</a>.',
            },
          ],
        },
      },
    },
  },
};
