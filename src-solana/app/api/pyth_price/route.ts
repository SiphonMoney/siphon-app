import { NextResponse } from 'next/server';

// Pyth Network price feed IDs (Hermes format)
// These are the price feed IDs for USD pairs
// Format: price feed ID without 0x prefix (as required by Hermes API)
// 
// To find price feed IDs:
// 1. Visit https://pyth.network/developers/price-feed-ids
// 2. Or use the Hermes API: https://hermes.pyth.network/api/latest_price_feeds
// 3. Price feed IDs are hex strings (64 characters)
//
// Current mappings (verify these are correct):
const PYTH_PRICE_FEED_IDS: Record<string, string> = {
  'ETH': 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', // Crypto.ETH/USD
  'BTC': 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', // Crypto.BTC/USD
  'SOL': 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c5c85c9b4e8b4e8b4e8b4e8', // Crypto.SOL/USD (verify this ID)
  'USDC': '1.0', // USDC/USD is always 1.0 (stablecoin)
};

// Hermes API base URL
const HERMES_API_BASE = 'https://hermes.pyth.network/api';

interface PythPriceFeed {
  id: string;
  price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
  ema_price?: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
}

/**
 * Convert Pyth price to actual USD value
 * Pyth prices are stored as integers with an exponent
 * actualPrice = price * 10^expo
 */
function convertPythPrice(price: string, expo: number): number {
  const priceNum = parseFloat(price);
  return priceNum * Math.pow(10, expo);
}

/**
 * Fetch price feed from Pyth Hermes API
 */
async function fetchPythPriceFeed(priceId: string): Promise<PythPriceFeed | null> {
  try {
    // Ensure ID doesn't have 0x prefix for Hermes API
    const cleanId = priceId.startsWith('0x') ? priceId.slice(2) : priceId;
    
    // Hermes API expects IDs in array format
    const url = `${HERMES_API_BASE}/latest_price_feeds?ids[]=${cleanId}`;
    console.log('[Pyth API] Fetching price feed:', url);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      // Add cache control to get fresh data
      cache: 'no-store',
      next: { revalidate: 0 }, // Always fetch fresh data
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Pyth API] Error response:', response.status, errorText);
      
      // Handle rate limiting
      if (response.status === 429) {
        console.warn('[Pyth API] Rate limit exceeded, waiting...');
      }
      
      return null;
    }
    
    const data: PythPriceFeed[] = await response.json();
    
    if (data && data.length > 0 && data[0]) {
      console.log('[Pyth API] Received price feed:', {
        id: data[0].id,
        price: data[0].price.price,
        expo: data[0].price.expo,
        conf: data[0].price.conf
      });
      return data[0];
    }
    
    console.warn('[Pyth API] Empty response from Hermes');
    return null;
  } catch (error) {
    console.error('[Pyth API] Error fetching price feed:', error);
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const coin = searchParams.get('coin') || 'all';
    const coinUpper = coin.toUpperCase();
    
    console.log('[Pyth API] Request for coin:', coinUpper);
    
    // Handle USDC separately (always 1.0)
    if (coinUpper === 'USDC') {
      return NextResponse.json({
        prices: {
          USDC: 1.0
        },
        source: 'pyth',
        timestamp: Date.now()
      });
    }
    
    // Handle 'all' or fetch specific coin
    const coinsToFetch = coinUpper === 'ALL' 
      ? ['ETH', 'BTC', 'SOL', 'USDC']
      : [coinUpper];
    
    const prices: Record<string, number> = {};
    const errors: Record<string, string> = {};
    
    // Fetch prices for each coin
    for (const coinSymbol of coinsToFetch) {
      if (coinSymbol === 'USDC') {
        prices[coinSymbol] = 1.0;
        continue;
      }
      
      const priceId = PYTH_PRICE_FEED_IDS[coinSymbol];
      
      if (!priceId) {
        console.warn(`[Pyth API] No price feed ID found for: ${coinSymbol}`);
        errors[coinSymbol] = 'Price feed ID not found';
        continue;
      }
      
      if (priceId === '1.0') {
        prices[coinSymbol] = 1.0;
        continue;
      }
      
      const priceFeed = await fetchPythPriceFeed(priceId);
      
      if (priceFeed && priceFeed.price) {
        const actualPrice = convertPythPrice(priceFeed.price.price, priceFeed.price.expo);
        prices[coinSymbol] = actualPrice;
        
        console.log(`[Pyth API] ✓ ${coinSymbol} price:`, {
          price: actualPrice,
          confidence: convertPythPrice(priceFeed.price.conf, priceFeed.price.expo),
          publishTime: new Date(priceFeed.price.publish_time * 1000).toISOString(),
          rawPrice: priceFeed.price.price,
          expo: priceFeed.price.expo
        });
      } else {
        console.error(`[Pyth API] ✗ Failed to fetch price for ${coinSymbol}`);
        errors[coinSymbol] = 'Failed to fetch price feed';
      }
    }
    
    // If fetching all coins, ensure USDC is included
    if (coinUpper === 'ALL') {
      prices['USDC'] = 1.0;
    }
    
    // Return response
    const response: any = {
      prices,
      source: 'pyth',
      timestamp: Date.now()
    };
    
    if (Object.keys(errors).length > 0) {
      response.errors = errors;
    }
    
    // Verify we got at least one price
    if (Object.keys(prices).length === 0) {
      return NextResponse.json(
        { 
          error: 'Failed to fetch any prices',
          errors 
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('[Pyth API] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch price data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

