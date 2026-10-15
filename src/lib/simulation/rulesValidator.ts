import { MarketRules, Portfolio, AgentDecision, Order } from '../types';
import { executeBuy, executeSell, evaluatePortfolio } from './engine';

export interface ValidationResult {
  accepted: boolean;
  actionTaken: 'COMPRA' | 'VENTA' | 'ESPERA' | 'RECHAZADA';
  shares: number;
  ticker: string;
  reason: string;
  executedOrder?: Order;
  portfolio: Portfolio;
}

export interface StopLossResult {
  triggered: boolean;
  orders: Order[];
  portfolio: Portfolio;
  details: string[];
}

/**
 * Aplica la regla de Stop-Loss automática:
 * Si una posición cayó un 15% o más respecto a su precio de compra ponderado (PPP), se vende automáticamente.
 */
export function applyStopLoss(
  portfolio: Portfolio,
  rules: MarketRules,
  prices: Record<string, number>
): StopLossResult {
  let currentPortfolio = { ...portfolio, positions: [...portfolio.positions], history: [...portfolio.history] };
  const orders: Order[] = [];
  const details: string[] = [];

  for (const pos of portfolio.positions) {
    const currentPrice = prices[pos.ticker];
    if (typeof currentPrice !== 'number' || currentPrice <= 0) {
      continue;
    }

    const dropRatio = (currentPrice - pos.avgPrice) / pos.avgPrice;
    // Si la caída es mayor o igual a stopLossPorcentaje (ej: -0.15)
    if (dropRatio <= -rules.stopLossPorcentaje) {
      const dropPct = (Math.abs(dropRatio) * 100).toFixed(2);
      const reason = `Stop-Loss automático: posición cayó ${dropPct}% (límite regla: ${(rules.stopLossPorcentaje * 100).toFixed(0)}%)`;
      const sellResult = executeSell(currentPortfolio, pos.ticker, pos.shares, currentPrice, reason);

      if (sellResult.success && sellResult.order) {
        currentPortfolio = sellResult.portfolio;
        orders.push(sellResult.order);
        details.push(`Stop-Loss ejecutado para ${pos.shares} ${pos.ticker} a $${currentPrice} (caída: -${dropPct}%)`);
      }
    }
  }

  return {
    triggered: orders.length > 0,
    orders,
    portfolio: currentPortfolio,
    details
  };
}

/**
 * Valida la propuesta del modelo de IA contra las reglas de la liga y ejecuta la orden si es conforme.
 */
export function validateAndExecuteAgentDecision(
  portfolio: Portfolio,
  decision: AgentDecision,
  rules: MarketRules,
  prices: Record<string, number>
): ValidationResult {
  const cleanTicker = (decision.empresa || '').trim().toUpperCase();
  const accion = (decision.accion || '').trim().toLowerCase();
  const requestedShares = Math.floor(Number(decision.cantidad) || 0);

  // 1. Caso ESPERAR
  if (accion === 'esperar' || requestedShares <= 0) {
    return {
      accepted: true,
      actionTaken: 'ESPERA',
      shares: 0,
      ticker: cleanTicker,
      reason: decision.motivo || 'El agente decidió no realizar operaciones esta semana.',
      portfolio
    };
  }

  // 2. Caso VENDER
  if (accion === 'vender') {
    const currentPrice = prices[cleanTicker];
    if (typeof currentPrice !== 'number' || currentPrice <= 0) {
      return {
        accepted: false,
        actionTaken: 'RECHAZADA',
        shares: 0,
        ticker: cleanTicker,
        reason: `Rechazada: Falta precio de mercado para cotizar la venta de ${cleanTicker}.`,
        portfolio
      };
    }

    const pos = portfolio.positions.find((p) => p.ticker === cleanTicker);
    if (!pos || pos.shares <= 0) {
      return {
        accepted: false,
        actionTaken: 'RECHAZADA',
        shares: 0,
        ticker: cleanTicker,
        reason: `Rechazada: El agente intentó vender ${cleanTicker} pero no posee ninguna posición activa.`,
        portfolio
      };
    }

    const sharesToSell = Math.min(requestedShares, pos.shares);
    const sellRes = executeSell(portfolio, cleanTicker, sharesToSell, currentPrice, decision.motivo);

    return {
      accepted: sellRes.success,
      actionTaken: sellRes.success ? 'VENTA' : 'RECHAZADA',
      shares: sharesToSell,
      ticker: cleanTicker,
      reason: sellRes.message,
      executedOrder: sellRes.order,
      portfolio: sellRes.portfolio
    };
  }

  // 3. Caso COMPRAR
  if (accion === 'comprar') {
    // Regla (a): Quiere comprar una empresa fuera de la lista -> RECHAZAR
    if (!rules.empresasPermitidas.includes(cleanTicker)) {
      return {
        accepted: false,
        actionTaken: 'RECHAZADA',
        shares: 0,
        ticker: cleanTicker,
        reason: `Rechazada: ${cleanTicker} no está en la lista de empresas permitidas (${rules.empresasPermitidas.join(', ')}).`,
        portfolio
      };
    }

    // Regla (e): Falta un precio -> RECHAZAR
    const currentPrice = prices[cleanTicker];
    if (typeof currentPrice !== 'number' || currentPrice <= 0) {
      return {
        accepted: false,
        actionTaken: 'RECHAZADA',
        shares: 0,
        ticker: cleanTicker,
        reason: `Rechazada: No hay cotización disponible para ${cleanTicker}. No se puede operar.`,
        portfolio
      };
    }

    // Valuación total actual de la cartera
    const evalResult = evaluatePortfolio(portfolio, prices);
    const totalValue = evalResult.totalValue;

    // Regla (g): Reserva mínima de efectivo (al menos 10% del total)
    const minRequiredCash = totalValue * rules.minEfectivoPorcentaje;
    const maxAvailableCashToSpend = portfolio.cash - minRequiredCash;

    if (maxAvailableCashToSpend <= 0) {
      return {
        accepted: false,
        actionTaken: 'RECHAZADA',
        shares: 0,
        ticker: cleanTicker,
        reason: `Rechazada: La cartera debe mantener al menos ${(rules.minEfectivoPorcentaje * 100).toFixed(0)}% en efectivo ($${minRequiredCash.toFixed(2)} USD). Efectivo disponible para operar: $0.00 USD.`,
        portfolio
      };
    }

    // Regla (b): Máximo 20% del capital total en una sola empresa
    const maxExposureForCompany = totalValue * rules.maxPorcentajePorEmpresa;
    const currentPos = portfolio.positions.find((p) => p.ticker === cleanTicker);
    const currentCompanyValue = currentPos ? currentPos.shares * currentPrice : 0;
    const allowedNewInvestment = maxExposureForCompany - currentCompanyValue;

    if (allowedNewInvestment <= 0) {
      return {
        accepted: false,
        actionTaken: 'RECHAZADA',
        shares: 0,
        ticker: cleanTicker,
        reason: `Rechazada: La posición en ${cleanTicker} ya alcanzó o supera el máximo permitido del ${(rules.maxPorcentajePorEmpresa * 100).toFixed(0)}% ($${maxExposureForCompany.toFixed(2)} USD).`,
        portfolio
      };
    }

    // Límite superior de efectivo a gastar respetando tanto el tope por empresa como la reserva de efectivo
    const maxSpend = Math.min(maxAvailableCashToSpend, allowedNewInvestment);
    // Cantidad máxima de acciones que se pueden adquirir
    // Estimamos slippage (0.05%) y comisión mínima
    const priceWithSlippage = currentPrice * 1.0005;
    const maxSharesPossible = Math.floor((maxSpend - 0.50) / priceWithSlippage);

    if (maxSharesPossible <= 0) {
      return {
        accepted: false,
        actionTaken: 'RECHAZADA',
        shares: 0,
        ticker: cleanTicker,
        reason: `Rechazada: Los límites de efectivo mínimo o exposición máxima por empresa impiden comprar incluso 1 acción de ${cleanTicker} a $${currentPrice.toFixed(2)} USD.`,
        portfolio
      };
    }

    // Si requestedShares supera el máximo permitido, ajustamos hacia abajo (Regla b: "compra menos o no compra")
    const adjustedShares = Math.min(requestedShares, maxSharesPossible);

    // Ejecutar compra a mercado
    const buyRes = executeBuy(portfolio, cleanTicker, adjustedShares, currentPrice, decision.motivo);

    // Doble verificación: comprobar que el efectivo final no viole el 10%
    if (buyRes.success) {
      const postEval = evaluatePortfolio(buyRes.portfolio, prices);
      const postMinCash = postEval.totalValue * rules.minEfectivoPorcentaje;
      if (buyRes.portfolio.cash < postMinCash - 0.05) {
        // Rechazar si por redondeo bajó del 10%
        return {
          accepted: false,
          actionTaken: 'RECHAZADA',
          shares: 0,
          ticker: cleanTicker,
          reason: `Rechazada: La compra dejaría el efectivo ($${buyRes.portfolio.cash.toFixed(2)}) por debajo del 10% mínimo ($${postMinCash.toFixed(2)}).`,
          portfolio
        };
      }
    }

    const note = adjustedShares < requestedShares
      ? ` (ajustado de ${requestedShares} a ${adjustedShares} por límites de regla)`
      : '';

    return {
      accepted: buyRes.success,
      actionTaken: buyRes.success ? 'COMPRA' : 'RECHAZADA',
      shares: adjustedShares,
      ticker: cleanTicker,
      reason: buyRes.message + note,
      executedOrder: buyRes.order,
      portfolio: buyRes.portfolio
    };
  }

  return {
    accepted: false,
    actionTaken: 'RECHAZADA',
    shares: 0,
    ticker: cleanTicker,
    reason: `Acción desconocida: ${decision.accion}`,
    portfolio
  };
}
