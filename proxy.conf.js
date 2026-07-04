/**
 * Proxy de développement pour l'API CoinMarketCap.
 *
 * Relaie les appels de même origine `/api/cmc/*` vers pro-api.coinmarketcap.com
 * en injectant la clé côté serveur — la clé ne transite jamais par le
 * navigateur et le problème CORS de CMC est contourné.
 *
 * La clé est lue depuis le fichier `.env` (non versionné) :
 *   CMC_API_KEY=xxxxxxxx
 * puis simplement `npm start`.
 *
 * En production, reproduire ce relais dans le reverse-proxy / backend.
 */
const fs = require('fs');
const path = require('path');

/** Charge un .env minimal (KEY=VALUE) dans process.env, sans dépendance. */
function loadEnv() {
  const envPath = path.resolve(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }
  for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnv();

const CMC_API_KEY = process.env.CMC_API_KEY || '';

if (!CMC_API_KEY) {
  console.warn('[proxy] CMC_API_KEY absente (.env) : les appels CoinMarketCap échoueront (401).');
}

module.exports = {
  '/api/cmc': {
    target: 'https://pro-api.coinmarketcap.com',
    changeOrigin: true,
    secure: true,
    pathRewrite: { '^/api/cmc': '' },
    headers: {
      'X-CMC_PRO_API_KEY': CMC_API_KEY,
    },
  },
};
