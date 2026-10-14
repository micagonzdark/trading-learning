import { NextRequest, NextResponse } from 'next/server';
import { getPlayerPortfolio, updatePlayerPortfolio } from '@/lib/storage';
import { executeSell } from '@/lib/simulation/engine';
import { getYahooPrice } from '@/lib/market/providers/yahoo';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticker, shares, player = 'moises', reason } = body;

    if (!ticker || !shares) {
      return NextResponse.json(
        { success: false, message: 'Faltan parámetros: ticker y shares son obligatorios' },
        { status: 400 }
      );
    }

    const priceData = await getYahooPrice(ticker);
    if (!priceData || !priceData.price) {
      return NextResponse.json(
        { success: false, message: `No se pudo obtener la cotización en vivo de ${ticker}` },
        { status: 502 }
      );
    }

    const portfolio = getPlayerPortfolio(player);
    const result = executeSell(portfolio, ticker, Number(shares), priceData.price, reason);

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: 400 }
      );
    }

    // Persistir el cambio en data/carteras.json
    updatePlayerPortfolio(player, result.portfolio);

    return NextResponse.json({
      success: true,
      message: result.message,
      order: result.order,
      portfolio: result.portfolio
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Error interno al procesar la venta';
    return NextResponse.json(
      { success: false, message: errorMessage },
      { status: 500 }
    );
  }
}
