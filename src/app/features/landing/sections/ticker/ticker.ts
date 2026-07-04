import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CryptoService } from '../../../../core/crypto/crypto.service';
import { CryptoQuote } from '../../../../core/crypto/crypto.models';

/**
 * IDs CoinMarketCap stables des cryptos affichées, dans l'ordre voulu.
 * (Bitcoin, Ethereum, Tether, BNB, Solana, XRP, Cardano, Dogecoin.)
 * Pour en ajouter d'autres, récupérer leur ID via /v1/cryptocurrency/map —
 * voir la documentation dans CryptoService.
 */
const TRACKED_IDS = [1, 1027, 825, 1839, 5426, 52, 2010, 74];

@Component({
  selector: 'app-ticker',
  templateUrl: './ticker.html',
  styleUrl: './ticker.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Ticker implements OnInit {
  private readonly crypto = inject(CryptoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly quotes = signal<CryptoQuote[]>([]);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);

  ngOnInit(): void {
    this.crypto
      .getQuotes(TRACKED_IDS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (quotes) => {
          this.quotes.set(quotes);
          this.loading.set(false);
        },
        error: () => {
          this.failed.set(true);
          this.loading.set(false);
        },
      });
  }

  /** Prix en français ; plus de décimales sous 1 $ (stablecoins, micro-caps). */
  protected formatPrice(price: number): string {
    const digits = price >= 1 ? 2 : 6;
    return price.toLocaleString('fr-FR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  /** Variation 24 h signée, format français. */
  protected formatChange(percent: number): string {
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(2).replace('.', ',')} %`;
  }
}
