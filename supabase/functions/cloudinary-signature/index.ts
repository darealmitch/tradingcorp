// Types des API intégrées au runtime Edge de Supabase (Deno.serve, Deno.env).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { enTetesCors, reponsePreflight } from '../_partages/cors.ts';

// Signature d'upload Cloudinary : l'API Secret vit uniquement ici (secret
// d'Edge Function), jamais dans le build Angular. Réservée au staff (les
// médias sont gérés côté contenu). Le client reçoit une signature à usage
// unique et téléverse ensuite directement vers Cloudinary.
//
// La signature ne couvrait que `folder` et `timestamp` : un compte staff
// pouvait donc téléverser n'importe quel type de fichier, dans n'importe quel
// dossier. Elle couvre désormais aussi `allowed_formats`, que Cloudinary
// applique de son côté — un fichier hors liste est rejeté à l'upload, pas
// seulement masqué par l'interface. Et comme la signature porte sur
// l'ensemble exact des paramètres envoyés, un client qui retirerait ou
// modifierait `allowed_formats` produirait une signature invalide : la
// contrainte n'est pas contournable depuis le navigateur.

/** Catégories téléversables, et formats acceptés pour chacune. */
const CATEGORIES: Record<string, { formats: string[]; maxOctets: number }> = {
  image: { formats: ['jpg', 'jpeg', 'png', 'webp', 'avif'], maxOctets: 10 * 1024 * 1024 },
  document: { formats: ['pdf'], maxOctets: 25 * 1024 * 1024 },
  audio: { formats: ['mp3', 'm4a', 'wav'], maxOctets: 100 * 1024 * 1024 },
};

// Dossiers de destination connus du projet. Une valeur libre laissait écrire
// n'importe où dans la bibliothèque Cloudinary, y compris hors périmètre.
const DOSSIERS = ['tradingcorp', 'formations', 'ressources', 'profils'];

function json(req: Request, corps: unknown, statut: number): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...enTetesCors(req), 'Content-Type': 'application/json' },
  });
}

/** SHA-1 hexadécimal (algorithme de signature attendu par Cloudinary). */
async function sha1Hex(entree: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(entree));
  return Array.from(new Uint8Array(digest))
    .map((octet) => octet.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return reponsePreflight(req, 'POST, OPTIONS');
  }

  try {
    // Identité de l'appelant (verify_jwt actif : les anonymes sont déjà rejetés).
    const porteur = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const {
      data: { user },
    } = await porteur.auth.getUser();
    if (!user) {
      return json(req, { erreur: 'Connexion requise.' }, 401);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const { data: profil } = await admin
      .from('profils')
      .select('role')
      .eq('id_profil', user.id)
      .maybeSingle();
    if (profil?.role !== 'formateur' && profil?.role !== 'admin') {
      return json(req, { erreur: 'Réservé au staff.' }, 403);
    }

    const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME');
    const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
    const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');
    if (!cloudName || !apiKey || !apiSecret) {
      return json(req, { erreur: 'Cloudinary non configuré (secrets manquants).' }, 500);
    }

    const { folder, categorie } = (await req.json().catch(() => ({}))) as {
      folder?: string;
      categorie?: string;
    };

    const dossier = folder?.trim() || 'tradingcorp';
    if (!DOSSIERS.includes(dossier)) {
      return json(req, { erreur: 'Dossier de destination inconnu.' }, 400);
    }

    const regle = CATEGORIES[categorie ?? 'image'];
    if (!regle) {
      return json(
        req,
        { erreur: `Catégorie inconnue : ${Object.keys(CATEGORIES).join(', ')}.` },
        400,
      );
    }

    const timestamp = Math.floor(Date.now() / 1000);
    // Signature Cloudinary : paramètres signés triés en "clé=valeur&…", puis
    // concaténés avec l'API Secret et hachés en SHA-1. `allowed_formats` entre
    // dans la signature — c'est ce qui le rend opposable au client.
    const formats = regle.formats.join(',');
    const params: Record<string, string | number> = {
      allowed_formats: formats,
      folder: dossier,
      timestamp,
    };
    const aSigner = Object.keys(params)
      .sort()
      .map((cle) => `${cle}=${params[cle]}`)
      .join('&');
    const signature = await sha1Hex(aSigner + apiSecret);

    return json(
      req,
      {
        cloudName,
        apiKey,
        timestamp,
        signature,
        folder: dossier,
        allowedFormats: formats,
        // Borne renvoyée pour que le client refuse le fichier avant de
        // consommer de la bande passante. La limite qui compte reste celle du
        // preset Cloudinary : ce champ est un confort, pas la protection.
        maxOctets: regle.maxOctets,
      },
      200,
    );
  } catch (erreur) {
    console.error('[cloudinary-signature]', erreur);
    return json(req, { erreur: 'La signature Cloudinary a échoué.' }, 500);
  }
});
