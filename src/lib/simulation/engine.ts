import { Order, Portfolio, Position } from '../types';
import { calculateCommission, calculateSlippage, RealismConfig, DEFAULT_REALISM_CONFIG } from './realism';

export interface ExecutionResult {
  success: boolean;
  message: string;
  order?: Order;
  portfolio: Portfolio;
}

/**
 * Genera un ID único para cada orden
 */
function generateOrderId(): string {
  return 'ord_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
}

/**
 * Ejecuta una orden de compra a mercado.
 * - Aplica slippage y comisiones
 * - Calcula el Precio Promedio Ponderado (PPP) de la posición
 * - Rechaza si el saldo en efectivo es insuficiente
 */
export function executeBuy(
  portfolio: Portfolio,
  ticker: string,
  shares: number,
  marketPrice: number,
  reason?: string,
  config: RealismConfig = DEFAULT_REALISM_CONFIG
): ExecutionResult {
  const cleanTicker = ticker.trim().toUpperCase();

  if (shares <= 0 || !Number.isInteger(shares)) {
    return {
      success: false,
      message: `La cantidad de acciones debe ser un número entero mayor a 0 (recibido: ${shares})`,
      portfolio
    };
  }

  if (marketPrice <= 0) {
    return {
      success: false,
      message: `El precio de mercado debe ser mayor a 0 (recibido: ${marketPrice})`,
      portfolio
    };
  }

  const { executedPrice, slippagePerShare } = calculateSlippage(marketPrice, 'BUY', config);
  const grossAmount = shares * executedPrice;
  const commission = calculateCommission(grossAmount, config);
  const totalCost = Number((grossAmount + commission).toFixed(2));

  // Validación de saldo
  if (portfolio.cash < totalCost) {
    return {
      success: false,
      message: `Saldo insuficiente: se requieren $${totalCost.toFixed(2)} USD (incluye comisión $${commission.toFixed(2)}) pero el saldo disponible es $${portfolio.cash.toFixed(2)} USD`,
      portfolio
    };
  }

  // Clonar cartera para no mutar inesperadamente
  const updatedCash = Number((portfolio.cash - totalCost).toFixed(2));
  const existingPositionIndex = portfolio.positions.findIndex((p) => p.ticker === cleanTicker);
  const newPositions: Position[] = [...portfolio.positions];

  if (existingPositionIndex >= 0) {
    const existing = portfolio.positions[existingPositionIndex];
    const totalShares = existing.shares + shares;
    // Cálculo de Precio Promedio Ponderado (PPP)
    const totalInvested = (existing.shares * existing.avgPrice) + (shares * executedPrice);
    const newAvgPrice = Number((totalInvested / totalShares).toFixed(2));

    newPositions[existingPositionIndex] = {
      ticker: cleanTicker,
      shares: totalShares,
      avgPrice: newAvgPrice
    };
  } else {
    newPositions.push({
      ticker: cleanTicker,
      shares,
      avgPrice: executedPrice
    });
  }

  const order: Order = {
    id: generateOrderId(),
    timestamp: new Date().toISOString(),
    ticker: cleanTicker,
    type: 'BUY',
    shares,
    price: marketPrice,
    executedPrice,
    commission,
    slippage: Number((slippagePerShare * shares).toFixed(2)),
    totalCost,
    reason: reason || 'Compra ejecutada'
  };

  const updatedPortfolio: Portfolio = {
    cash: updatedCash,
    positions: newPositions,
    history: [order, ...portfolio.history]
  };

  return {
    success: true,
    message: `Compra ejecutada: ${shares} ${cleanTicker} a $${executedPrice} USD (Total: $${totalCost.toFixed(2)} USD)`,
    order,
    portfolio: updatedPortfolio
  };
}

/**
 * Ejecuta una orden de venta a mercado.
 * - Aplica slippage y comisiones
 * - Reduce o elimina la posición
 * - Rechaza si no posee suficientes acciones
 */
export function executeSell(
  portfolio: Portfolio,
  ticker: string,
  shares: number,
  marketPrice: number,
  reason?: string,
  config: RealismConfig = DEFAULT_REALISM_CONFIG
): ExecutionResult {
  const cleanTicker = ticker.trim().toUpperCase();

  if (shares <= 0 || !Number.isInteger(shares)) {
    return {
      success: false,
      message: `La cantidad a vender debe ser un número entero mayor a 0 (recibido: ${shares})`,
      portfolio
    };
  }

  if (marketPrice <= 0) {
    return {
      success: false,
      message: `El precio de mercado debe ser mayor a 0 (recibido: ${marketPrice})`,
      portfolio
    };
  }

  const existingPositionIndex = portfolio.positions.findIndex((p) => p.ticker === cleanTicker);
  if (existingPositionIndex < 0) {
    return {
      success: false,
      message: `No posees ninguna posición en ${cleanTicker} para vender`,
      portfolio
    };
  }

  const existing = portfolio.positions[existingPositionIndex];
  if (existing.shares < shares) {
    return {
      success: false,
      message: `Posición insuficiente en ${cleanTicker}: posees ${existing.shares} acciones pero intentaste vender ${shares}`,
      portfolio
    };
  }

  const { executedPrice, slippagePerShare } = calculateSlippage(marketPrice, 'SELL', config);
  const grossAmount = shares * executedPrice;
  const commission = calculateCommission(grossAmount, config);
  const netProceeds = Number((grossAmount - commission).toFixed(2));

  const updatedCash = Number((portfolio.cash + netProceeds).toFixed(2));
  const newPositions: Position[] = [...portfolio.positions];
  const remainingShares = existing.shares - shares;

  if (remainingShares === 0) {
    // Venta total de la posición
    newPositions.splice(existingPositionIndex, 1);
  } else {
    // Venta parcial: el PPP se mantiene inalterado
    newPositions[existingPositionIndex] = {
      ...existing,
      shares: remainingShares
    };
  }

  const order: Order = {
    id: generateOrderId(),
    timestamp: new Date().toISOString(),
    ticker: cleanTicker,
    type: 'SELL',
    shares,
    price: marketPrice,
    executedPrice,
    commission,
    slippage: Number((slippagePerShare * shares).toFixed(2)),
    totalCost: netProceeds,
    reason: reason || 'Venta ejecutada'
  };

  const updatedPortfolio: Portfolio = {
    cash: updatedCash,
    positions: newPositions,
    history: [order, ...portfolio.history]
  };

  return {
    success: true,
    message: `Venta ejecutada: ${shares} ${cleanTicker} a $${executedPrice} USD (Ingreso neto: $${netProceeds.toFixed(2)} USD)`,
    order,
    portfolio: updatedPortfolio
  };
}

/**
 * Valúa la cartera total en base a precios actuales de mercado.
 */
export function evaluatePortfolio(
  portfolio: Portfolio,
  prices: Record<string, number>
) {
  let positionsValue = 0;
  const positionsWithPnL = portfolio.positions.map((pos) => {
    const currentPrice = prices[pos.ticker] || pos.avgPrice;
    const marketVal = Number((pos.shares * currentPrice).toFixed(2));
    const costBasis = Number((pos.shares * pos.avgPrice).toFixed(2));
    const unrealizedPnL = Number((marketVal - costBasis).toFixed(2));
    const unrealizedPnLPercent = costBasis > 0 ? Number(((unrealizedPnL / costBasis) * 100).toFixed(2)) : 0;

    positionsValue += marketVal;

    return {
      ticker: pos.ticker,
      shares: pos.shares,
      avgPrice: pos.avgPrice,
      currentPrice,
      marketValue: marketVal,
      unrealizedPnL,
      unrealizedPnLPercent
    };
  });

  const totalValue = Number((portfolio.cash + positionsValue).toFixed(2));

  return {
    cash: portfolio.cash,
    positionsValue: Number(positionsValue.toFixed(2)),
    totalValue,
    positionsWithPnL
  };
}
