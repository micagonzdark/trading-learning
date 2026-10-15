# Informe de Viabilidad y Resultados: Trading Learning

## 1. Resumen Ejecutivo de Viabilidad (5 líneas)
Una clase de 90 minutos para un estudiante de 13 años es **viable únicamente bajo un modelo de "Starter Kit guiado"**, donde la infraestructura ya esté resuelta y el alumno se enfoque en la lógica de negocio, las reglas financieras y el prompt del agente. Construir toda la arquitectura desde cero (Next.js, motor de órdenes, PPP, integración Yahoo, evals, dashboard y CI/CD) demandó más de 50 minutos a un agente autónomo y tomaría más de 4 horas a un programador experimentado; para un joven de 13 años resultaría frustrante e inalcanzable. En cambio, si el alumno recibe la plataforma funcionando y dedica los 90 minutos a modificar `reglas.json`, programar la estrategia del LLM y competir contra la IA, la clase es un éxito pedagógico extraordinario.

---

## 2. Tabla de Qué Funcionó y Qué No (Por Fase)

| Fase | Qué Funcionó | Qué No Funcionó / Dificultades | Alternativa / Solución Aplicada |
| :--- | :--- | :--- | :--- |
| **Fase 0: Diagnóstico y Base** | Detección de Node `v24.15.0`, npm `11.12.1`, git. Scaffolding automático de Next.js 16 con TypeScript y Tailwind. Servidor dev levantado con HTTP 200. | Ninguna falla de dependencias. | Flujo limpio estándar. |
| **Fase 1: Simulador Sencillo** | Cotizaciones en tiempo real vía Yahoo Chart API (<2s), motor de slippage (0.05%) y comisiones ($0.50 mín), cálculo de PPP, persistencia en archivos, scripts de inicio para Mac (`.command` con `chmod +x`) y Windows (`.bat`). | `export const dynamic = 'force-dynamic'` causó error de compilación en Turbopack Next.js 16 con `cacheComponents`. | Se removió la directiva redundante; Turbopack compiló inmediatamente en 594ms. |
| **Fase 2: Estado en Archivos** | Creación y estructura de `reglas.json`, `carteras.json`, `precios.csv` y `diario.md`. Lectura y escritura atómica sin pérdida de datos. | Ninguna falla. | Estructura JSON validada con TypeScript. |
| **Fase 3: Script Semanal (`liga.ts`)** | Conexión con `OPENAI_MODEL` (`gpt-4o-mini`), respuestas en JSON estructurado, regla de primera corrida de SPY para índice, validación estricta de reglas por código (el LLM nunca ejecuta solo), stop-loss automático y modo escenario `--escenario baja12`. | Stooq CSV bloquea peticiones automáticas con 403 Forbidden ("Access denied") sin cookies de sesión. | Yahoo Chart API funcionó 100% estable como proveedor primario. Se implementó Google News RSS para noticias sin necesidad de API keys. |
| **Fase 4: Evals Automáticos** | Suite automatizada en `scripts/evals.ts` validando los 7 casos requeridos. 100% de casos aprobados en primera corrida. | Ninguno. | Verificación matemática determinística de límites. |
| **Fase 5: Tablero Web de la Liga** | Página `/liga` interactiva con gráfico SVG responsivo en base 100, tabla de posiciones con medallas (#1, #2, #3), desglose de carteras, y visualizador del diario del agente. | Ninguno. | Se agregó además un selector para alternar entre datos reales de disco y simulación de 5 semanas. |
| **Fase 6: Automatización** | Archivo `.github/workflows/liga-semanal.yml` con sintaxis YAML válida, cron viernes 23:00 UTC, `workflow_dispatch` y commit automático condicional sobre `data/`. | No existe repositorio remoto vinculado en GitHub en la máquina local (`git remote -v` vacío, CLI `gh` no instalada). | Se preparó todo el repositorio localmente y se documentaron los pasos exactos en `PENDIENTES_MANUALES.md`. |
| **Fase 7: Prueba Completa** | Doble corrida local consecutiva verificando acumulación limpia en `precios.csv` (8 a 15 filas) y `diario.md` (19 a 33 líneas). Corrida de modo escenario comprobando total inocuidad sobre `data/`. | Ninguno. | Verificación por hashes criptográficos SHA-256. |

---

## 3. Tabla de Evals con Resultados

| Caso | Escenario Evaluado | Comportamiento Esperado | Resultado Obtenido | Estado |
| :--- | :--- | :--- | :--- | :---: |
| **(a)** | Agente solicita comprar acción no permitida (TSLA) | Rechazar orden, no compra, saldo y cartera intactos | Rechazada: TSLA no está en la lista de empresas permitidas (MELI, SPOT, AAPL, MSFT, NVDA, DIS) | **APROBADO** |
| **(b)** | Compra supera el 20% del valor total de la cartera (2 NVDA = $300 > $200) | Compra menos (1 acción) o no compra para no violar el 20% | Ajustó orden a 1 acción ($150 = 15.0% de exposición, dentro de regla) | **APROBADO** |
| **(c)** | Compra con saldo insuficiente ($50 disponible vs $100 de DIS) | Rechazar orden, no compra | Rechazada por saldo insuficiente y límite de liquidez | **APROBADO** |
| **(d)** | Posición cae más del 15% de su precio de compra (DIS comprada a $100 cae a $80 = -20%) | Vender automáticamente la posición | Stop-Loss activado: vendió las 2 acciones de DIS a $80 (-20.00% caída) y restituyó liquidez | **APROBADO** |
| **(e)** | Falta de cotización de mercado para un activo | No operar con esa empresa, rechazar orden | Rechazada: No hay cotización disponible para MELI | **APROBADO** |
| **(f)** | Ejecución de script en modo escenario (`--escenario baja12`) | No modificar ningún archivo en la carpeta `data/` | Hashes SHA-256 idénticos antes y después (`36d4c224... == 36d4c224...`) | **APROBADO** |
| **(g)** | Intento de agotar toda la caja en compras | Mantener reserva mínima de efectivo >= 10% ($100 USD) | Efectivo final $899.45 (90.0% del total; compras restringidas para jamás perforar el 10%) | **APROBADO** |

---

## 4. Tiempos Aproximados por Fase

| Fase | Duración Estimada (Desarrollo Autónomo) | Duración Equivalente (Alumno 13 años sin plantilla) |
| :--- | :---: | :---: |
| Fase 0: Diagnóstico y Base | ~5 min | 45 min (con problemas de PATH, versiones y dependencias) |
| Fase 1: Simulador Sencillo | ~12 min | 120 min (Next.js, APIs, React hooks, CSS, Yahoo API) |
| Fase 2: Estado en Archivos | ~3 min | 20 min (Estructuras JSON y persistencia en disco) |
| Fase 3: Script Semanal (`liga.ts`) | ~10 min | 60 min (Prompts de OpenAI, SDK, validación de reglas) |
| Fase 4: Evals Automáticos | ~6 min | 45 min (Aserciones, mocking y testing) |
| Fase 5: Tablero Web de la Liga | ~7 min | 60 min (Gráficos SVG, tablas y diseño responsive) |
| Fase 6: Automatización GitHub Actions | ~4 min | 30 min (YAML, sintaxis cron, permisos de bots y secrets) |
| Fase 7: Prueba Completa y Verificación | ~5 min | 20 min (Ejecución y análisis de resultados) |
| **TOTAL** | **~52 min** | **> 6 horas** |

---

## 5. Acciones Manuales Necesarias
*(Detalladas paso a paso en `PENDIENTES_MANUALES.md`)*
1. Crear un repositorio vacío en GitHub llamado `trading-learning`.
2. Vincular el remoto local con `git remote add origin https://github.com/<usuario>/trading-learning.git` y hacer `git push -u origin master`.
3. Cargar el Secret `OPENAI_API_KEY` en `Settings > Secrets and variables > Actions`.
4. Habilitar permisos de escritura en GitHub Actions (`Settings > Actions > General > Workflow permissions > Read and write permissions`).

---

## 6. Los 3 Riesgos Más Grandes para Hacer Esto en 90 Minutos con un Alumno de 13 Años

1. **Frustración por errores de sintaxis y tipado estricto (TypeScript + React)**:
   A los 13 años, pasar 30 minutos buscando una coma faltante, una llave desalineada o un error de tipos (`TS2322`) destruye el interés lúdico del alumno. La programación desde cero de 8 archivos interconectados dispersa la atención del objetivo pedagógico central: entender cómo piensan las IAs y cómo funcionan los mercados.

2. **Fricciones de entorno y conectividad externa**:
   Problemas con Node en Windows/Mac, políticas de PowerShell (`ExecutionPolicy`), bloqueos de red en colegios o redes hogareñas (firewalls bloqueando Yahoo Finance o puertos locales), y fallas de cuota/crédito en OpenAI pueden frenar la clase en seco sin posibilidad de avance.

3. **Sobrecarga conceptual acumulativa (Cognitive Overload)**:
   Pretender que en 90 minutos un alumno asimile simultáneamente: qué es una acción, qué es el S&P 500, qué es el deslizamiento (slippage), qué es el precio promedio ponderado (PPP), cómo funciona un LLM con JSON estructurado, cómo se dibuja un SVG y cómo opera un servidor CI/CD en la nube de GitHub es pedagógicamente contraproducente.

---

## 7. Qué Recortarías para que Entre en la Clase de 90 Minutos

Para convertir esta experiencia en una clase inolvidable y 100% exitosa:
1. **Entregar el proyecto como plantilla base ya armada ("Starter Kit")**:
   El alumno clona o descarga la carpeta, ejecuta `Abrir Trading Learning` (doble clic) y ya tiene el simulador corriendo en el minuto 5.
2. **Eliminar la programación del frontend y de las rutas API**:
   El alumno no debe escribir código React ni endpoints Next.js. Esas capas deben funcionar como "caja negra" transparente.
3. **Eliminar la configuración manual de GitHub Actions**:
   El workflow se entrega preconfigurado en la plantilla y el docente lo muestra en 5 minutos como "magia de automatización en la nube".
4. **Foco exclusivo de los 90 minutos**:
   - **Minutos 0-15**: Introducción lúdica: qué es el mercado, comprar 2 acciones en el simulador web de Moisés.
   - **Minutos 15-35**: Personalizar `reglas.json` (elegir empresas favoritas, fijar capital y stop-loss).
   - **Minutos 35-65**: Abrir el archivo del Agente y tunear su "cerebro" (experimentar con el System Prompt del LLM: hacerlo agresivo, conservador o analista de noticias).
   - **Minutos 65-80**: Correr `npm run liga` o `liga.ts --escenario baja12` y ver cómo el código frena a la IA cuando intenta romper las reglas.
   - **Minutos 80-90**: Ver el Tablero Web (`/liga`), analizar quién ganó y reflexionar sobre la gestión de riesgo.

---

## 8. Cuánto de la Fase 1 Entra en los 10 Minutos de la Clase, y Qué Recortarías

- **Qué entra en los 10 minutos**:
  Únicamente la **experiencia de usuario**: abrir la aplicación con un solo clic, ver el saldo de $1,000 USD, comprar 1 acción de Apple o NVIDIA, ver cómo se descuenta el efectivo junto a una pequeña comisión de $0.50, y venderla para ver el historial de transacciones. Eso transmite inmediatamente la sensación de poder y realidad económica.
- **Qué recortarías al 100%**:
  No se debe programar ni una sola línea de la Fase 1 en esos 10 minutos. Escribir `yahoo.ts`, `realism.ts`, `engine.ts`, las rutas de `/api/buy` y el componente de React tomaría al alumno al menos dos clases completas. Toda la Fase 1 debe estar precompilada y lista para usarse.
