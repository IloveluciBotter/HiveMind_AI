const JUPITER_PRICE_API = "https://price.jup.ag/v4/price";

interface JupiterPriceResponse {
  data: {
    [mint: string]: {
      id: string;
      mintSymbol: string;
      vsToken: string;
      vsTokenSymbol: string;
      price: number;
    };
  };
  timeTaken: number;
}

// Simple in-memory cache (60 seconds TTL)
interface CacheEntry {
  price: number;
  timestamp: number;
}

const priceCache = new Map<string, CacheEntry>();
const CACHE_TTL = 60 * 1000; // 60 seconds

/**
 * Get USD price for HIVE token from Jupiter
 * Returns price in USD, or null if unavailable
 */
export async function getHivePrice(): Promise<number | null> {
  const HIVE_MINT = process.env.HIVE_MINT || "F3zvEFZVhDXNo1kZDPg24Z3RioDzCdEJVdnZ5FCcpump";

  // Check cache first
  const cached = priceCache.get(HIVE_MINT);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.price;
  }

  try {
    const response = await fetch(`${JUPITER_PRICE_API}?ids=${HIVE_MINT}`, {
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    
    if (!response.ok) {
      return null;
    }

    const data: JupiterPriceResponse = await response.json();
    const priceData = data.data[HIVE_MINT];

    if (!priceData || !priceData.price) {
      return null;
    }

    const price = priceData.price;

    // Update cache
    priceCache.set(HIVE_MINT, {
      price,
      timestamp: Date.now(),
    });

    return price;
  } catch {
    // Price fetch is optional - silently return null on any error
    return null;
  }
}

/**
 * Clear the price cache (useful for testing)
 */
export function clearPriceCache(): void {
  priceCache.clear();
}

