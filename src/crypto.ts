import type { CryptoPrice } from "./types";

const BASE_URL = "https://api.binance.com/api/v3/ticker/price";

interface BinanceTickerResponse {
  symbol: string;
  price: string;
}

export async function fetchCryptoPrices(coins: string[]): Promise<CryptoPrice[]> {
  const results = await Promise.allSettled(
    coins.map(async (coin) => {
      const symbol = `${coin.toUpperCase()}USDT`;
      const res = await fetch(`${BASE_URL}?symbol=${symbol}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Binance ${symbol}: HTTP ${res.status}`);
      const data = (await res.json()) as BinanceTickerResponse;
      return { symbol: coin.toUpperCase(), usdPrice: parseFloat(data.price) };
    })
  );

  return results.flatMap((r, i) => {
    if (r.status === "rejected") {
      console.warn(`  Crypto fetch failed for ${coins[i]}:`, r.reason);
      return [];
    }
    return [r.value];
  });
}
