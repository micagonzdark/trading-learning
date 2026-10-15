import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getRules, getPortfolios, getDataDirectory } from '@/lib/storage';
import { evaluatePortfolio } from '@/lib/simulation/engine';
import { getMultiplePrices } from '@/lib/market/providers/yahoo';

export async function GET() {
  try {
    const dataDir = getDataDirectory();
    const rules = getRules(dataDir);
    const portfolios = getPortfolios(dataDir);

    // 1. Obtener precios actuales
    const tickers = [...rules.empresasPermitidas, rules.indiceReferencia];
    const priceData = await getMultiplePrices(tickers);
    const currentPrices: Record<string, number> = {};
    for (const [t, d] of Object.entries(priceData)) {
      currentPrices[t] = d.price;
    }

    // 2. Valuación actual de cada jugador
    const evalMoises = evaluatePortfolio(portfolios.moises, currentPrices);
    const evalAgente = evaluatePortfolio(portfolios.agente, currentPrices);
    const evalIndice = evaluatePortfolio(portfolios.indice, currentPrices);

    const standings = [
      {
        nombre: 'Moisés (Alumno)',
        id: 'moises',
        valorTotal: evalMoises.totalValue,
        efectivo: evalMoises.cash,
        valorPosiciones: evalMoises.positionsValue,
        rendimientoPct: Number((((evalMoises.totalValue - 1000) / 1000) * 100).toFixed(2)),
        rendimientoUsd: Number((evalMoises.totalValue - 1000).toFixed(2)),
        base100: Number(((evalMoises.totalValue / 1000) * 100).toFixed(2)),
        posiciones: evalMoises.positionsWithPnL
      },
      {
        nombre: 'Agente IA',
        id: 'agente',
        valorTotal: evalAgente.totalValue,
        efectivo: evalAgente.cash,
        valorPosiciones: evalAgente.positionsValue,
        rendimientoPct: Number((((evalAgente.totalValue - 1000) / 1000) * 100).toFixed(2)),
        rendimientoUsd: Number((evalAgente.totalValue - 1000).toFixed(2)),
        base100: Number(((evalAgente.totalValue / 1000) * 100).toFixed(2)),
        posiciones: evalAgente.positionsWithPnL
      },
      {
        nombre: 'Índice de Referencia (SPY)',
        id: 'indice',
        valorTotal: evalIndice.totalValue,
        efectivo: evalIndice.cash,
        valorPosiciones: evalIndice.positionsValue,
        rendimientoPct: Number((((evalIndice.totalValue - 1000) / 1000) * 100).toFixed(2)),
        rendimientoUsd: Number((evalIndice.totalValue - 1000).toFixed(2)),
        base100: Number(((evalIndice.totalValue / 1000) * 100).toFixed(2)),
        posiciones: evalIndice.positionsWithPnL
      }
    ].sort((a, b) => b.valorTotal - a.valorTotal);

    // 3. Leer diario.md
    const diaryPath = path.join(dataDir, 'diario.md');
    const diaryContent = fs.existsSync(diaryPath)
      ? fs.readFileSync(diaryPath, 'utf-8')
      : 'No hay entradas registradas aún en el diario.';

    // 4. Leer precios.csv e inferir historial de curva base 100
    const csvPath = path.join(dataDir, 'precios.csv');
    let csvLines: string[] = [];
    if (fs.existsSync(csvPath)) {
      csvLines = fs.readFileSync(csvPath, 'utf-8').trim().split('\n').filter(Boolean);
    }

    // Curva histórica base 100
    // Siempre inicia en fechaInicio con base 100
    const timeline = [
      {
        fecha: rules.fechaInicio,
        moises: 100.0,
        agente: 100.0,
        indice: 100.0,
        tipo: 'real'
      }
    ];

    // Si hay datos actuales, añadimos el punto actual
    timeline.push({
      fecha: new Date().toISOString().split('T')[0],
      moises: Number(((evalMoises.totalValue / 1000) * 100).toFixed(2)),
      agente: Number(((evalAgente.totalValue / 1000) * 100).toFixed(2)),
      indice: Number(((evalIndice.totalValue / 1000) * 100).toFixed(2)),
      tipo: 'real'
    });

    return NextResponse.json({
      success: true,
      rules,
      standings,
      timeline,
      diaryContent,
      csvRowCount: Math.max(0, csvLines.length - 1)
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al cargar datos de la liga';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
