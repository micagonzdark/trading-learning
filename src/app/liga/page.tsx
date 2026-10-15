'use client';

import React, { useState, useEffect } from 'react';

interface Standing {
  nombre: string;
  id: string;
  valorTotal: number;
  efectivo: number;
  valorPosiciones: number;
  rendimientoPct: number;
  rendimientoUsd: number;
  base100: number;
  posiciones: Array<{
    ticker: string;
    shares: number;
    avgPrice: number;
    currentPrice: number;
    marketValue: number;
    unrealizedPnL: number;
    unrealizedPnLPercent: number;
  }>;
}

interface TimelinePoint {
  fecha: string;
  moises: number;
  agente: number;
  indice: number;
  tipo: string;
}

export default function LigaDashboard() {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [diaryContent, setDiaryContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [showSimulatedData, setShowSimulatedData] = useState<boolean>(false);

  useEffect(() => {
    fetch('/api/liga')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setStandings(data.standings);
          setTimeline(data.timeline);
          setDiaryContent(data.diaryContent);
        }
      })
      .catch((err) => console.error('Error al cargar liga:', err))
      .finally(() => setLoading(false));
  }, []);

  // Datos simulados de escenario (para visualización rica de curva histórica)
  const simulatedTimeline: TimelinePoint[] = [
    { fecha: 'Semana 0 (Inicio)', moises: 100.0, agente: 100.0, indice: 100.0, tipo: 'simulado' },
    { fecha: 'Semana 1', moises: 102.5, agente: 99.8, indice: 101.2, tipo: 'simulado' },
    { fecha: 'Semana 2', moises: 98.4, agente: 100.5, indice: 97.6, tipo: 'simulado' },
    { fecha: 'Semana 3', moises: 104.2, agente: 101.9, indice: 99.4, tipo: 'simulado' },
    { fecha: 'Semana 4 (Actual)', moises: 106.8, agente: 103.4, indice: 98.2, tipo: 'simulado' }
  ];

  const activeTimeline = showSimulatedData ? simulatedTimeline : timeline;

  // Parámetros para el gráfico SVG
  const minVal = Math.min(90, ...activeTimeline.flatMap((p) => [p.moises, p.agente, p.indice])) - 2;
  const maxVal = Math.max(110, ...activeTimeline.flatMap((p) => [p.moises, p.agente, p.indice])) + 2;
  const range = maxVal - minVal || 1;

  const chartWidth = 700;
  const chartHeight = 260;
  const paddingX = 50;
  const paddingY = 30;

  const getX = (idx: number, total: number) => {
    if (total <= 1) return paddingX;
    return paddingX + (idx / (total - 1)) * (chartWidth - paddingX * 2);
  };

  const getY = (val: number) => {
    return chartHeight - paddingY - ((val - minVal) / range) * (chartHeight - paddingY * 2);
  };

  const makePath = (key: 'moises' | 'agente' | 'indice') => {
    if (activeTimeline.length === 0) return '';
    return activeTimeline
      .map((p, idx) => {
        const x = getX(idx, activeTimeline.length);
        const y = getY(p[key]);
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8">
      {/* Header */}
      <header className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center pb-6 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏆</span>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-amber-400 via-indigo-300 to-emerald-400 bg-clip-text text-transparent">
                Tablero Oficial de la Liga
              </h1>
              <p className="text-sm text-slate-400">
                Competencia de Inversión • Moisés vs Agente Autónomo IA vs Índice SPY
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors"
          >
            ← Volver al Simulador
          </a>
        </div>
      </header>

      {/* Selector de Modo de Visualización del Gráfico */}
      <section className="max-w-6xl mx-auto my-6 flex flex-col sm:flex-row justify-between items-center bg-slate-800/40 border border-slate-700/60 p-4 rounded-xl gap-4">
        <div>
          <span className="font-semibold text-sm text-slate-300">Modo de datos del gráfico:</span>
          <span className="text-xs text-slate-500 ml-2">
            {showSimulatedData ? '(Mostrando datos de simulación multiescenario)' : '(Mostrando registros reales en data/)'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSimulatedData(false)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              !showSimulatedData
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
            }`}
          >
            Datos Reales de Disco
          </button>
          <button
            onClick={() => setShowSimulatedData(true)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              showSimulatedData
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
            }`}
          >
            Simulación Escenario (5 Semanas)
          </button>
        </div>
      </section>

      {/* Gráfico Base 100 */}
      <section className="max-w-6xl mx-auto my-6 bg-slate-800/60 border border-slate-700 rounded-xl p-6 shadow-lg">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span>📈</span> Curvas de Rendimiento (Base 100)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Evolución normalizada: 100 = capital inicial ($1,000 USD). Mayor a 100 = Ganancia.
            </p>
          </div>
          {/* Leyenda */}
          <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block"></span>
              <span className="text-emerald-400 font-semibold">Moisés</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-indigo-400 inline-block"></span>
              <span className="text-indigo-400 font-semibold">Agente IA</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-amber-400 inline-block"></span>
              <span className="text-amber-400 font-semibold">Índice SPY</span>
            </div>
          </div>
        </div>

        {/* Renderizado de gráfico SVG interactivo */}
        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full max-w-full h-auto text-slate-400"
            style={{ minWidth: '500px' }}
          >
            {/* Línea de base 100 (referencia de capital inicial) */}
            <line
              x1={paddingX}
              y1={getY(100)}
              x2={chartWidth - paddingX}
              y2={getY(100)}
              stroke="#64748b"
              strokeDasharray="4 4"
              strokeWidth="1.5"
            />
            <text
              x={paddingX - 10}
              y={getY(100) + 4}
              fontSize="10"
              fill="#94a3b8"
              textAnchor="end"
              fontFamily="monospace"
            >
              100.0
            </text>

            {/* Eje Y superior e inferior */}
            <text
              x={paddingX - 10}
              y={getY(maxVal) + 8}
              fontSize="10"
              fill="#64748b"
              textAnchor="end"
              fontFamily="monospace"
            >
              {maxVal.toFixed(0)}
            </text>
            <text
              x={paddingX - 10}
              y={getY(minVal) - 4}
              fontSize="10"
              fill="#64748b"
              textAnchor="end"
              fontFamily="monospace"
            >
              {minVal.toFixed(0)}
            </text>

            {/* Curvas */}
            <path
              d={makePath('moises')}
              fill="none"
              stroke="#34d399"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={makePath('agente')}
              fill="none"
              stroke="#818cf8"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={makePath('indice')}
              fill="none"
              stroke="#fbbf24"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Puntos y etiquetas de eje X */}
            {activeTimeline.map((p, idx) => {
              const x = getX(idx, activeTimeline.length);
              return (
                <g key={idx}>
                  {/* Puntos Moisés */}
                  <circle cx={x} cy={getY(p.moises)} r="4" fill="#34d399" />
                  {/* Puntos Agente */}
                  <circle cx={x} cy={getY(p.agente)} r="4" fill="#818cf8" />
                  {/* Puntos Índice */}
                  <circle cx={x} cy={getY(p.indice)} r="4" fill="#fbbf24" />

                  {/* Etiqueta de fecha */}
                  <text
                    x={x}
                    y={chartHeight - 8}
                    fontSize="10"
                    fill="#94a3b8"
                    textAnchor="middle"
                  >
                    {p.fecha}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </section>

      {/* Tabla de Posiciones de los Jugadores */}
      <section className="max-w-6xl mx-auto my-8">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <span>🏅</span> Tabla de Posiciones Actual
        </h2>
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800/90 text-slate-400 border-b border-slate-700 uppercase text-xs">
                <tr>
                  <th className="py-3.5 px-4 text-center">Puesto</th>
                  <th className="py-3.5 px-4">Jugador</th>
                  <th className="py-3.5 px-4">Valor Total</th>
                  <th className="py-3.5 px-4">Rendimiento ($ / %)</th>
                  <th className="py-3.5 px-4">Base 100</th>
                  <th className="py-3.5 px-4">Efectivo Disponible</th>
                  <th className="py-3.5 px-4">Posiciones Activas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {standings.map((s, idx) => {
                  const medal = idx === 0 ? '🥇 #1' : idx === 1 ? '🥈 #2' : '🥉 #3';
                  const isPositive = s.rendimientoPct >= 0;

                  return (
                    <tr key={s.id} className="hover:bg-slate-800/70 transition-colors">
                      <td className="py-4 px-4 text-center font-bold text-base">
                        {medal}
                      </td>
                      <td className="py-4 px-4">
                        <span className="font-bold text-slate-200">{s.nombre}</span>
                        <p className="text-xs text-slate-400 capitalize">{s.id}</p>
                      </td>
                      <td className="py-4 px-4 font-mono font-bold text-white text-base">
                        ${s.valorTotal.toFixed(2)} USD
                      </td>
                      <td className="py-4 px-4 font-mono">
                        <span
                          className={`font-semibold ${
                            isPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isPositive ? '+' : ''}${s.rendimientoUsd.toFixed(2)} ({isPositive ? '+' : ''}
                          {s.rendimientoPct.toFixed(2)}%)
                        </span>
                      </td>
                      <td className="py-4 px-4 font-mono font-semibold text-slate-200">
                        {s.base100.toFixed(2)}
                      </td>
                      <td className="py-4 px-4 font-mono text-slate-300">
                        ${s.efectivo.toFixed(2)} USD
                      </td>
                      <td className="py-4 px-4 text-xs text-slate-400">
                        {s.posiciones && s.posiciones.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {s.posiciones.map((p) => (
                              <span
                                key={p.ticker}
                                className="bg-slate-700/80 px-2 py-0.5 rounded text-slate-200 font-mono"
                              >
                                {p.shares} {p.ticker}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="italic text-slate-500">100% Liquidez</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Bitácora / Diario del Agente */}
      <section className="max-w-6xl mx-auto my-8">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <span>📓</span> Diario de Operaciones del Agente
        </h2>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 shadow-md font-mono text-xs leading-relaxed text-slate-300 max-h-96 overflow-y-auto whitespace-pre-wrap">
          {diaryContent}
        </div>
      </section>
    </div>
  );
}
