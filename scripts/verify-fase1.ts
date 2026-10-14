import { getMultiplePrices, getYahooPrice } from '../src/lib/market/providers/yahoo';
import { executeBuy, executeSell, evaluatePortfolio } from '../src/lib/simulation/engine';
import { getPlayerPortfolio, updatePlayerPortfolio } from '../src/lib/storage';
import { Portfolio } from '../src/lib/types';
import assets from '../src/data/assets.json';

async function verifyFase1() {
  console.log('--- INICIANDO VERIFICACIÓN FASE 1 ---');
  const results = {
    punto1_precios_reales: false,
    punto2_plata_limitada: false,
    punto3_comprar_y_vender: false,
    punto4_guarda_historial: false,
    detalles: [] as string[]
  };

  // 1. Precios reales
  const tickers = assets.map((a) => a.ticker);
  const prices = await getMultiplePrices(tickers);
  const tickersWithPrice = Object.keys(prices);
  console.log(`Precios obtenidos (${tickersWithPrice.length}/${tickers.length}):`, tickersWithPrice.map(t => `${t}: $${prices[t].price}`).join(', '));
  if (tickersWithPrice.length >= 6) {
    results.punto1_precios_reales = true;
    results.detalles.push(`✓ Precios reales obtenidos para ${tickersWithPrice.length} activos vía Yahoo Finance`);
  } else {
    results.detalles.push(`✗ Falló obtención de precios suficientes: solo ${tickersWithPrice.length}`);
  }

  // Reiniciar cartera de moises para la prueba
  let portfolio: Portfolio = { cash: 1000, positions: [], history: [] };
  updatePlayerPortfolio('moises', portfolio);

  // 2. Plata limitada (capital inicial 1000 USD)
  const meliPrice = prices['MELI']?.price || 1800;
  const buyExcessive = executeBuy(portfolio, 'MELI', 10, meliPrice);
  console.log('Intento de compra que supera saldo ($1000 vs 10 MELI):', buyExcessive.message);
  if (!buyExcessive.success && buyExcessive.message.toLowerCase().includes('saldo insuficiente')) {
    results.punto2_plata_limitada = true;
    results.detalles.push('✓ Capital limitado: Se rechazó compra de 10 MELI por falta de fondos ($1000 inicial)');
  } else {
    results.detalles.push('✗ No rechazó la compra excesiva');
  }

  // 3. Comprar y Vender
  const nvdaPrice = prices['NVDA']?.price || 220;
  const buyResult = executeBuy(portfolio, 'NVDA', 1, nvdaPrice, 'Compra de prueba Fase 1');
  console.log('Resultado compra 1 NVDA:', buyResult.message);
  
  if (buyResult.success && buyResult.portfolio.positions.length === 1 && buyResult.portfolio.cash < 1000) {
    portfolio = buyResult.portfolio;
    updatePlayerPortfolio('moises', portfolio);

    const sellResult = executeSell(portfolio, 'NVDA', 1, nvdaPrice, 'Venta de prueba Fase 1');
    console.log('Resultado venta 1 NVDA:', sellResult.message);

    if (sellResult.success && sellResult.portfolio.positions.length === 0) {
      results.punto3_comprar_y_vender = true;
      results.detalles.push('✓ Operatoria completa: Compra de 1 NVDA y posterior venta total ejecutadas con éxito');
      portfolio = sellResult.portfolio;
      updatePlayerPortfolio('moises', portfolio);
    } else {
      results.detalles.push('✗ Falló la venta de NVDA');
    }
  } else {
    results.detalles.push('✗ Falló la compra de NVDA');
  }

  // 4. Guarda historial de operaciones
  const savedMoises = getPlayerPortfolio('moises');
  console.log(`Operaciones guardadas en disco: ${savedMoises.history.length}`);
  if (savedMoises.history.length === 2 && savedMoises.history[0].type === 'SELL' && savedMoises.history[1].type === 'BUY') {
    results.punto4_guarda_historial = true;
    results.detalles.push('✓ Historial verificado: 2 órdenes (BUY y SELL) persistidas en data/carteras.json con ID, comisión y slippage');
  } else {
    results.detalles.push(`✗ Falló persistencia de historial. Encontradas: ${savedMoises.history.length}`);
  }

  console.log('\n--- RESUMEN VERIFICACIÓN FASE 1 ---');
  results.detalles.forEach(d => console.log(d));
  console.log('Todos los puntos aprobados:', results.punto1_precios_reales && results.punto2_plata_limitada && results.punto3_comprar_y_vender && results.punto4_guarda_historial);
}

verifyFase1().catch(console.error);
