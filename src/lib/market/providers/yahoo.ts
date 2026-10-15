import { Price } from '../../types';

export interface TickerData {
  ticker: string;
  price: number;
  changePercent: number;
  date: string;
  source: 'yahoo' | 'stooq' | 'cache';
}

/**
 * Trae cotización actual y cierre anterior de Yahoo Finance chart API.
 * Ejecuta únicamente en entorno Node/Servidor para evitar CORS.
 * Si falla Yahoo tras los reintentos, consulta Stooq como plan B.
 * Si ambos fallan, retorna null (NUNCA precios inventados).
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
      console.warn(`[Mercado] Yahoo Finance no respondió para ${ticker}. Intentando plan B (Stooq)...`);
    }
  }

  // Plan B: Intentar Stooq como proveedor alternativo
  const stooqData = await getStooqPrice(cleanTicker);
  if (stooqData) {
    return stooqData;
  }

  // Si ambos fallaron, retornar null. NUNCA inventar precios.
  console.warn(`[Mercado] ⚠️ No se pudo obtener cotización real para ${ticker} ni con Yahoo ni con Stooq. Se omitirá.`);
  return null;
}

/**
 * Plan B: Proveedor alternativo Stooq (CSV histórico diario)
 * Endpoint: https://stooq.com/q/d/l/?s=TICKER.US&i=d
 * Si falla, retorna null.
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
      // Si Stooq devuelve página de bloqueo o HTML en vez de CSV, rechazar
      if (text.includes('Access denied') || text.includes('Wybrana lokalizacja') || text.includes('<html') || text.includes('<meta')) {
        return null;
      }

      const lines = text.trim().split('\n');
      // Formato CSV Stooq: Date,Open,High,Low,Close,Volume
      if (lines.length >= 2) {
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

  return null;
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
