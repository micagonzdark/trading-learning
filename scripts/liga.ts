import fs from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import OpenAI from 'openai';

import { MarketRules, PlayerPortfolios, AgentDecision } from '../src/lib/types';
import { getYahooPrice } from '../src/lib/market/providers/yahoo';
import { getRecentNewsForTickers } from '../src/lib/market/providers/news';
import { executeBuy, evaluatePortfolio } from '../src/lib/simulation/engine';
import { validateAndExecuteAgentDecision, applyStopLoss } from '../src/lib/simulation/rulesValidator';
import {
  getDataDirectory,
  getRules,
  getPortfolios,
  savePortfolios,
  appendPricesCsv,
  appendAgentDiary
} from '../src/lib/storage';

// Cargar variables de entorno desde .env
dotenv.config();

export interface RunOptions {
  escenario?: string; // ej: 'baja12'
  silent?: boolean;
}

/**
 * Función principal del script de la liga semanal.
 */
export async function runLigaScript(options: RunOptions = {}): Promise<void> {
  const isScenario = !!options.escenario;
  const escenarioName = options.escenario || '';
  const log = (msg: string) => {
    if (!options.silent) console.log(msg);
  };

  log(`\n======================================================`);
  log(`   INICIANDO CORRIDA SEMANAL DE LA LIGA DE TRADING    `);
  if (isScenario) {
    log(`   ⚠️ MODO ESCENARIO ACTIVO: "${escenarioName}" (Copia Temporal)`);
  }
  log(`======================================================\n`);

  // 1. Configurar directorio de datos (Real o Temporal para Escenario)
  let dataDir = path.join(process.cwd(), 'data');
  let tempDirToRemove: string | null = null;

  if (isScenario) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trading-sim-'));
    tempDirToRemove = tempDir;
    dataDir = tempDir;

    // Copiar archivos reales a la carpeta temporal
    const realDir = path.join(process.cwd(), 'data');
    for (const file of ['reglas.json', 'carteras.json', 'precios.csv', 'diario.md']) {
      const src = path.join(realDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(tempDir, file));
      }
    }
    log(`[Escenario] Copia temporal de datos creada en: ${tempDir}`);
  }

  try {
    const rules: MarketRules = getRules(dataDir);
    let portfolios: PlayerPortfolios = getPortfolios(dataDir);
    const currentDate = new Date().toISOString().split('T')[0];

    // 2. Obtener precios de cierre ajustado de activos permitidos y SPY
    const tickersToFetch = [...rules.empresasPermitidas, rules.indiceReferencia];
    const prices: Record<string, number> = {};
    const priceSources: Record<string, string> = {};
    const failedTickers: string[] = [];

    log(`[1/5] Obteniendo cotizaciones para: ${tickersToFetch.join(', ')}...`);

    if (isScenario && escenarioName === 'baja12') {
      // Simular caída del 12% con precios base de referencia
      const baselinePrices: Record<string, number> = {
        MELI: 1800.0,
        SPOT: 500.0,
        AAPL: 220.0,
        MSFT: 440.0,
        NVDA: 120.0,
        DIS: 100.0,
        SPY: 560.0
      };
      for (const t of tickersToFetch) {
        const base = baselinePrices[t] || 100;
        prices[t] = Number((base * 0.88).toFixed(2)); // Caída del 12%
        priceSources[t] = 'escenario-baja12';
      }
      log(`[Escenario] Precios simulados con -12% aplicados.`);
    } else {
      for (const ticker of tickersToFetch) {
        const data = await getYahooPrice(ticker, 1);
        if (data && typeof data.price === 'number') {
          prices[ticker] = data.price;
          priceSources[ticker] = data.source;
          log(`  ✓ ${ticker}: $${data.price.toFixed(2)} USD (vía ${data.source})`);
        } else {
          failedTickers.push(ticker);
          log(`  ✗ ${ticker}: Error al obtener cotización. Se omitirá esta semana.`);
        }
      }
    }

    // 3. Regla Primera Corrida: El jugador "indice" compra SPY con todo su capital
    const indicePort = portfolios.indice;
    if (indicePort && indicePort.positions.length === 0 && indicePort.cash >= 100) {
      const spyPrice = prices[rules.indiceReferencia];
      if (spyPrice && spyPrice > 0) {
        log(`\n[2/5] Primera corrida detectada para "indice": Comprando ${rules.indiceReferencia} con todo el capital...`);
        const maxSpyShares = Math.floor((indicePort.cash - 0.50) / (spyPrice * 1.0005));
        if (maxSpyShares > 0) {
          const buyRes = executeBuy(
            indicePort,
            rules.indiceReferencia,
            maxSpyShares,
            spyPrice,
            'Primera corrida: Inversión pasiva en índice de referencia SPY'
          );
          if (buyRes.success) {
            portfolios.indice = buyRes.portfolio;
            log(`  ✓ ${buyRes.message}`);
          }
        }
      }
    }

    // 4. Regla Stop-Loss: Verificar caídas > 15% en las carteras
    log(`\n[3/5] Verificando Stop-Loss en cartera del agente...`);
    const agentPort = portfolios.agente;
    const stopLossResult = applyStopLoss(agentPort, rules, prices);
    if (stopLossResult.triggered) {
      portfolios.agente = stopLossResult.portfolio;
      log(`  ⚠️ Stop-Loss activado:`);
      stopLossResult.details.forEach((d) => log(`    - ${d}`));
    } else {
      log(`  ✓ No se activaron stop-loss.`);
    }

    // 5. Consulta de Noticias para dar contexto macro al LLM
    log(`\n[4/5] Obteniendo noticias recientes para activos permitidos...`);
    const newsContext = await getRecentNewsForTickers(rules.empresasPermitidas, 2);
    let newsSummary = '';
    for (const [t, titles] of Object.entries(newsContext)) {
      if (titles.length > 0) {
        newsSummary += `- ${t}: ${titles.join(' | ')}\n`;
      }
    }
    if (!newsSummary) newsSummary = 'No se registraron titulares destacados de última hora.';

    // 6. Solicitud de Decisión al Modelo de OpenAI
    log(`[5/5] Consultando al agente de inversión (LLM)...`);
    const apiKey = process.env.OPENAI_API_KEY;
    const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    let agentDecision: AgentDecision;

    if (apiKey && !apiKey.startsWith('tu_clave')) {
      try {
        const client = new OpenAI({ apiKey });
        const prompt = `
Eres un gestor de inversiones profesional compitiendo en una liga de simulación financiera semanal.
Debes tomar UNA decisión de inversión para esta semana basándote en las reglas, tu cartera y el mercado.

REGLAS ESTRICTAS DE LA LIGA:
- Capital inicial: $${rules.capitalInicialPorJugador} USD.
- Empresas autorizadas: ${rules.empresasPermitidas.join(', ')}.
- Máximo de exposición en UNA sola empresa: ${(rules.maxPorcentajePorEmpresa * 100).toFixed(0)}% del valor total de la cartera.
- Reserva mínima obligatoria de efectivo: ${(rules.minEfectivoPorcentaje * 100).toFixed(0)}% del total.
- Stop-loss automático: Se vende toda posición que caiga ${(rules.stopLossPorcentaje * 100).toFixed(0)}% o más.

ESTADO ACTUAL DE TU CARTERA:
- Efectivo: $${portfolios.agente.cash.toFixed(2)} USD.
- Posiciones abiertas: ${JSON.stringify(portfolios.agente.positions)}

COTIZACIONES ACTUALES (USD):
${Object.entries(prices).map(([t, p]) => `${t}: $${p.toFixed(2)}`).join(', ')}

NOTICIAS RECIENTES:
${newsSummary}

INSTRUCCIONES DE RESPUESTA:
Responde ÚNICAMENTE un objeto JSON válido con este formato exacto:
{
  "accion": "comprar" | "vender" | "esperar",
  "empresa": "TICKER",
  "cantidad": número entero de acciones,
  "motivo": "Explicación breve de dos oraciones máximo fundamentando la decisión financiera."
}
`;

        const completion = await client.chat.completions.create({
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' }
        });

        const rawContent = completion.choices[0]?.message?.content || '{}';
        agentDecision = JSON.parse(rawContent);
        log(`  ✓ Respuesta recibida del modelo (${modelName})`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        log(`  ⚠️ Error al conectar con OpenAI (${msg}). Usando decisión prudente por defecto.`);
        agentDecision = {
          accion: 'esperar',
          empresa: 'NVDA',
          cantidad: 0,
          motivo: `No se pudo conectar con el modelo de IA (${msg}). Se decide mantener liquidez.`
        };
      }
    } else {
      log(`  ℹ️ OPENAI_API_KEY no configurada o mock. Usando decisión simulada prudente.`);
      agentDecision = {
        accion: 'comprar',
        empresa: 'NVDA',
        cantidad: 1,
        motivo: 'Inversión inicial diversificada en NVDA aprovechando valuación atractiva del sector semiconductores.'
      };
    }

    log(`  Propuesta del Agente: ${agentDecision.accion.toUpperCase()} ${agentDecision.cantidad} de ${agentDecision.empresa}`);
    log(`  Motivo propuesto: "${agentDecision.motivo}"`);

    // 7. Validación por CÓDIGO (el modelo nunca ejecuta directamente)
    const validation = validateAndExecuteAgentDecision(
      portfolios.agente,
      agentDecision,
      rules,
      prices
    );

    if (validation.accepted && validation.actionTaken !== 'ESPERA') {
      portfolios.agente = validation.portfolio;
      log(`  ✓ Decisión ACEPTADA y ejecutada por el motor: ${validation.reason}`);
    } else if (validation.actionTaken === 'ESPERA') {
      log(`  ✓ Decisión aceptada: Esperar en liquidez.`);
    } else {
      log(`  ❌ Decisión RECHAZADA por el validador de reglas: ${validation.reason}`);
    }

    // 8. Valuación de los tres jugadores al cierre
    log(`\n--- RESULTADOS Y RANKING AL CIERRE ---`);
    const evalMoises = evaluatePortfolio(portfolios.moises, prices);
    const evalAgente = evaluatePortfolio(portfolios.agente, prices);
    const evalIndice = evaluatePortfolio(portfolios.indice, prices);

    const standings = [
      { jugador: 'moises', ...evalMoises },
      { jugador: 'agente', ...evalAgente },
      { jugador: 'indice', ...evalIndice }
    ].sort((a, b) => b.totalValue - a.totalValue);

    standings.forEach((s, idx) => {
      const returnPct = (((s.totalValue - 1000) / 1000) * 100).toFixed(2);
      log(`  #${idx + 1} ${s.jugador.toUpperCase()}: $${s.totalValue.toFixed(2)} USD (${returnPct >= '0' ? '+' : ''}${returnPct}%) [Efectivo: $${s.cash.toFixed(2)}]`);
    });

    // 9. Persistencia de datos (en data/ o temp)
    savePortfolios(portfolios, dataDir);

    const priceRows = Object.entries(prices).map(([ticker, cierre]) => ({
      fecha: currentDate,
      ticker,
      cierre
    }));
    appendPricesCsv(priceRows, dataDir);

    const diaryEntry = `
### Corrida del ${currentDate} ${isScenario ? `(Escenario: ${escenarioName})` : ''}
- **Cotizaciones**: ${Object.entries(prices).map(([t, p]) => `${t}: $${p.toFixed(2)}`).join(', ')}
${failedTickers.length > 0 ? `- **Activos sin precio**: ${failedTickers.join(', ')} (no operados)\n` : ''}
${stopLossResult.triggered ? `- **Stop-Loss**: ${stopLossResult.details.join('; ')}\n` : ''}
- **Decisión del Agente**: ${agentDecision.accion.toUpperCase()} ${agentDecision.cantidad} ${agentDecision.empresa}
- **Resultado Validación**: ${validation.actionTaken} - ${validation.reason}
- **Motivo del Modelo**: "${agentDecision.motivo}"
- **Valuación de Jugadores**:
  1. **${standings[0].jugador}**: $${standings[0].totalValue.toFixed(2)} USD
  2. **${standings[1].jugador}**: $${standings[1].totalValue.toFixed(2)} USD
  3. **${standings[2].jugador}**: $${standings[2].totalValue.toFixed(2)} USD
`;
    appendAgentDiary(diaryEntry, dataDir);

    log(`\n✓ Corrida semanal completada exitosamente.`);
  } finally {
    // Si fue modo escenario, eliminar el directorio temporal
    if (tempDirToRemove && fs.existsSync(tempDirToRemove)) {
      try {
        fs.rmSync(tempDirToRemove, { recursive: true, force: true });
        log(`[Escenario] Directorio temporal eliminado con éxito.`);
      } catch (err) {
        // Ignorar limpieza
      }
    }
  }
}

// Ejecución CLI directa
if (require.main === module || process.argv[1]?.includes('liga')) {
  const args = process.argv.slice(2);
  let escenario: string | undefined = undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--escenario' && args[i + 1]) {
      escenario = args[i + 1];
    }
  }

  runLigaScript({ escenario })
    .catch((err) => {
      console.error('Error fatal al ejecutar liga.ts:', err);
      process.exit(1);
    });
}
