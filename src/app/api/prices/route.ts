import { NextResponse } from 'next/server';
import assets from '@/data/assets.json';
import { getMultiplePrices } from '@/lib/market/providers/yahoo';

export async function GET() {
  try {
    const tickers = assets.map((a) => a.ticker);
    const prices = await getMultiplePrices(tickers);
    return NextResponse.json({ success: true, prices });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Error desconocido al obtener precios';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
