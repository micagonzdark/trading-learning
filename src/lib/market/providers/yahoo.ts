import { Price } from '../../types';

export interface TickerData {
  ticker: string;
  price: number;
  changePercent: number;
  date: string;
  source: 'yahoo' | 'stooq' | 'cache' | 'fallback';
}

/**
 * Trae cotización actual y cierre anterior de Yahoo Finance chart API.
 * Ejecuta únicamente en entorno Node/Servidor para evitar CORS.
 */
export async function getYahooPrice(ticker: string, retries: number = 1): Promise<TickerData | null> {
  const cleanTicker = ticker.trim().toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${cleanTicker}?interval=1d&range=5d`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        },
        next: { revalidate: 30 }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta || typeof meta.regularMarketPrice !== 'number') {
        throw new Error(`Datos inválidos para ${ticker}`);
      }

      const regularMarketPrice = meta.regularMarketPrice;
      const previousClose = meta.chartPreviousClose || meta.previousClose || regularMarketPrice;
      const changePercent = previousClose > 0 
        ? ((regularMarketPrice - previousClose) / previousClose) * 100 
        : 0;

      const dateStr = new Date().toISOString().split('T')[0];

      return {
        ticker: cleanTicker,
        price: Number(regularMarketPrice.toFixed(2)),
        changePercent: Number(changePercent.toFixed(2)),
        date: dateStr,
        source: 'yahoo'
      };
    } catch (err) {
      if (attempt < retries) {
        await new Promise((res) => setTimeout(res, 800));
        continue;
      }
      console.warn(`[Yahoo] No se pudo obtener ${ticker} tras ${retries + 1} intentos. Activando plan B (Stooq)...`);
    }
  }

  // Plan B: Intentar Stooq como proveedor alternativo
  return await getStooqPrice(cleanTicker);
}

/**
 * Plan B: Proveedor alternativo Stooq (CSV histórico diario)
 * Endpoint: https://stooq.com/q/d/l/?s=TICKER.US&i=d
 */
export async function getStooqPrice(ticker: string): Promise<TickerData | null> {
  const cleanTicker = ticker.trim().toLowerCase();
  const stooqSymbol = cleanTicker.endsWith('.us') ? cleanTicker : `${cleanTicker}.us`;
  const url = `https://stooq.com/q/d/l/?s=${stooqSymbol}&i=d`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/csv,text/plain,*/*',
        'Referer': 'https://stooq.com/'
      },
      signal: AbortSignal.timeout(4000)
    });

    if (response.ok) {
      const text = await response.text();
      const lines = text.trim().split('\n');
      // Formato CSV Stooq: Date,Open,High,Low,Close,Volume
      if (lines.length >= 2 && !text.includes('Access denied') && !text.includes('Wybrana lokalizacja')) {
        const lastLine = lines[1].split(',');
        if (lastLine.length >= 5) {
          const closePrice = parseFloat(lastLine[4]);
          if (!isNaN(closePrice) && closePrice > 0) {
            return {
              ticker: ticker.toUpperCase(),
              price: Number(closePrice.toFixed(2)),
              changePercent: 0,
              date: lastLine[0] || new Date().toISOString().split('T')[0],
              source: 'stooq'
            };
          }
        }
      }
    }
  } catch (err) {
    // Stooq falló o timeout
  }

  // Si Stooq es bloqueado por IP o captcha, proveer fallback referencial con aviso
  return getOfflineFallbackPrice(ticker.toUpperCase());
}

/**
 * Valores de referencia offline en caso de caída simultánea de Yahoo y Stooq
 */
export function getOfflineFallbackPrice(ticker: string): TickerData {
  const fallbacks: Record<string, number> = {
    MELI: 1840.0,
    SPOT: 525.0,
    AAPL: 340.0,
    MSFT: 535.0,
    NVDA: 220.0,
    DIS: 110.0,
    SPY: 770.0
  };
  const price = fallbacks[ticker] || 100.0;
  return {
    ticker,
    price,
    changePercent: 0,
    date: new Date().toISOString().split('T')[0],
    source: 'fallback'
  };
}

/**
 * Trae precios para una lista de tickers usando el proveedor preferido ('yahoo' o 'stooq')
 */
export async function getMultiplePrices(
  tickers: string[],
  preferredProvider: 'yahoo' | 'stooq' = 'yahoo'
): Promise<Record<string, TickerData>> {
  const results: Record<string, TickerData> = {};
  const promises = tickers.map(async (t) => {
    let data: TickerData | null = null;
    if (preferredProvider === 'stooq') {
      data = await getStooqPrice(t);
    } else {
      data = await getYahooPrice(t);
    }
    if (data) {
      results[t.toUpperCase()] = data;
    }
  });
  await Promise.all(promises);
  return results;
}
