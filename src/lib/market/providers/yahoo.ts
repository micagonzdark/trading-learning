import { Price } from '../../types';

export interface TickerData {
  ticker: string;
  price: number;
  changePercent: number;
  date: string;
  source: 'yahoo' | 'stooq' | 'fallback';
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
        // Revalidar cada 30 segundos
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
        // Pausa breve antes de reintentar
        await new Promise((res) => setTimeout(res, 1000));
        continue;
      }
      console.warn(`[Yahoo] Error al consultar ${ticker} (intento ${attempt + 1}/${retries + 1}):`, err);
    }
  }

  // Plan B: Intentar Stooq como proveedor alternativo
  const stooqData = await getStooqPrice(cleanTicker);
  if (stooqData) return stooqData;

  return null;
}

/**
 * Plan B: Proveedor alternativo Stooq (CSV diario)
 */
export async function getStooqPrice(ticker: string): Promise<TickerData | null> {
  const cleanTicker = ticker.trim().toLowerCase();
  // En Stooq las acciones de EEUU llevan sufijo .us
  const stooqSymbol = cleanTicker.endsWith('.us') ? cleanTicker : `${cleanTicker}.us`;
  const url = `https://stooq.com/q/l/?s=${stooqSymbol}&f=sd2t2ohlcv&h&e=csv`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Accept': 'text/csv'
      }
    });

    if (!response.ok) return null;
    const text = await response.text();
    const lines = text.trim().split('\n');
    if (lines.length >= 2) {
      const parts = lines[1].split(',');
      // Formato: Symbol,Date,Time,Open,High,Low,Close,Volume
      if (parts.length >= 7) {
        const close = parseFloat(parts[6]);
        if (!isNaN(close) && close > 0) {
          return {
            ticker: ticker.toUpperCase(),
            price: Number(close.toFixed(2)),
            changePercent: 0,
            date: parts[1] || new Date().toISOString().split('T')[0],
            source: 'stooq'
          };
        }
      }
    }
  } catch (err) {
    // Stooq falló silenciosamente
  }
  return null;
}

/**
 * Trae precios para una lista de tickers
 */
export async function getMultiplePrices(tickers: string[]): Promise<Record<string, TickerData>> {
  const results: Record<string, TickerData> = {};
  const promises = tickers.map(async (t) => {
    const data = await getYahooPrice(t);
    if (data) {
      results[t.toUpperCase()] = data;
    }
  });
  await Promise.all(promises);
  return results;
}
