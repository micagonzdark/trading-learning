import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { MarketRules, Portfolio } from '../src/lib/types';
import { validateAndExecuteAgentDecision, applyStopLoss } from '../src/lib/simulation/rulesValidator';
import { evaluatePortfolio } from '../src/lib/simulation/engine';
import { runLigaScript } from './liga';

interface EvalResult {
  caso: string;
  descripcion: string;
  esperado: string;
  obtenido: string;
  paso: boolean;
}

const mockRules: MarketRules = {
  capitalInicialPorJugador: 1000,
  empresasPermitidas: ['MELI', 'SPOT', 'AAPL', 'MSFT', 'NVDA', 'DIS'],
  indiceReferencia: 'SPY',
  maxPorcentajePorEmpresa: 0.20, // 20%
  stopLossPorcentaje: 0.15,      // 15%
  minEfectivoPorcentaje: 0.10,   // 10%
  fechaInicio: '2026-10-14'
};

const mockPrices: Record<string, number> = {
  MELI: 1800.0,
  SPOT: 500.0,
  AAPL: 200.0,
  MSFT: 450.0,
  NVDA: 150.0,
  DIS: 100.0,
  SPY: 550.0
};

function getDirHash(dirPath: string): string {
  const files = ['reglas.json', 'carteras.json', 'precios.csv', 'diario.md'];
  const hash = crypto.createHash('sha256');
  for (const f of files) {
    const p = path.join(dirPath, f);
    if (fs.existsSync(p)) {
      hash.update(fs.readFileSync(p));
    }
  }
  return hash.digest('hex');
}

export async function runAllEvals(): Promise<EvalResult[]> {
  const results: EvalResult[] = [];

  // ----------------------------------------------------
  // Caso (a): Quiere comprar una empresa fuera de la lista: no compra.
  // ----------------------------------------------------
  {
    const initialPortfolio: Portfolio = { cash: 1000, positions: [], history: [] };
    const decision = {
      accion: 'comprar' as const,
      empresa: 'TSLA', // TSLA no está permitida
      cantidad: 1,
      motivo: 'Comprar Tesla por innovación'
    };
    const res = validateAndExecuteAgentDecision(initialPortfolio, decision, mockRules, { ...mockPrices, TSLA: 250 });
    const paso = !res.accepted && res.actionTaken === 'RECHAZADA' && res.portfolio.positions.length === 0;
    results.push({
      caso: '(a) Empresa no permitida',
      descripcion: 'El agente intenta comprar TSLA (fuera de la lista autorizada)',
      esperado: 'No compra, rechaza la operación',
      obtenido: res.accepted ? 'Compró erróneamente' : `Rechazada (${res.reason})`,
      paso
    });
  }

  // ----------------------------------------------------
  // Caso (b): La compra supera el máximo por empresa: compra menos o no compra.
  // ----------------------------------------------------
  {
    // Cartera de $1000 total. Máximo 20% = $200. NVDA cuesta $150.
    // Si intenta comprar 2 acciones ($300), superaría los $200 permitidos.
    // Debe comprar solo 1 acción ($150) o no comprar.
    const initialPortfolio: Portfolio = { cash: 1000, positions: [], history: [] };
    const decision = {
      accion: 'comprar' as const,
      empresa: 'NVDA',
      cantidad: 2, // 2 * $150 = $300 > $200 (20%)
      motivo: 'Invertir fuerte en NVDA'
    };
    const res = validateAndExecuteAgentDecision(initialPortfolio, decision, mockRules, mockPrices);
    const sharesBought = res.shares;
    const investedAmount = sharesBought * (mockPrices['NVDA'] || 150);
    const totalVal = evaluatePortfolio(res.portfolio, mockPrices).totalValue;
    const companyPct = (investedAmount / totalVal);

    const paso = companyPct <= 0.20 && (sharesBought === 1 || !res.accepted);
    results.push({
      caso: '(b) Supera máximo por empresa',
      descripcion: 'El agente solicita comprar 2 NVDA ($300, 30% del capital). Regla máxima: 20% ($200)',
      esperado: 'Compra menos (1 acción) o no compra para no exceder el 20%',
      obtenido: `Acciones compradas: ${sharesBought} (Exposición resultante: ${(companyPct * 100).toFixed(1)}%)`,
      paso
    });
  }

  // ----------------------------------------------------
  // Caso (c): No alcanza el efectivo: no compra.
  // ----------------------------------------------------
  {
    const initialPortfolio: Portfolio = { cash: 50, positions: [], history: [] };
    const decision = {
      accion: 'comprar' as const,
      empresa: 'DIS',
      cantidad: 1, // DIS cuesta $100 pero solo hay $50
      motivo: 'Comprar Disney'
    };
    const res = validateAndExecuteAgentDecision(initialPortfolio, decision, mockRules, mockPrices);
    const paso = !res.accepted && res.actionTaken === 'RECHAZADA' && res.portfolio.cash === 50;
    results.push({
      caso: '(c) Efectivo insuficiente',
      descripcion: 'El agente intenta comprar DIS ($100) teniendo solo $50 en caja',
      esperado: 'No compra, rechaza por falta de saldo',
      obtenido: res.accepted ? 'Compró indebidamente' : `Rechazada (${res.reason})`,
      paso
    });
  }

  // ----------------------------------------------------
  // Caso (d): Una posición baja más que la regla: vende.
  // ----------------------------------------------------
  {
    // Posición comprada a $100. Cae a $80 (caída del 20%, supera el stop loss del 15%)
    const initialPortfolio: Portfolio = {
      cash: 800,
      positions: [{ ticker: 'DIS', shares: 2, avgPrice: 100.0 }],
      history: []
    };
    const crashedPrices = { ...mockPrices, DIS: 80.0 };
    const stopLossResult = applyStopLoss(initialPortfolio, mockRules, crashedPrices);
    const hasDisPosition = stopLossResult.portfolio.positions.some(p => p.ticker === 'DIS');
    const paso = stopLossResult.triggered && !hasDisPosition && stopLossResult.orders.length === 1;

    results.push({
      caso: '(d) Stop-loss por caída',
      descripcion: 'Posición de DIS comprada a $100 cae a $80 (-20%). Límite stop-loss: 15%',
      esperado: 'Vende la posición automáticamente',
      obtenido: stopLossResult.triggered
        ? `Venta automática ejecutada (${stopLossResult.details[0]})`
        : 'No se ejecutó el stop-loss',
      paso
    });
  }

  // ----------------------------------------------------
  // Caso (e): Falta un precio: no opera con esa empresa.
  // ----------------------------------------------------
  {
    const initialPortfolio: Portfolio = { cash: 1000, positions: [], history: [] };
    const pricesWithoutMeli = { ...mockPrices };
    delete (pricesWithoutMeli as any).MELI;

    const decision = {
      accion: 'comprar' as const,
      empresa: 'MELI',
      cantidad: 1,
      motivo: 'Comprar MELI sin precio en el mercado'
    };
    const res = validateAndExecuteAgentDecision(initialPortfolio, decision, mockRules, pricesWithoutMeli);
    const paso = !res.accepted && res.actionTaken === 'RECHAZADA' && res.portfolio.positions.length === 0;

    results.push({
      caso: '(e) Falta de cotización',
      descripcion: 'Se solicita comprar MELI pero su precio no está disponible en la lista de cotizaciones',
      esperado: 'No opera con esa empresa, rechaza la orden',
      obtenido: res.accepted ? 'Operó sin precio' : `Rechazada (${res.reason})`,
      paso
    });
  }

  // ----------------------------------------------------
  // Caso (f): El modo escenario no modifica ningún archivo de data/.
  // ----------------------------------------------------
  {
    const realDataDir = path.join(process.cwd(), 'data');
    const beforeHash = getDirHash(realDataDir);

    // Correr modo escenario
    await runLigaScript({ escenario: 'baja12', silent: true });

    const afterHash = getDirHash(realDataDir);
    const paso = beforeHash === afterHash;

    results.push({
      caso: '(f) Modo escenario inocuo',
      descripcion: 'Ejecutar script en modo escenario "baja12"',
      esperado: 'No modifica ningún archivo real en la carpeta data/',
      obtenido: paso
        ? `Hashes coinciden exactamente (${beforeHash.substring(0, 8)}... == ${afterHash.substring(0, 8)}...)`
        : 'ERROR: Los archivos reales de data/ sufrieron modificaciones',
      paso
    });
  }

  // ----------------------------------------------------
  // Caso (g): El efectivo nunca queda por debajo del mínimo (10%).
  // ----------------------------------------------------
  {
    // Cartera total $1000. Regla min 10% = $100 en efectivo siempre.
    // Si intenta comprar 6 acciones de NVDA ($150 cada una = $900),
    // dejaría solo $100 - comisiones = ~$98 (< 10%).
    // El validador debe restringir la compra a un número que deje >= $100.
    const initialPortfolio: Portfolio = { cash: 1000, positions: [], history: [] };
    const decision = {
      accion: 'comprar' as const,
      empresa: 'DIS',
      cantidad: 10, // DIS $100 -> gastaría $1000 dejando $0
      motivo: 'Gastar todo el efectivo'
    };
    const res = validateAndExecuteAgentDecision(initialPortfolio, decision, mockRules, mockPrices);
    const finalCash = res.portfolio.cash;
    const finalEval = evaluatePortfolio(res.portfolio, mockPrices);
    const cashPercent = (finalCash / finalEval.totalValue);

    const paso = cashPercent >= 0.099; // 10%
    results.push({
      caso: '(g) Reserva mínima de efectivo',
      descripcion: 'El agente intenta gastar todo el efectivo en compras masivas',
      esperado: 'Efectivo nunca queda por debajo del 10% mínimo ($100)',
      obtenido: `Efectivo resultante: $${finalCash.toFixed(2)} (${(cashPercent * 100).toFixed(1)}% del valor total)`,
      paso
    });
  }

  return results;
}

// Ejecución directa por CLI
if (require.main === module || process.argv[1]?.includes('evals')) {
  runAllEvals()
    .then((results) => {
      console.log('\n===============================================================');
      console.log('                 RESULTADOS DE LA SUITE DE EVALS                ');
      console.log('===============================================================\n');

      let allPassed = true;
      for (const r of results) {
        const icon = r.paso ? '✅ PASÓ' : '❌ FALLÓ';
        if (!r.paso) allPassed = false;
        console.log(`${icon} | ${r.caso}`);
        console.log(`   Descripción: ${r.descripcion}`);
        console.log(`   Esperado   : ${r.esperado}`);
        console.log(`   Obtenido   : ${r.obtenido}\n`);
      }

      console.log('---------------------------------------------------------------');
      console.log(`ESTADO FINAL: ${allPassed ? 'TODOS LOS EVALS APROBADOS (7/7)' : 'HAY EVALS FALLIDOS'}`);
      console.log('===============================================================\n');

      if (!allPassed) process.exit(1);
    })
    .catch((err) => {
      console.error('Error fatal al ejecutar los evals:', err);
      process.exit(1);
    });
}
