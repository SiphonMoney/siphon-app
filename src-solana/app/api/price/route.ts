import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const coin = searchParams.get('coin') || 'all';
    const days = searchParams.get('days') || '1';
    
    // Coin mapping to CoinGecko IDs
    const coinMap: Record<string, string> = {
      'ETH': 'ethereum',
      'USDC': 'usd-coin',
      'SOL': 'solana',
      'BTC': 'bitcoin',
      'all': 'ethereum,usd-coin,solana,bitcoin'
    };
    
    const coinId = coinMap[coin.toUpperCase()] || coinMap['all'];
    
    if (coin === 'all' || !coin) {
      // Fetch simple price for all coins
      const apiUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`;
      console.log('[API] Fetching prices from CoinGecko:', apiUrl);
      
      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[API] CoinGecko API error:', response.status, errorText);
        throw new Error(`Failed to fetch price data: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[API] Raw CoinGecko response:', JSON.stringify(data, null, 2));
      
      // Transform to our format
      const prices: Record<string, number> = {
        'ETH': data.ethereum?.usd || 0,
        'USDC': data['usd-coin']?.usd || 1,
        'SOL': data.solana?.usd || 0,
        'BTC': data.bitcoin?.usd || 0,
      };
      
      // Log prices for debugging
      console.log('[API] Transformed prices:', {
        ETH: prices.ETH,
        USDC: prices.USDC,
        SOL: prices.SOL,
        BTC: prices.BTC,
        ethereumData: data.ethereum,
        usdCoinData: data['usd-coin']
      });
      
      // Verify Ethereum price
      if (prices.ETH > 0) {
        console.log('[API] ✓ Ethereum price successfully fetched:', prices.ETH, 'USD');
      } else {
        console.error('[API] ✗ Ethereum price is missing or zero!', {
          ethereumData: data.ethereum,
          allData: data
        });
      }
      
      return NextResponse.json({ prices });
    } else {
      // Fetch market chart for specific coin
      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`,
        {
          headers: {
            'Accept': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch price data');
      }
      
      const data = await response.json();
      return NextResponse.json(data);
    }
  } catch (error) {
    console.error('Error fetching price data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch price data' },
      { status: 500 }
    );
  }
}

