// Types des API intégrées au runtime Edge de Supabase (Deno.serve, Deno.env).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Signature d'upload Cloudinary : l'API Secret vit uniquement ici (secret
// d'Edge Function), jamais dans le build Angular. Réservée au staff (les
// médias sont gérés côté contenu). Le client reçoit une signature à usage
// unique et téléverse ensuite directement vers Cloudinary.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(corps: unknown, statut: number): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...CORS, 'Content-Type': 'application/json' },
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
    return new Response(null, { status: 204, headers: CORS });
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
      return json({ erreur: 'Connexion requise.' }, 401);
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
      return json({ erreur: 'Réservé au staff.' }, 403);
    }

    const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME');
    const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
    const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');
    if (!cloudName || !apiKey || !apiSecret) {
      return json({ erreur: 'Cloudinary non configuré (secrets manquants).' }, 500);
    }

    const { folder } = (await req.json().catch(() => ({}))) as { folder?: string };
    const dossier = folder?.trim() || 'tradingcorp';

    const timestamp = Math.floor(Date.now() / 1000);
    // Signature Cloudinary : paramètres signés triés en "clé=valeur&…", puis
    // concaténés avec l'API Secret et hachés en SHA-1.
    const params: Record<string, string | number> = { folder: dossier, timestamp };
    const aSigner = Object.keys(params)
      .sort()
      .map((cle) => `${cle}=${params[cle]}`)
      .join('&');
    const signature = await sha1Hex(aSigner + apiSecret);

    return json({ cloudName, apiKey, timestamp, signature, folder: dossier }, 200);
  } catch (erreur) {
    console.error('[cloudinary-signature]', erreur);
    return json({ erreur: 'La signature Cloudinary a échoué.' }, 500);
  }
});
