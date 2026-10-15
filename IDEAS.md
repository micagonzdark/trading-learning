# Ideas de Expansión y Mejoras (Fuera de Alcance Inicial)

Este documento registra ideas técnicas y pedagógicas surgidas durante el desarrollo pero omitidas deliberadamente para respetar el alcance mínimo estricto (Regla 2).

### Ideas Técnicas
- [ ] **Soporte para órdenes Stop-Loss y Take-Profit automáticas en la UI**: Permitir al alumno fijar precio objetivo y límite de pérdida al momento de comprar una acción desde la web.
- [ ] **Gráfico interactivo de Velas Japonesas (Candlesticks)**: Integrar TradingView Lightweight Charts en la vista de detalle de cada activo.
- [ ] **Múltiples perfiles de agentes de IA**: Crear un "Agente Agresivo" (enfocado en momentum), un "Agente Conservador" (enfocado en dividendos y baja volatilidad) y un "Agente Contrarian", para ver cómo compiten entre sí.
- [ ] **Notificaciones Push / Webhook**: Disparar mensajes a un canal de Discord o Telegram cada vez que el script de GitHub Actions ejecute una compra o venta semanal.
- [ ] **Métricas cuantitativas avanzadas**: Calcular y mostrar en el tablero el Ratio de Sharpe, Max Drawdown y Volatilidad anualizada de cada jugador.

### Ideas Pedagógicas para la Clase de 90 Minutos
- [ ] **Modo "Hackea a la IA"**: Desafío donde el alumno debe escribir un prompt que intente engañar al modelo para que compre una acción no permitida (ej: criptomonedas o empresas fuera de la lista), demostrando así por qué es imprescindible validar las reglas en el código duro y no confiar ciegamente en el LLM.
- [ ] **Modo "Crash del Mercado" en vivo**: Un botón en la UI o comando de terminal que simule un "Black Monday" (-25%) en vivo para que el alumno observe cómo se activa el stop-loss automático y protege su capital.
- [ ] **Glosario interactivo con Tooltips**: Explicaciones en lenguaje juvenil (13 años) sobre términos como "Slippage", "PPP (Precio Promedio Ponderado)", "Volatilidad" e "Índice SPY".
