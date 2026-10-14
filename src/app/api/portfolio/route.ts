import { NextRequest, NextResponse } from 'next/server';
import { getPlayerPortfolio } from '@/lib/storage';
import { evaluatePortfolio } from '@/lib/simulation/engine';
import { getMultiplePrices } from '@/lib/market/providers/yahoo';
import assets from '@/data/assets.json';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const player = searchParams.get('player') || 'moises';

    const portfolio = getPlayerPortfolio(player);
    const tickers = assets.map((a) => a.ticker);
    const priceData = await getMultiplePrices(tickers);

    const priceMap: Record<string, number> = {};
    for (const [t, data] of Object.entries(priceData)) {
      priceMap[t] = data.price;
    }

    const evaluation = evaluatePortfolio(portfolio, priceMap);

    return NextResponse.json({
      success: true,
      player,
      portfolio,
      evaluation
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Error al obtener la cartera';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
