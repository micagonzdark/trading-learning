/**
 * Proveedor gratuito de noticias financieras mediante RSS de Google News.
 * No requiere API key ni tarjetas de crédito.
 */
export async function getRecentNewsForTickers(tickers: string[], maxPerTicker = 2): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};

  for (const ticker of tickers) {
    try {
      const url = `https://news.google.com/rss/search?q=${ticker}+stock+when:3d&hl=en-US&gl=US&ceid=US:en`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(3500) // Timeout de 3.5 segundos para no demorar la corrida
      });

      if (!res.ok) {
        result[ticker] = [];
        continue;
      }

      const xml = await res.text();
      // Extraer títulos del RSS
      const titles = [...xml.matchAll(/<title>(.*?)<\/title>/g)]
        .map((m) => m[1])
        .filter((t) => t && !t.includes('Google News'))
        .slice(0, maxPerTicker)
        .map((t) => t.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim());

      result[ticker] = titles;
    } catch (err) {
      // Si falla, continuamos sin noticias para ese activo
      result[ticker] = [];
    }
  }

  return result;
}
