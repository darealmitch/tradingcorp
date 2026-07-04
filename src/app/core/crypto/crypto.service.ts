import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CmcQuotesLatestResponse, CryptoQuote } from './crypto.models';

/**
 * Accès aux cours CoinMarketCap.
 *
 * On interroge par **IDs CoinMarketCap** (stables) et non par symboles : un
 * symbole peut être réattribué ou dupliqué, l'ID d'un actif, jamais.
 *
 * 👉 Pour récupérer / mettre à jour les IDs des cryptos suivies, utiliser une
 * fois GET /v1/cryptocurrency/map (via le même proxy) :
 *
 *   GET /api/cmc/v1/cryptocurrency/map?symbol=BTC,ETH,SOL
 *
 * La réponse renvoie, pour chaque actif, son `id` stable à reporter dans la
 * liste `TRACKED_IDS` du composant Ticker. `listing_status=active` et le tri
 * par `cmc_rank` permettent de lever les ambiguïtés de symboles.
 */
@Injectable({ providedIn: 'root' })
export class CryptoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.cmcApiBaseUrl;

  /** Cours temps réel via GET /v3/cryptocurrency/quotes/latest, par IDs. */
  getQuotes(ids: number[], convert = 'USD'): Observable<CryptoQuote[]> {
    const params = new HttpParams().set('id', ids.join(',')).set('convert', convert);

    return this.http
      .get<CmcQuotesLatestResponse>(`${this.baseUrl}/v3/cryptocurrency/quotes/latest`, { params })
      .pipe(map((res) => this.toQuotes(res, ids, convert)));
  }

  /** Aplati la réponse CMC dans l'ordre demandé, en ignorant les IDs absents. */
  private toQuotes(res: CmcQuotesLatestResponse, ids: number[], convert: string): CryptoQuote[] {
    // En v3, data est un tableau : on l'indexe par ID pour respecter l'ordre voulu.
    const byId = new Map(res.data.map((data) => [data.id, data]));

    return ids
      .map((id) => byId.get(id))
      .map((data) => {
        // quote est un tableau : on retient la cotation de la devise demandée.
        const quote = data?.quote.find((q) => q.symbol === convert) ?? data?.quote[0];
        if (!data || !quote) {
          return null;
        }
        return {
          id: data.id,
          name: data.name,
          symbol: data.symbol,
          price: quote.price,
          changePercent: quote.percent_change_24h,
          up: quote.percent_change_24h >= 0,
        } satisfies CryptoQuote;
      })
      .filter((quote): quote is CryptoQuote => quote !== null);
  }
}
