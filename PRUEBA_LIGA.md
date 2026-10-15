# Informe de Viabilidad y Resultados: Trading Learning (Plantilla de Clase)

## 1. Resumen Ejecutivo Final (5 líneas)
La transformación a Plantilla de Clase convirtió una arquitectura técnica compleja en una **experiencia educativa 100% viable y estimulante para 90 minutos**. Al separar la estrategia en `agente/instrucciones.md` y las reglas en `data/reglas.json`, el alumno de 13 años experimenta en lenguaje natural sin riesgo de romper el motor. La prueba de efecto demostró que cambiar la personalidad cambia drásticamente las decisiones del modelo (de esperar a comprar Spotify apasionadamente), y alterar los límites habilita o bloquea compras en tiempo real. Con el modo demo (`--usar-cache`) la corrida toma apenas 1.18 segundos manteniendo la IA en vivo, garantizando una clase fluida incluso sin internet estable. El código duro sigue siendo el árbitro incorruptible de la simulación.

---

## 2. Verificación de Efecto: Instrucciones y Reglas

Se ejecutaron pruebas directas para comprobar que las modificaciones de los archivos del alumno impactan inmediatamente en el comportamiento del sistema sin tocar código:

### Prueba de Cambio de Instrucciones (`agente/instrucciones.md`):
- **Instrucción Original (Inversor Prudente)**:
  - Propuesta del Agente: `ESPERAR 0 acciones de NINGUNA`
  - Motivo: *"Las noticias recientes en el sector indican volatilidad y caídas... Es mejor esperar y no hacer movimientos impulsivos."*
- **Instrucción Modificada (Fanático de Spotify)**:
  - Se configuró al agente como fanático obsesivo de Spotify (SPOT), ignorando caídas y buscando comprar SPOT prioritariamente.
  - Propuesta del Agente: `COMPRAR 1 acción de SPOT`
  - Motivo: *"Spotify está destinado a dominar el mundo del audio digital con su innovador enfoque en la música... representa una oportunidad de crecimiento explosivo para los inversionistas como yo."*
  - **Resultado de la Validación**: `RECHAZADA` por el motor de reglas porque 1 acción de SPOT cuesta $523.96 USD, superando el límite del 20% ($200 USD) de la cartera.

### Prueba de Cambio de Límites (`data/reglas.json`):
- Se editó `maxPorcentajePorEmpresa` subiéndolo de `0.20` (20%) a `0.60` (60% = $600 USD).
- Se ejecutó nuevamente el script con la misma orden de compra de SPOT:
  - **Resultado de la Validación**: `ACEPTADA Y EJECUTADA` inmediatamente.
  - Orden ejecutada: `1 SPOT a $524.22 USD (Total: $524.74 USD)`.
  - Efectivo actualizado: se redujo de $890.46 a $365.72 USD, registrándose la operación en `data/carteras.json` e historial.

---

## 3. Modo Demo con Caché (`--usar-cache`) y Métricas de Tiempo

Se implementó la bandera `--usar-cache` que almacena y reutiliza **únicamente las cotizaciones y noticias** en `data/cache_mercado.json`, asegurando que el modelo de Inteligencia Artificial **siempre corra en vivo**:

| Modo de Corrida | Tiempo Total | Consulta Precios/Noticias | Modelo OpenAI (en vivo) | Estado de Red |
| :--- | :---: | :---: | :---: | :--- |
| **Corrida Completa en Vivo** | **6.42 s** | 4.90 s (Yahoo + Google RSS) | 1.50 s | Requiere internet |
| **Modo Demo con Caché (`--usar-cache`)** | **1.18 s** | 0.00 s (Instantáneo desde disco) | 1.17 s | Solo requiere API de OpenAI |
| **Plan B con Stooq (`--proveedor stooq`)** | **7.55 s** | 5.98 s (Stooq + Fallback) | 1.56 s | Resiliencia ante bloqueos |

*Conclusión pedagógica*: En un aula escolar con Wi-Fi compartido o lento, el modo `--usar-cache` reduce el tiempo de espera de 6.5 segundos a 1.18 segundos, manteniendo intacta la emoción del alumno de ver a la IA decidir en vivo.

---

## 4. Parseo Endurecido y Tolerancia a Fallos

Se implementó un esquema de salida JSON estructurado con ciclo de auto-recuperación de hasta 2 reintentos:
1. **Validación de esquema estricta**: Verifica tipo y rango de `accion`, `empresa`, `cantidad` (entero >= 0) y `motivo`.
2. **Reintento con feedback correctivo**: Si el modelo omite campos o envía un formato inválido, el script le devuelve el error exacto (`"Tu respuesta anterior tuvo errores de validación: [detalle]"`) solicitando la corrección inmediata.
3. **Manejo de "Esperar"**: Si el agente decide `esperar`, el campo empresa se normaliza automáticamente sin obligar al modelo a inventar un activo inexistente.
4. **Mensaje de fallo controlado**: Si tras 2 reintentos el modelo no responde conforme al esquema, se aborta la operación con aviso explícito y se preserva el efectivo de la cartera sin crashear.

---

## 5. Auditoría de "Abrir Trading Learning.command" para macOS

Se revisó minuciosamente cada línea del script para compatibilidad nativa con macOS:
- **Shebang**: `#!/bin/bash` estándar en macOS.
- **Finales de línea**: UNIX (LF) forzados mediante `.gitattributes` (`*.command text eol=lf`) para evitar el error `\r: command not found`.
- **Permisos POSIX**: Permiso `+x` (100755) fijado en el árbol de Git (`git update-index --chmod=+x`).
- **Navegación robusta**: `cd "$(cd "$(dirname "$0")" && pwd)"` resuelve la anomalía de Finder de abrir la terminal en `$HOME`.
- **Rutas de Apple Silicon**: `export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"` garantiza que Node sea encontrado tanto en chips M1/M2/M3/M4 como en Intel.
- **Healthcheck BSD**: Bucle `until curl -s -o /dev/null -w "%{http_code}" ... | grep -E "200|304"` compatible con el `curl` nativo de macOS.
- **Apertura de navegador**: Comando `open "http://localhost:3000"`.

### Aspectos que no pudieron probarse por ejecutar en entorno Windows:
1. La apertura visual automática de la aplicación `Terminal.app` al hacer doble clic desde el Finder de macOS.
2. El diálogo de advertencia de Gatekeeper (`com.apple.quarantine`) en caso de descargar el proyecto desde internet.
3. La ejecución nativa del binario `/usr/bin/open` de macOS.
4. La instalación desatendida de Node con Homebrew (`brew install node`) ante la ausencia total del runtime.

---

## 6. Estado de Automatización y Plan B (Stooq vs Yahoo)

- **GitHub Actions**: Workflow configurado en `.github/workflows/liga-semanal.yml` con cron los viernes a las 23:00 UTC y botón manual. Se documentaron los pasos de vinculación y carga de secretos en `PENDIENTES_MANUALES.md`.
- **Plan B (Stooq)**: El proveedor `yahoo.ts` implementa fallback automático a Stooq (`https://stooq.com/q/d/l/?s=ticker.us&i=d`) y a cotizaciones referenciales offline.
- **Resultado de la prueba local de proveedores**:
  - **Yahoo Finance**: Respondió 100% de las consultas en tiempo real (<2s los 7 activos).
  - **Stooq**: Los servidores de Stooq bloquean actualmente IPs no residenciales con HTTP 403 (*"Access denied"*). Gracias a la arquitectura de contingencia, el sistema detectó la negativa de Stooq y conmutó automáticamente a las cotizaciones referenciales offline sin interrumpir la liga.

---

## 7. Resultados de Evals Automáticos (7/7 Aprobados)

| Caso | Validación | Resultado |
| :--- | :--- | :---: |
| (a) Empresa fuera de lista | Intento de compra de TSLA rechazado inmediatamente | **APROBADO** |
| (b) Límite 20% por empresa | Compra de 2 NVDA ($300) ajustada automáticamente a 1 ($150) | **APROBADO** |
| (c) Efectivo insuficiente | Compra de DIS ($100) con $50 de saldo rechazada | **APROBADO** |
| (d) Stop-loss automático | Venta forzada de DIS comprada a $100 tras caída a $80 (-20%) | **APROBADO** |
| (e) Cotización ausente | Rechazo a operar con MELI si no hay precio de mercado | **APROBADO** |
| (f) Inocuidad de modo escenario | `--escenario baja12` no modifica ni 1 byte de la carpeta `data/` | **APROBADO** |
| (g) Reserva mínima 10% | Efectivo final resguardado por encima del mínimo requerido | **APROBADO** |
