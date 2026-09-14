/**
 * Ce qu'une police standard de PDF sait écrire — et ce qu'il faut en retirer.
 *
 * LES POLICES STANDARD ÉCRIVENT EN WINANSI (CP1252), et pdf-lib refuse le
 * document entier plutôt que d'encoder un caractère qu'il ne connaît pas. Un
 * seul suffit : « WinAnsi cannot encode "‎" (0x200e) » — une marque
 * gauche-à-droite invisible, arrivée par copier-coller dans un champ « nom ».
 * C'est exactement ce qui est survenu en production le 14 septembre 2026, sur
 * une facture.
 *
 * Le danger tient à ce que l'échec est SILENCIEUX là où il compte : les deux
 * appelants — facture et certificat — sont invoqués depuis des chaînes qui
 * avalent leurs erreurs pour ne pas faire rejouer un webhook ou perdre un
 * paiement. Un nom impossible à écrire ne casse donc rien de visible : il
 * produit simplement un document qui n'existe jamais.
 *
 * Partagé entre `facture.ts` et `generer-certificat/diplome.ts` : les deux
 * dessinent un nom saisi par un utilisateur, et il ne doit pas exister deux
 * définitions de ce qui est écrivable.
 */

/**
 * Caractères que WinAnsi accepte au-delà du latin-1 — la part « haute » de
 * CP1252 : guillemets typographiques, tirets longs, euro, œ, ligatures.
 */
const WINANSI_EN_PLUS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split(''));

/**
 * Rend un texte écrivable par une police standard.
 *
 * La normalisation NFC recompose au passage les accents décomposés — « e »
 * suivi d'un accent combinant devient « é », que WinAnsi connaît — de sorte
 * qu'un nom copié depuis un système qui décompose ne perde pas ses accents.
 *
 * Le parti pris est d'écrire un document RÉGULIER plutôt que rien. Ce qui
 * reste inconnu est retiré ; un nom entièrement hors latin — en cyrillique, en
 * japonais — disparaît alors, et c'est à l'appelant de prévoir ce cas (la
 * facture retombe sur « Client », l'adresse électronique figurant juste en
 * dessous).
 */
export function lisible(contenu: string): string {
  return contenu
    .normalize('NFC')
    .replace(/[^ -~ -ÿ]/gu, (caractere) => (WINANSI_EN_PLUS.has(caractere) ? caractere : ''))
    .trim();
}
