// Types des API intégrées au runtime Edge de Supabase (Deno.serve, Deno.env).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { enTetesCors, reponsePreflight } from '../_partages/cors.ts';

// Collecteur des incidents survenus dans le NAVIGATEUR (audit P-14).
//
// `acces-donnees.ts` sait depuis août transmettre une erreur à un collecteur ;
// il lui manquait une adresse. La voici — chez nous plutôt que chez un tiers :
// pas de sous-traitant à ajouter au registre RGPD, pas de transfert hors UE,
// et les traces vivent à côté des données qu'elles décrivent.
//
// Fonction PUBLIQUE, et elle doit l'être : une erreur qui survient sur la page
// d'accueil, avant toute connexion, est précisément celle qu'on ne verrait
// jamais autrement. D'où la prudence qui suit — un point d'écriture ouvert au
// web se protège, sinon il devient un dépotoir.

const FENETRE_MS = 60_000;
const MAX_PAR_FENETRE = 30;

const compteurs = new Map<string, { debut: number; appels: number }>();

/** Vrai si l'appelant a dépassé son quota sur la fenêtre courante. */
function debitDepasse(req: Request): boolean {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'inconnue';
  const maintenant = Date.now();
  const compteur = compteurs.get(ip);

  if (!compteur || maintenant - compteur.debut > FENETRE_MS) {
    compteurs.set(ip, { debut: maintenant, appels: 1 });
    if (compteurs.size > 5_000) {
      for (const [cle, valeur] of compteurs) {
        if (maintenant - valeur.debut > FENETRE_MS) compteurs.delete(cle);
      }
    }
    return false;
  }

  compteur.appels += 1;
  return compteur.appels > MAX_PAR_FENETRE;
}

/** Chaîne bornée, ou null. Une charge utile forgée ne doit pas gonfler la table. */
function texte(valeur: unknown, max: number): string | null {
  if (typeof valeur !== 'string') return null;
  const propre = valeur.trim();
  return propre ? propre.slice(0, max) : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return reponsePreflight(req, 'POST, OPTIONS');
  }

  // Toujours 204, quoi qu'il arrive. Ce point de collecte ne renvoie jamais
  // d'erreur au navigateur : le front ne sait rien en faire, et un collecteur
  // bavard apprendrait surtout à un curieux comment il valide ses entrées.
  const accuse = () => new Response(null, { status: 204, headers: enTetesCors(req) });

  if (debitDepasse(req)) {
    return accuse();
  }

  let charge: Record<string, unknown>;
  try {
    charge = (await req.json()) as Record<string, unknown>;
  } catch {
    return accuse();
  }

  const operation = texte(charge.operation, 200);
  const session = texte(charge.session, 64);
  // Sans ces deux-là, la ligne ne diagnostiquerait rien : on préfère ne rien
  // écrire plutôt que d'accumuler des traces muettes.
  if (!operation || !session) {
    return accuse();
  }

  // `agent` et `page` sont relevés côté SERVEUR, pas acceptés du client :
  // ils orientent le diagnostic (« seulement sur Safari », « seulement sur
  // /parcours ») et un client ne doit pas pouvoir les inventer.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { error } = await admin.from('incidents').insert({
    operation,
    session,
    code: texte(charge.code, 60),
    date_client: texte(charge.date, 40),
    agent: texte(req.headers.get('user-agent'), 200),
    page: texte(req.headers.get('referer'), 300),
  });

  if (error) {
    // Journalisé ici seulement : le navigateur n'a rien à faire de cet échec,
    // et la perte d'une trace ne doit jamais peser sur la session en cours.
    console.error('[incident] écriture refusée', error);
  }

  return accuse();
});
