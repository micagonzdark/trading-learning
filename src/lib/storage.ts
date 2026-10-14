import fs from 'fs';
import path from 'path';
import { MarketRules, PlayerPortfolios, Portfolio } from './types';

const DEFAULT_DATA_DIR = path.join(process.cwd(), 'data');

/**
 * Obtiene la ruta al directorio de datos.
 * Si se especifica un customDir (como en el modo escenario), usa esa ruta.
 */
export function getDataDirectory(customDir?: string): string {
  if (customDir) return customDir;
  return DEFAULT_DATA_DIR;
}

/**
 * Carga las reglas oficiales de la liga desde data/reglas.json
 */
export function getRules(customDir?: string): MarketRules {
  const dir = getDataDirectory(customDir);
  const filePath = path.join(dir, 'reglas.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Archivo de reglas no encontrado en: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Carga las carteras de los jugadores desde data/carteras.json
 */
export function getPortfolios(customDir?: string): PlayerPortfolios {
  const dir = getDataDirectory(customDir);
  const filePath = path.join(dir, 'carteras.json');
  if (!fs.existsSync(filePath)) {
    // Cartera por defecto si el archivo fue borrado
    const initial: PlayerPortfolios = {
      moises: { cash: 1000, positions: [], history: [] },
      agente: { cash: 1000, positions: [], history: [] },
      indice: { cash: 1000, positions: [], history: [] }
    };
    savePortfolios(initial, customDir);
    return initial;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Guarda las carteras en data/carteras.json de manera atómica
 */
export function savePortfolios(portfolios: PlayerPortfolios, customDir?: string): void {
  const dir = getDataDirectory(customDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, 'carteras.json');
  const tempPath = path.join(dir, `carteras.tmp.${Date.now()}.json`);
  fs.writeFileSync(tempPath, JSON.stringify(portfolios, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
}

/**
 * Obtiene la cartera de un jugador específico ("moises", "agente", "indice")
 */
export function getPlayerPortfolio(player: string, customDir?: string): Portfolio {
  const all = getPortfolios(customDir);
  if (!all[player]) {
    all[player] = { cash: 1000, positions: [], history: [] };
    savePortfolios(all, customDir);
  }
  return all[player];
}

/**
 * Actualiza la cartera de un jugador específico en data/carteras.json
 */
export function updatePlayerPortfolio(player: string, portfolio: Portfolio, customDir?: string): void {
  const all = getPortfolios(customDir);
  all[player] = portfolio;
  savePortfolios(all, customDir);
}

/**
 * Agrega registros al archivo data/precios.csv
 */
export function appendPricesCsv(
  rows: Array<{ fecha: string; ticker: string; cierre: number }>,
  customDir?: string
): void {
  const dir = getDataDirectory(customDir);
  const filePath = path.join(dir, 'precios.csv');
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, 'fecha,ticker,cierre\n', 'utf-8');
  }
  const lines = rows.map((r) => `${r.fecha},${r.ticker},${r.cierre.toFixed(2)}`).join('\n') + '\n';
  fs.appendFileSync(filePath, lines, 'utf-8');
}

/**
 * Agrega una entrada al diario del agente en data/diario.md
 */
export function appendAgentDiary(entryText: string, customDir?: string): void {
  const dir = getDataDirectory(customDir);
  const filePath = path.join(dir, 'diario.md');
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '# Diario de Decisiones del Agente - Trading Learning\n\n---\n', 'utf-8');
  }
  fs.appendFileSync(filePath, '\n' + entryText.trim() + '\n\n---\n', 'utf-8');
}
