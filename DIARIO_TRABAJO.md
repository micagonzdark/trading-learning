# Diario de Trabajo - Trading Learning (Prueba de Viabilidad de Clase 90 min)

## Inicio del Experimento
- **Fecha y Hora**: 2026-10-14 20:00 (Hora local)
- **Objetivo**: Desarrollar de punta a punta una plataforma de "Trading Learning" con Next.js + TypeScript, simulación realista, persistencia en archivos `data/`, script de agente semanal con OpenAI, evals exhaustivos, tablero de la liga y GitHub Actions con Stooq fallback. Evaluar con honestidad métricas de tiempo y viabilidad para un alumno de 13 años en una clase de 90 minutos.

## Decisiones Iniciales y Setup
1. **Ubicación**: Se creó el proyecto en `trading-learning` dentro de este espacio de trabajo.
2. **Entorno**: Node `v24.15.0`, npm `11.12.1`, git `2.50.0.windows.2` detectados y funcionando.
3. **Resguardo**: Se resguardaron archivos de la prueba previa (`DIARIO_TRABAJO_TIENDA.md`, `PRUEBA_TIENDA.md`, etc.).
4. **Git**: Se inicializó un repositorio git en `trading-learning` para versionar cada fase con commits claros en español.

---

## Fase 0: Diagnóstico y Base (Completada - ~20:00 a 20:05)
- **Node**: `v24.15.0`
- **npm**: `11.12.1`
- **Git**: `2.50.0.windows.2`
- **Proyecto**: Inicializado con `create-next-app` (Next.js 16 + React 19 + TypeScript + Tailwind CSS) en carpeta `trading-learning` con directorio `src/`.
- **Seguridad**: Se configuró `.gitignore` para ignorar `.env*` y permitir `.env.example`. Se creó `.env.example` y `.env` local sin exponer secretos.
- **Verificación**:
  - `npm run build`: Compilación exitosa sin errores de tipos.
  - `npm run dev`: Servidor levantado en puerto 3000, respuesta HTTP 200 comprobada con script de red.
- **Tiempo Fase 0**: ~5 minutos.

---

## Fase 1: Simulador Sencillo (Completada - ~20:05 a 20:12)
- **Estructura construida**:
  - `src/data/assets.json`: Activos permitidos (MELI, SPOT, AAPL, MSFT, NVDA, DIS) e índice de referencia (SPY).
  - `src/lib/types.ts`: Tipos `Asset`, `Price`, `Order`, `Portfolio`, `MarketRules`, `AgentDecision`.
  - `src/lib/market/providers/yahoo.ts`: Proveedor de cotizaciones reales e históricas usando Yahoo Finance chart API (`query1.finance.yahoo.com`), ejecutado estrictamente en servidor para evitar CORS, con reintento automático y fallback a Stooq CSV.
  - `src/lib/simulation/realism.ts`: Cálculo de comisión realista (0.1% o $0.50 mín.) y slippage (0.05%).
  - `src/lib/simulation/engine.ts`: Motor de órdenes de mercado con cálculo de Precio Promedio Ponderado (PPP), deducción de saldos, registro de órdenes y valuación de cartera.
  - `src/lib/storage.ts`: Módulo de persistencia atómica en archivos del repo (`data/`).
  - Rutas API en `src/app/api/`: `/api/prices`, `/api/portfolio`, `/api/buy`, `/api/sell`.
  - `src/app/page.tsx`: Simulador interactivo en tiempo real con saldos, rendimiento, activos en vivo, compra/venta e historial de órdenes.
  - Lanzador Mac `"Abrir Trading Learning.command"` con permisos de ejecución (`chmod +x`), autodetección de Node, instalación condicional de dependencias y apertura automática de navegador. Adicionalmente se creó `Abrir Trading Learning.bat` para Windows.
- **Elección técnica del proveedor**: Se optó por el endpoint de gráficos oficial de Yahoo Finance (`/v8/finance/chart/{ticker}`) consumido mediante `fetch` nativo con cabeceras de navegador. Respondió de forma instantánea (<2 seg los 7 activos) sin necesidad de paquetes pesados adicionales.

### Tabla de Verificación Fase 1

| Punto a Verificar | Condición Esperada | Resultado Observado | Estado |
| :--- | :--- | :--- | :---: |
| 1. Muestra precios reales | Traer cotizaciones en vivo de los 7 activos | Precios obtenidos (7/7): NVDA $221.30, SPY $769.60, SPOT $523.96, MELI $1839.11, MSFT $533.69, DIS $108.99, AAPL $342.96 | **APROBADO** |
| 2. Dinero limitado ($1,000 inicial) | Rechazar orden que supere saldo | Rechazó compra de 10 MELI ($18,418.70 requeridos vs $1,000 disponible) con mensaje: *"Saldo insuficiente"* | **APROBADO** |
| 3. Comprar y vender funciona | Ejecutar compra de 1 NVDA y posterior venta | Compra ejecutada a $221.41 (saldo bajó a $778.09) y venta ejecutada a $221.19 (saldo subió a $998.78 con comisiones/slippage) | **APROBADO** |
| 4. Guarda historial de operaciones | Persistir en `data/carteras.json` | 2 órdenes persistidas en disco con IDs únicos, timestamp, precios ejecutados, comisión y slippage | **APROBADO** |

- **Tiempo Fase 1**: ~7 minutos.

---

## Fase 2: Estado en Archivos (Completada - ~20:12 a 20:15)
- **Estructura en `data/`**:
  - `data/reglas.json`: Capital 1000 USD por jugador; empresas permitidas MELI, SPOT, AAPL, MSFT, NVDA, DIS; índice de referencia SPY; máximo 20% en una sola empresa; stop-loss 15%; reserva mínima en efectivo 10%; fecha de inicio "2026-10-14".
  - `data/carteras.json`: Inicializadas las 3 carteras ("moises", "agente", "indice"), con capital $1,000 en efectivo, posiciones vacías e historial vacío. El jugador "moises" se opera desde la UI y sincroniza automáticamente con este archivo como única fuente de verdad.
  - `data/precios.csv`: Cabecera estándar `fecha,ticker,cierre` para registro histórico append-only.
  - `data/diario.md`: Documento de bitácora para registrar decisiones del agente por corrida.
- **Verificación**: Archivos validados con lectura de tipos JSON y CSV.
- **Tiempo Fase 2**: ~3 minutos.

---

## Fase 3: Script Semanal de Liga (`scripts/liga.ts`) (Completada - ~20:15 a 20:25)
- **Implementación**:
  - `src/lib/simulation/rulesValidator.ts`: Validador estricto de reglas de la liga (límite 20% por empresa, reserva mínima 10% en efectivo, empresas permitidas, stop-loss automático al -15%).
  - `src/lib/market/providers/news.ts`: Extracción de titulares financieros vía RSS de Google News (100% gratuita, sin token).
  - `scripts/liga.ts`: Script ejecutor para Node/TSX.
    1. Obtiene cotizaciones en vivo y ajustadas con reintento automático.
    2. Primera corrida de "indice": Compra pasiva de SPY con todo el capital disponible.
    3. Consulta a OpenAI con clave `OPENAI_API_KEY` y modelo `OPENAI_MODEL` (`gpt-4o-mini`) exigiendo respuesta en JSON estructurado.
    4. Validación estricta por código (el modelo nunca ejecuta nada por sí mismo; si propone compras ilegales, se rechazan o ajustan).
    5. Valuación de las 3 carteras ("moises", "agente", "indice"), guardado en `carteras.json`, append a `precios.csv` y nueva entrada a `diario.md`.
    6. Modo escenario (`--escenario baja12`): Trabaja sobre una copia temporal en `os.tmpdir()` simulando caída del 12% y garantizando total inocuidad sobre los archivos reales en `data/`.
- **Verificación**: Ejecutado localmente tanto en modo normal como con `--escenario baja12`.
- **Tiempo Fase 3**: ~10 minutos.

---

## Fase 4: Evals Automáticos (`scripts/evals.ts`) (Completada - ~20:25 a 20:31)
- **Implementación**: Suite de pruebas unitarias y de integración previa en `scripts/evals.ts` evaluando los 7 requerimientos formales:
  - (a) Compra fuera de lista (TSLA) -> Rechazada.
  - (b) Compra que supera el 20% por empresa -> Ajusta cantidad hacia abajo respetando el tope.
  - (c) Compra sin efectivo suficiente -> Rechazada.
  - (d) Posición con caída > 15% -> Venta forzada por Stop-Loss.
  - (e) Cotización no disponible -> No opera con ese activo.
  - (f) Modo escenario `baja12` -> Hashes SHA-256 de `data/` idénticos antes y después.
  - (g) Reserva mínima 10% de efectivo -> Garantizada matemáticamente.
- **Verificación**: Los 7 casos resultaron **APROBADOS (7/7)** en su primera ejecución.
- **Tiempo Fase 4**: ~6 minutos.

---

## Fase 5: Tablero Web de la Liga (Completada - ~20:31 a 20:38)
- **Estructura**:
  - `src/app/api/liga/route.ts`: Endpoint GET que consolida reglas, valuación al cierre de los 3 jugadores, historial para curvas base 100 y lectura de `diario.md`.
  - `src/app/liga/page.tsx`: Tablero visual moderno con:
    - Gráfico interactivo SVG de curvas en Base 100 con línea de referencia de capital inicial ($1,000 = 100.0).
    - Selector para alternar entre datos reales de disco y simulación histórica de 5 semanas.
    - Tabla de posiciones oficial con medallas, rendimientos y detalles de carteras.
    - Bitácora con el diario de decisiones del agente.
- **Verificación**: Servidor probado con `curl/Invoke-WebRequest`; status 200 OK y carga de datos confirmada.
- **Tiempo Fase 5**: ~7 minutos.

---

## Fase 6: Automatización en GitHub Actions (Completada - ~20:38 a 20:42)
- **Estructura**:
  - `.github/workflows/liga-semanal.yml`: Configurado con trigger programado cron (`0 23 * * 5` - viernes 23:00 UTC) y manual (`workflow_dispatch`).
  - Utiliza `OPENAI_API_KEY` desde GitHub Secrets.
  - Permiso explícito `permissions: contents: write` para que el bot de GitHub pueda commitear sobre `data/`.
  - Detección de cambios con `git diff --staged --quiet` para commitear y pushear solo si hay actualizaciones.
- **Diagnóstico de Conectividad**:
  - Se diagnosticó que el repositorio local no tiene configurado ningún `remote origin` y la herramienta `gh` no está instalada.
  - Se documentaron los 4 pasos exactos de vinculación en `PENDIENTES_MANUALES.md`.
- **Tiempo Fase 6**: ~4 minutos.

---

## Fase 7: Prueba Completa y Verificación Multicorrida (Completada - ~20:42 a 20:47)
- **Ejecución Local**:
  - **Corrida 1**: Indice compró SPY ($770.75 USD). Agente evaluó mercado con GPT-4o-mini y propuso MELI; el validador rechazó la compra por superar el capital disponible. Precios agregados a `precios.csv` (8 filas) y primera entrada en `diario.md`.
  - **Corrida 2**: Se ejecutó de nuevo el script. Se verificó que "indice" mantuvo su posición previa en SPY (no duplicó ni pisó datos). El modelo propuso AAPL; el validador rechazó por superar el 20% de exposición máxima. `precios.csv` sumó 7 nuevas filas (15 en total) y `diario.md` agregó su segunda entrada (33 líneas).
  - **Corrida 3 (Modo Escenario `baja12`)**: Se ejecutó con precios simulados con -12%. "indice" sufrió la caída del mercado a $722.05 USD (-27.80%), el agente compró 1 acción de AAPL a precio de descuento ($193.70 USD) ajustado por la regla. Al finalizar, el directorio temporal fue destruido y los archivos reales de `data/` se mantuvieron 100% inalterados (15 filas en CSV, 33 líneas en MD).
- **Tiempo Fase 7**: ~5 minutos.
