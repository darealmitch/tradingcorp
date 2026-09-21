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
 * Le danger tient à ce que l'échec est SILENCIEUX là où il compte : le
 * certificat est délivré par une chaîne qui avale ses erreurs, comme le
 * faisait la facture. Un nom impossible à écrire ne casse donc rien de
 * visible : il produit simplement un document qui n'existe jamais.
 *
 * Seul `generer-certificat/diplome.ts` s'en sert aujourd'hui — la facture, qui
 * l'utilisait aussi, est désormais émise par Stripe. Le module reste dans
 * `_partages` : tout futur document PDF portant un nom saisi par un
 * utilisateur devra passer par la même définition de ce qui est écrivable.
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
 * japonais — disparaît alors, et c'est à l'appelant de prévoir ce cas.
 */
export function lisible(contenu: string): string {
  return contenu
    .normalize('NFC')
    .replace(/[^ -~ -ÿ]/gu, (caractere) => (WINANSI_EN_PLUS.has(caractere) ? caractere : ''))
    .trim();
}
