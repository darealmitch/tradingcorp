import { ChangeDetectionStrategy, Component } from '@angular/core';

interface Quote {
  symbol: string;
  price: string;
  change: string;
  up: boolean;
}

@Component({
  selector: 'app-ticker',
  templateUrl: './ticker.html',
  styleUrl: './ticker.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Ticker {
  protected readonly quotes: Quote[] = [
    { symbol: 'BTC / USD', price: '64 218,50', change: '+2,41 %', up: true },
    { symbol: 'ETH / USD', price: '3 152,08', change: '+1,87 %', up: true },
    { symbol: 'EUR / USD', price: '1,0842', change: '-0,12 %', up: false },
    { symbol: 'S&P 500', price: '5 486,30', change: '+0,64 %', up: true },
    { symbol: 'NASDAQ 100', price: '17 862,10', change: '+0,92 %', up: true },
    { symbol: 'OR', price: '2 384,60', change: '-0,35 %', up: false },
    { symbol: 'AAPL', price: '214,72', change: '+1,12 %', up: true },
    { symbol: 'PÉTROLE WTI', price: '82,14', change: '+0,48 %', up: true },
  ];
}
