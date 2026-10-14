export interface Asset {
  ticker: string;
  name: string;
  isBenchmark?: boolean;
}

export interface Price {
  ticker: string;
  price: number;
  changePercent?: number;
  date: string;
}

export interface Position {
  ticker: string;
  shares: number;
  avgPrice: number;
}

export interface Order {
  id: string;
  timestamp: string;
  ticker: string;
  type: 'BUY' | 'SELL';
  shares: number;
  price: number;
  executedPrice: number;
  commission: number;
  slippage: number;
  totalCost: number;
  reason?: string;
}

export interface Portfolio {
  cash: number;
  positions: Position[];
  history: Order[];
}

export interface PlayerPortfolios {
  moises: Portfolio;
  agente: Portfolio;
  indice: Portfolio;
  [key: string]: Portfolio;
}

export interface MarketRules {
  capitalInicialPorJugador: number;
  empresasPermitidas: string[];
  indiceReferencia: string;
  maxPorcentajePorEmpresa: number; // e.g. 0.20
  stopLossPorcentaje: number; // e.g. 0.15
  minEfectivoPorcentaje: number; // e.g. 0.10
  fechaInicio: string;
}

export interface AgentDecision {
  accion: 'comprar' | 'vender' | 'esperar';
  empresa: string;
  cantidad: number;
  motivo: string;
}
