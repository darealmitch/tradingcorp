/* ===== Types de l'API CoinMarketCap ===== */

/** Bloc `status` renvoyé par chaque endpoint CMC. */
export interface CmcStatus {
  timestamp: string;
  error_code: number;
  error_message: string | null;
}

/**
 * Cotation d'une crypto dans une devise de conversion.
 * En v3, chaque cotation porte l'ID + le symbole de la devise (ex. « USD »).
 */
export interface CmcQuoteValue {
  id: number;
  symbol: string;
  price: number;
  percent_change_24h: number;
  last_updated: string;
}

/**
 * Données d'une crypto renvoyées par /v3/cryptocurrency/quotes/latest.
 * En v3, `quote` est un TABLEAU (une entrée par devise de conversion).
 */
export interface CmcCryptoData {
  id: number;
  name: string;
  symbol: string;
  quote: CmcQuoteValue[];
}

/** Réponse de GET /v3/cryptocurrency/quotes/latest (data est un TABLEAU en v3). */
export interface CmcQuotesLatestResponse {
  status: CmcStatus;
  data: CmcCryptoData[];
}

/* ===== Modèle applicatif (aplati, prêt pour la vue) ===== */

export interface CryptoQuote {
  id: number;
  name: string;
  symbol: string;
  price: number;
  changePercent: number;
  up: boolean;
}
