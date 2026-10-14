'use client';

import React, { useState, useEffect, useCallback } from 'react';
import assetsData from '@/data/assets.json';

interface PriceInfo {
  ticker: string;
  price: number;
  changePercent: number;
  date: string;
}

interface PositionPnL {
  ticker: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
}

interface OrderHistory {
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
}

interface PortfolioEval {
  cash: number;
  positionsValue: number;
  totalValue: number;
  positionsWithPnL: PositionPnL[];
}

export default function Home() {
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  const [portfolio, setPortfolio] = useState<{ cash: number; history: OrderHistory[] }>({ cash: 1000, history: [] });
  const [evaluation, setEvaluation] = useState<PortfolioEval | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [buyShares, setBuyShares] = useState<Record<string, number>>({});

  const fetchData = useCallback(async () => {
    try {
      const [pricesRes, portRes] = await Promise.all([
        fetch('/api/prices'),
        fetch('/api/portfolio?player=moises')
      ]);

      const pricesData = await pricesRes.json();
      const portData = await portRes.json();

      if (pricesData.success) {
        setPrices(pricesData.prices);
      }
      if (portData.success) {
        setPortfolio(portData.portfolio);
        setEvaluation(portData.evaluation);
      }
    } catch (err) {
      console.error('Error al cargar datos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000); // Actualiza cada 15 seg
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleBuy = async (ticker: string) => {
    const shares = buyShares[ticker] || 1;
    setActionLoading(`buy-${ticker}`);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, shares, player: 'moises' })
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({ text: data.message, type: 'success' });
        await fetchData();
      } else {
        setStatusMessage({ text: data.message || 'Error al ejecutar la compra', type: 'error' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error de conexión';
      setStatusMessage({ text: msg, type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSell = async (ticker: string, shares: number) => {
    setActionLoading(`sell-${ticker}`);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, shares, player: 'moises' })
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({ text: data.message, type: 'success' });
        await fetchData();
      } else {
        setStatusMessage({ text: data.message || 'Error al ejecutar la venta', type: 'error' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error de conexión';
      setStatusMessage({ text: msg, type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const totalReturn = evaluation ? evaluation.totalValue - 1000 : 0;
  const totalReturnPercent = (totalReturn / 1000) * 100;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8">
      <header className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center pb-6 border-b border-slate-800 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Trading Learning
          </h1>
          <p className="text-sm text-slate-400">Simulador de Mercado Financiero en Tiempo Real • Jugador: Moisés</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/liga"
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            🏆 Ver Tablero de la Liga
          </a>
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors"
          >
            {loading ? 'Cargando...' : '🔄 Actualizar Precios'}
          </button>
        </div>
      </header>

      {statusMessage && (
        <div
          className={`max-w-6xl mx-auto my-4 p-4 rounded-lg font-medium text-sm flex items-center justify-between ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
              : 'bg-rose-950/80 text-rose-300 border border-rose-800'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="text-xs underline ml-4">
            Cerrar
          </button>
        </div>
      )}

      {/* Tarjetas de Resumen Financiero */}
      <section className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 my-6">
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Efectivo Disponible</p>
          <p className="text-2xl font-bold text-emerald-400 mt-2">
            ${portfolio.cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
          </p>
          <p className="text-xs text-slate-500 mt-1">Capital inicial: $1,000.00 USD</p>
        </div>

        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Valor en Acciones</p>
          <p className="text-2xl font-bold text-cyan-400 mt-2">
            ${(evaluation?.positionsValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {evaluation?.positionsWithPnL.length || 0} posiciones abiertas
          </p>
        </div>

        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Valor Total Cartera</p>
          <p className="text-2xl font-bold text-white mt-2">
            ${(evaluation?.totalValue || portfolio.cash).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
          </p>
          <p className="text-xs text-slate-500 mt-1">Efectivo + Inversiones</p>
        </div>

        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Rendimiento Total</p>
          <p
            className={`text-2xl font-bold mt-2 ${
              totalReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)} ({totalReturnPercent >= 0 ? '+' : ''}
            {totalReturnPercent.toFixed(2)}%)
          </p>
          <p className="text-xs text-slate-500 mt-1">Desde inicio ($1,000 base)</p>
        </div>
      </section>

      {/* Mercados y Órdenes */}
      <section className="max-w-6xl mx-auto my-8">
        <h2 className="text-xl font-bold text-slate-200 mb-4 flex items-center gap-2">
          <span>📈</span> Activos Disponibles y Cotizaciones en Vivo
        </h2>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800/90 text-slate-400 border-b border-slate-700 uppercase text-xs">
                <tr>
                  <th className="py-3 px-4">Ticker</th>
                  <th className="py-3 px-4">Empresa</th>
                  <th className="py-3 px-4">Precio Actual</th>
                  <th className="py-3 px-4">Var. Día</th>
                  <th className="py-3 px-4">Cantidad</th>
                  <th className="py-3 px-4 text-right">Operar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {assetsData.map((asset) => {
                  const p = prices[asset.ticker];
                  const currentShares = buyShares[asset.ticker] || 1;
                  const isLoading = actionLoading === `buy-${asset.ticker}`;

                  return (
                    <tr key={asset.ticker} className="hover:bg-slate-800/70 transition-colors">
                      <td className="py-3 px-4 font-bold text-emerald-400">
                        {asset.ticker}
                        {asset.isBenchmark && (
                          <span className="ml-2 text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded font-normal">
                            Índice
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-300">{asset.name}</td>
                      <td className="py-3 px-4 font-mono font-semibold">
                        {p ? `$${p.price.toFixed(2)} USD` : <span className="text-slate-500">Consultando...</span>}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {p ? (
                          <span className={p.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {p.changePercent >= 0 ? '+' : ''}{p.changePercent.toFixed(2)}%
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={currentShares}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value) || 1);
                              setBuyShares({ ...buyShares, [asset.ticker]: val });
                            }}
                            className="w-16 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-center text-slate-100 font-mono text-sm focus:outline-none focus:border-emerald-500"
                          />
                          <span className="text-xs text-slate-400">acc.</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleBuy(asset.ticker)}
                          disabled={!p || isLoading}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg text-xs shadow transition-colors"
                        >
                          {isLoading ? 'Comprando...' : 'Comprar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Posiciones Abiertas */}
      <section className="max-w-6xl mx-auto my-8">
        <h2 className="text-xl font-bold text-slate-200 mb-4 flex items-center gap-2">
          <span>💼</span> Mis Posiciones Abiertas
        </h2>
        {evaluation && evaluation.positionsWithPnL.length > 0 ? (
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden shadow-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800/90 text-slate-400 border-b border-slate-700 uppercase text-xs">
                  <tr>
                    <th className="py-3 px-4">Activo</th>
                    <th className="py-3 px-4">Acciones</th>
                    <th className="py-3 px-4">Precio Compra (PPP)</th>
                    <th className="py-3 px-4">Precio Actual</th>
                    <th className="py-3 px-4">Valor Mercado</th>
                    <th className="py-3 px-4">Ganancia/Pérdida</th>
                    <th className="py-3 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {evaluation.positionsWithPnL.map((pos) => {
                    const isSelling = actionLoading === `sell-${pos.ticker}`;
                    return (
                      <tr key={pos.ticker} className="hover:bg-slate-800/70 transition-colors">
                        <td className="py-3 px-4 font-bold text-emerald-400">{pos.ticker}</td>
                        <td className="py-3 px-4 font-mono">{pos.shares}</td>
                        <td className="py-3 px-4 font-mono">${pos.avgPrice.toFixed(2)}</td>
                        <td className="py-3 px-4 font-mono">${pos.currentPrice.toFixed(2)}</td>
                        <td className="py-3 px-4 font-mono font-semibold">${pos.marketValue.toFixed(2)}</td>
                        <td className="py-3 px-4 font-mono">
                          <span
                            className={`font-semibold ${
                              pos.unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {pos.unrealizedPnL >= 0 ? '+' : ''}${pos.unrealizedPnL.toFixed(2)} (
                            {pos.unrealizedPnLPercent >= 0 ? '+' : ''}
                            {pos.unrealizedPnLPercent.toFixed(2)}%)
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            onClick={() => handleSell(pos.ticker, 1)}
                            disabled={isSelling}
                            className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 text-xs rounded transition-colors"
                          >
                            Vender 1
                          </button>
                          <button
                            onClick={() => handleSell(pos.ticker, pos.shares)}
                            disabled={isSelling}
                            className="px-3 py-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold text-xs rounded transition-colors"
                          >
                            {isSelling ? 'Vendiendo...' : 'Vender Todo'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-slate-800/30 border border-dashed border-slate-700 rounded-xl p-8 text-center text-slate-400">
            No tienes posiciones abiertas actualmente. Utiliza la tabla de arriba para comprar tus primeras acciones.
          </div>
        )}
      </section>

      {/* Historial de Operaciones */}
      <section className="max-w-6xl mx-auto my-8">
        <h2 className="text-xl font-bold text-slate-200 mb-4 flex items-center gap-2">
          <span>📜</span> Historial de Transacciones
        </h2>
        {portfolio.history && portfolio.history.length > 0 ? (
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden shadow-md">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800/90 text-slate-400 border-b border-slate-700 uppercase text-xs sticky top-0">
                  <tr>
                    <th className="py-3 px-4">Fecha y Hora</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Activo</th>
                    <th className="py-3 px-4">Cantidad</th>
                    <th className="py-3 px-4">Precio Ejecutado</th>
                    <th className="py-3 px-4">Comisión</th>
                    <th className="py-3 px-4">Deslizamiento</th>
                    <th className="py-3 px-4 text-right">Total USD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50 font-mono text-xs">
                  {portfolio.history.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-800/70 transition-colors">
                      <td className="py-2.5 px-4 text-slate-400">
                        {new Date(order.timestamp).toLocaleString('es-AR')}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            order.type === 'BUY'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}
                        >
                          {order.type === 'BUY' ? 'COMPRA' : 'VENTA'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-bold text-slate-200">{order.ticker}</td>
                      <td className="py-2.5 px-4">{order.shares}</td>
                      <td className="py-2.5 px-4">${order.executedPrice.toFixed(2)}</td>
                      <td className="py-2.5 px-4 text-slate-400">${order.commission.toFixed(2)}</td>
                      <td className="py-2.5 px-4 text-slate-400">${order.slippage.toFixed(2)}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-slate-100">
                        ${order.totalCost.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-slate-800/30 border border-dashed border-slate-700 rounded-xl p-8 text-center text-slate-400">
            Aún no has realizado ninguna operación.
          </div>
        )}
      </section>
    </div>
  );
}
