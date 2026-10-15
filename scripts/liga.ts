import fs from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import OpenAI from 'openai';

import { MarketRules, PlayerPortfolios, AgentDecision } from '../src/lib/types';
import { getYahooPrice, getStooqPrice, TickerData } from '../src/lib/market/providers/yahoo';
import { getRecentNewsForTickers } from '../src/lib/market/providers/news';
import { executeBuy, evaluatePortfolio } from '../src/lib/simulation/engine';
import { validateAndExecuteAgentDecision, applyStopLoss } from '../src/lib/simulation/rulesValidator';
import {
  getDataDirectory,
  getRules,
  getPortfolios,
  savePortfolios,
  saveRules,
  appendPricesCsv,
  appendAgentDiary
} from '../src/lib/storage';

// Cargar variables de entorno desde .env
dotenv.config();

export interface RunOptions {
  escenario?: string; // ej: 'baja12'
  usarCache?: boolean;
  proveedor?: 'yahoo' | 'stooq';
  silent?: boolean;
}

export interface RunMetrics {
  tiempoTotalMs: number;
  tiempoModeloMs: number;
  tiempoPreciosMs: number;
  proveedorUsado: string;
  cacheUsado: boolean;
}

/**
 * Lee las instrucciones en lenguaje natural del archivo agente/instrucciones.md
 */
export function getAgentInstructions(projectRoot?: string): string {
  const root = projectRoot || process.cwd();
  const filePath = path.join(root, 'agente', 'instrucciones.md');
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8');
  }
  return `
Eres un gestor de inversiones institucional disciplinado.
Tu objetivo es hacer crecer la cartera a largo plazo respetando las reglas de la liga.
Prioriza activos líderes y mantén diversificación.
  `.trim();
}

/**
 * Realiza la consulta estructurada a OpenAI con validación estricta y hasta 2 reintentos automáticos.
 */
async function queryAgentWithHardenedParsing(
  client: OpenAI,
  modelName: string,
  systemInstructions: string,
  marketPrompt: string,
  log: (msg: string) => void
): Promise<{ decision: AgentDecision; tiempoMs: number }> {
  const startTime = performance.now();
  const maxRetries = 2;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `
${systemInstructions}

REQUISITO DE SALIDA ESTRICTO:
Debes responder ÚNICAMENTE un objeto JSON válido con los siguientes campos obligatorios:
- "accion": exactamente uno de ["comprar", "vender", "esperar"]
- "empresa": ticker del activo (por ejemplo "AAPL", "NVDA", "DIS", "MSFT", "SPOT", "MELI", o "SPY")
- "cantidad": número entero mayor o igual a 0
- "motivo": explicación fundamentada de máximo dos oraciones en castellano.
      `.trim()
    },
    {
      role: 'user',
      content: marketPrompt
    }
  ];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: modelName,
        messages,
        response_format: { type: 'json_object' }
      });

      const raw = response.choices[0]?.message?.content || '{}';
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch (parseErr) {
        throw new Error(`El texto devuelto no es JSON válido: "${raw.slice(0, 80)}..."`);
      }

      // Validar esquema de la decisión
      const errors: string[] = [];
      if (!['comprar', 'vender', 'esperar'].includes(String(parsed.accion).toLowerCase())) {
        errors.push(`'accion' debe ser 'comprar', 'vender' o 'esperar' (recibido: ${parsed.accion})`);
      }
      // Si la acción es esperar, no es obligatorio un ticker específico
      if (String(parsed.accion).toLowerCase() === 'esperar') {
        if (!parsed.empresa || typeof parsed.empresa !== 'string') {
          parsed.empresa = 'NINGUNA';
        }
        if (typeof parsed.cantidad !== 'number') {
          parsed.cantidad = 0;
        }
      } else {
        if (typeof parsed.empresa !== 'string' || !parsed.empresa.trim() || parsed.empresa === 'NINGUNA') {
          errors.push(`'empresa' debe ser un ticker válido en texto (ej: AAPL, DIS, NVDA)`);
        }
      }
      const qty = Number(parsed.cantidad);
      if (!Number.isInteger(qty) || qty < 0) {
        errors.push(`'cantidad' debe ser un número entero >= 0 (recibido: ${parsed.cantidad})`);
      }
      if (typeof parsed.motivo !== 'string' || !parsed.motivo.trim()) {
        errors.push(`'motivo' debe ser un texto explicativo no vacío`);
      }

      if (errors.length > 0) {
        throw new Error(`Esquema inválido: ${errors.join('; ')}`);
      }

      const tiempoMs = Number((performance.now() - startTime).toFixed(1));
      return {
        decision: {
          accion: parsed.accion.toLowerCase(),
          empresa: parsed.empresa.toUpperCase(),
          cantidad: qty,
          motivo: parsed.motivo.trim()
        },
        tiempoMs
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < maxRetries) {
        log(`  ⚠️ Intento ${attempt + 1} falló validación: ${msg}. Reintentando automáticamente con feedback al modelo...`);
        messages.push({
          role: 'assistant',
          content: '{"error": "invalid"}'
        });
        messages.push({
          role: 'user',
          content: `Tu respuesta anterior tuvo errores de validación: ${msg}. Por favor corrige y devuelve exclusivamente el JSON válido respetando el esquema.`
        });
      } else {
        log(`  ❌ Error fatal: El modelo no devolvió una estructura JSON válida tras ${maxRetries} reintentos: ${msg}`);
        const tiempoMs = Number((performance.now() - startTime).toFixed(1));
        return {
          decision: {
            accion: 'esperar',
            empresa: 'SPY',
            cantidad: 0,
            motivo: `Fallo de validación estructurada tras ${maxRetries} reintentos: ${msg}. Se preserva liquidez.`
          },
          tiempoMs
        };
      }
    }
  }

  const tiempoMs = Number((performance.now() - startTime).toFixed(1));
  return {
    decision: {
      accion: 'esperar',
      empresa: 'SPY',
      cantidad: 0,
      motivo: 'Decisión prudente por timeout.'
    },
    tiempoMs
  };
}

/**
 * Función principal del script de la liga semanal.
 */
export async function runLigaScript(options: RunOptions = {}): Promise<RunMetrics> {
  const globalStart = performance.now();
  const isScenario = !!options.escenario;
  const escenarioName = options.escenario || '';
  const usarCache = !!options.usarCache;
  const preferredProvider = options.proveedor || 'yahoo';

  const log = (msg: string) => {
    if (!options.silent) console.log(msg);
  };

  log(`\n======================================================`);
  log(`   INICIANDO CORRIDA SEMANAL DE LA LIGA DE TRADING    `);
  if (isScenario) {
    log(`   ⚠️ MODO ESCENARIO ACTIVO: "${escenarioName}" (Copia Temporal)`);
  }
  if (usarCache) {
    log(`   📦 MODO DEMO ACTIVO: Reutilizando caché de mercado (precios/noticias)`);
  }
  if (preferredProvider === 'stooq') {
    log(`   🔄 PROVEEDOR SELECCIONADO: Stooq (Plan B)`);
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
    for (const file of ['reglas.json', 'carteras.json', 'precios.csv', 'diario.md', 'cache_mercado.json']) {
      const src = path.join(realDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(tempDir, file));
      }
    }
    log(`[Escenario] Copia temporal de datos creada en: ${tempDir}`);
  }

  let tiempoPreciosMs = 0;
  let tiempoModeloMs = 0;
  let proveedorUsado: string = preferredProvider;
  let cacheHit = false;

  try {
    const rules: MarketRules = getRules(dataDir);
    let portfolios: PlayerPortfolios = getPortfolios(dataDir);
    const currentDate = new Date().toISOString().split('T')[0];

    // Si la fecha de inicio no fue fijada, se toma la del día de la primera corrida real
    if (!rules.fechaInicio || rules.fechaInicio === 'auto' || rules.fechaInicio === '') {
      rules.fechaInicio = currentDate;
      saveRules(rules, dataDir);
      log(`[Reglas] Fecha de inicio inicializada automáticamente con la fecha actual: ${currentDate}`);
    }

    const tickersToFetch = [...rules.empresasPermitidas, rules.indiceReferencia];

    // Cargar instrucciones del agente desde agente/instrucciones.md
    const agentInstructions = getAgentInstructions();
    log(`[Instrucciones] Cargadas desde agente/instrucciones.md (${agentInstructions.length} caracteres)`);

    // 2. Obtención de Precios y Noticias (con soporte de Caché de Modo Demo)
    const pricesStart = performance.now();
    const prices: Record<string, number> = {};
    let newsContext: Record<string, string[]> = {};
    const failedTickers: string[] = [];

    const cacheFilePath = path.join(process.cwd(), 'data', 'cache_mercado.json');

    if (usarCache && fs.existsSync(cacheFilePath)) {
      log(`[1/5] Modo Demo: Cargando precios y noticias desde data/cache_mercado.json...`);
      const cacheData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'));
      Object.assign(prices, cacheData.precios || {});
      newsContext = cacheData.noticias || {};
      proveedorUsado = 'cache';
      cacheHit = true;
      log(`  ✓ Precios en caché: ${Object.keys(prices).join(', ')}`);
    } else if (isScenario && escenarioName === 'baja12') {
      log(`[1/5] Modo Escenario baja12: Aplicando caída del 12% simulada...`);
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
        prices[t] = Number((base * 0.88).toFixed(2));
      }
      proveedorUsado = 'escenario-baja12';
      newsContext = { DIS: ['Mercado general reporta contracción del 12% en sector tecnológico.'] };
    } else {
      log(`[1/5] Obteniendo cotizaciones en vivo vía ${preferredProvider.toUpperCase()}...`);
      for (const ticker of tickersToFetch) {
        let data: TickerData | null = null;
        if (preferredProvider === 'stooq') {
          data = await getStooqPrice(ticker);
        } else {
          data = await getYahooPrice(ticker, 1);
        }

        if (data && typeof data.price === 'number') {
          prices[ticker] = data.price;
          proveedorUsado = data.source;
          log(`  ✓ ${ticker}: $${data.price.toFixed(2)} USD (fuente: ${data.source})`);
        } else {
          failedTickers.push(ticker);
          log(`  ✗ ${ticker}: Cotización no disponible. Se omitirá.`);
        }
      }

      log(`[Noticias] Obteniendo titulares financieros recientes en vivo...`);
      newsContext = await getRecentNewsForTickers(rules.empresasPermitidas, 2);

      // Si se activó --usar-cache y el archivo no existía, o para refrescarlo:
      try {
        fs.writeFileSync(
          cacheFilePath,
          JSON.stringify(
            {
              fecha: currentDate,
              timestamp: new Date().toISOString(),
              precios: prices,
              noticias: newsContext
            },
            null,
            2
          ),
          'utf-8'
        );
        log(`  ✓ Caché de mercado guardado en data/cache_mercado.json`);
      } catch (e) {
        // Ignorar error al escribir cache en caso de permisos
      }
    }

    tiempoPreciosMs = Number((performance.now() - pricesStart).toFixed(1));

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

    // 5. Preparar prompt para OpenAI
    log(`\n[4/5] Preparando contexto macro y de cartera para el Agente...`);
    let newsSummary = '';
    for (const [t, titles] of Object.entries(newsContext)) {
      if (titles && titles.length > 0) {
        newsSummary += `- ${t}: ${titles.join(' | ')}\n`;
      }
    }
    if (!newsSummary) newsSummary = 'Mercado estable sin noticias destacadas.';

    const marketPrompt = `
ESTADO ACTUAL DE TU CARTERA:
- Efectivo disponible: $${portfolios.agente.cash.toFixed(2)} USD.
- Posiciones abiertas: ${JSON.stringify(portfolios.agente.positions)}

LÍMITES Y REGLAS OFICIALES:
- Capital inicial: $${rules.capitalInicialPorJugador} USD.
- Empresas autorizadas: ${rules.empresasPermitidas.join(', ')}.
- Máxima exposición por empresa: ${(rules.maxPorcentajePorEmpresa * 100).toFixed(0)}% del total.
- Reserva obligatoria de efectivo: ${(rules.minEfectivoPorcentaje * 100).toFixed(0)}% del total.
- Stop-loss automático: Venta obligatoria al ${(rules.stopLossPorcentaje * 100).toFixed(0)}% de caída.

COTIZACIONES ACTUALES (USD):
${Object.entries(prices).map(([t, p]) => `${t}: $${p.toFixed(2)}`).join(', ')}

NOTICIAS RECIENTES:
${newsSummary}

Toma tu decisión estructurada para esta semana.
    `.trim();

    // 6. Consulta en VIVO al Modelo de OpenAI con Parseo Endurecido
    log(`[5/5] Consultando al modelo LLM en vivo con parseo endurecido...`);
    const apiKey = process.env.OPENAI_API_KEY;
    const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    let agentDecision: AgentDecision;

    if (apiKey && !apiKey.startsWith('tu_clave')) {
      const client = new OpenAI({ apiKey });
      const queryResult = await queryAgentWithHardenedParsing(
        client,
        modelName,
        agentInstructions,
        marketPrompt,
        log
      );
      agentDecision = queryResult.decision;
      tiempoModeloMs = queryResult.tiempoMs;
      log(`  ✓ Respuesta recibida y validada en ${tiempoModeloMs} ms`);
    } else {
      log(`  ℹ️ OPENAI_API_KEY no configurada. Usando decisión simulada.`);
      agentDecision = {
        accion: 'comprar',
        empresa: 'NVDA',
        cantidad: 1,
        motivo: 'Decisión simulada para entorno sin clave API.'
      };
      tiempoModeloMs = 5.0;
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

    // 9. Persistencia de datos
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

    const tiempoTotalMs = Number((performance.now() - globalStart).toFixed(1));
    log(`\n======================================================`);
    log(`⏱️ MÉTRICAS DE TIEMPO:`);
    log(`  - Tiempo total de corrida: ${(tiempoTotalMs / 1000).toFixed(2)} s (${tiempoTotalMs} ms)`);
    log(`  - Consulta precios/noticias: ${(tiempoPreciosMs / 1000).toFixed(2)} s`);
    log(`  - Modelo OpenAI en vivo: ${(tiempoModeloMs / 1000).toFixed(2)} s`);
    log(`  - Proveedor: ${proveedorUsado} | Caché: ${cacheHit ? 'SÍ' : 'NO'}`);
    log(`======================================================\n`);

    return {
      tiempoTotalMs,
      tiempoModeloMs,
      tiempoPreciosMs,
      proveedorUsado,
      cacheUsado: cacheHit
    };
  } finally {
    if (tempDirToRemove && fs.existsSync(tempDirToRemove)) {
      try {
        fs.rmSync(tempDirToRemove, { recursive: true, force: true });
        log(`[Escenario] Directorio temporal eliminado con éxito.`);
      } catch (err) {}
    }
  }
}

// Ejecución CLI directa
if (require.main === module || process.argv[1]?.includes('liga')) {
  const args = process.argv.slice(2);
  let escenario: string | undefined = undefined;
  let usarCache = false;
  let proveedor: 'yahoo' | 'stooq' | undefined = undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--escenario' && args[i + 1]) {
      escenario = args[i + 1];
    }
    if (args[i] === '--usar-cache') {
      usarCache = true;
    }
    if (args[i] === '--proveedor' && (args[i + 1] === 'yahoo' || args[i + 1] === 'stooq')) {
      proveedor = args[i + 1] as 'yahoo' | 'stooq';
    }
  }

  runLigaScript({ escenario, usarCache, proveedor })
    .catch((err) => {
      console.error('Error fatal al ejecutar liga.ts:', err);
      process.exit(1);
    });
}
