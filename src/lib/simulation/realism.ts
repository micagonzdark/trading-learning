/**
 * Configuración de realismo de mercado: comisiones y slippage simulado.
 */
export interface RealismConfig {
  commissionRate: number; // Porcentaje sobre el valor de la orden (ej: 0.001 = 0.1%)
  fixedCommission: number; // Comisión mínima fija en USD (ej: 0.50 USD)
  slippageRate: number; // Deslizamiento porcentual de precio (ej: 0.0005 = 0.05%)
}

export const DEFAULT_REALISM_CONFIG: RealismConfig = {
  commissionRate: 0.001,   // 0.1%
  fixedCommission: 0.50,   // $0.50 USD
  slippageRate: 0.0005     // 0.05%
};

/**
 * Calcula la comisión de una operación según el monto bruto.
 */
export function calculateCommission(
  grossAmount: number,
  config: RealismConfig = DEFAULT_REALISM_CONFIG
): number {
  if (grossAmount <= 0) return 0;
  const variable = grossAmount * config.commissionRate;
  const commission = Math.max(variable, config.fixedCommission);
  return Number(commission.toFixed(2));
}

/**
 * Simula el slippage (deslizamiento de precio entre la cotización y la ejecución real):
 * - Para COMPRA: el precio ejecutado es ligeramente superior (+slippage)
 * - Para VENTA: el precio ejecutado es ligeramente inferior (-slippage)
 */
export function calculateSlippage(
  basePrice: number,
  type: 'BUY' | 'SELL',
  config: RealismConfig = DEFAULT_REALISM_CONFIG
): { executedPrice: number; slippagePerShare: number } {
  if (basePrice <= 0) return { executedPrice: basePrice, slippagePerShare: 0 };
  const diff = basePrice * config.slippageRate;
  const executedPrice = type === 'BUY' ? basePrice + diff : basePrice - diff;
  return {
    executedPrice: Number(executedPrice.toFixed(2)),
    slippagePerShare: Number(diff.toFixed(2))
  };
}
