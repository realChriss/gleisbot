import type { CryptoPrice } from "./types";

const COINGECKO = "https://api.coingecko.com/api/v3";

interface CoinGeckoSearchCoin {
  id: string;
  symbol: string;
  name: string;
}

interface CoinGeckoSearchResponse {
  coins: CoinGeckoSearchCoin[];
}

async function resolveId(symbol: string): Promise<{ symbol: string; name: string; id: string }> {
  const upper = symbol.toUpperCase();
  const res = await fetch(`${COINGECKO}/search?query=${upper}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`CoinGecko search ${upper}: HTTP ${res.status}`);
  const data = (await res.json()) as CoinGeckoSearchResponse;
  const match = data.coins.find((c) => c.symbol.toUpperCase() === upper);
  if (!match) throw new Error(`CoinGecko: no coin found for symbol ${upper}`);
  return { symbol: upper, name: match.name, id: match.id };
}

export async function fetchCryptoPrices(coins: string[]): Promise<CryptoPrice[]> {
  const idResults = await Promise.allSettled(coins.map(resolveId));

  const resolved: { symbol: string; name: string; id: string }[] = [];
  for (let i = 0; i < idResults.length; i++) {
    const r = idResults[i];
    if (r.status === "rejected") {
      console.warn(`  Crypto lookup failed for ${coins[i]}:`, r.reason);
    } else {
      resolved.push(r.value);
    }
  }

  if (resolved.length === 0) return [];

  const ids = resolved.map((c) => c.id).join(",");
  const priceRes = await fetch(
    `${COINGECKO}/simple/price?ids=${ids}&vs_currencies=usd`,
    { signal: AbortSignal.timeout(10_000) }
  );
  if (!priceRes.ok) throw new Error(`CoinGecko price fetch: HTTP ${priceRes.status}`);
  const prices = (await priceRes.json()) as Record<string, { usd: number }>;

  return resolved.flatMap(({ symbol, name, id }) => {
    const usdPrice = prices[id]?.usd;
    if (usdPrice == null) {
      console.warn(`  No price returned for ${symbol} (id: ${id})`);
      return [];
    }
    return [{ symbol, name, usdPrice }];
  });
}
