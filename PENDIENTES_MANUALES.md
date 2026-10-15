# Pasos Manuales: Conectar con GitHub y Ejecutar Actions

El repositorio remoto aún no existe en GitHub. Para crearlo y correr el workflow automáticamente en la nube, seguí estos 5 pasos exactos, cortos y numerados:

1. **Crear el repositorio en GitHub**:
   - Entrá a https://github.com/new
   - Nombre del repositorio: `trading-learning`
   - Dejalo público o privado, **sin tildar** README, .gitignore ni licencia (ya están listos en tu máquina).
   - Hacé clic en **Create repository**.

2. **Subir tu código local a GitHub**:
   Abrí PowerShell o una terminal y corré estos comandos:
   ```bash
   cd "c:\Users\micag\Documents\proyectos personales\14_Pruebas_pre_clase\trading-learning"
   git remote add origin https://github.com/<TU_USUARIO>/trading-learning.git
   git branch -M master
   git push -u origin master
   ```

3. **Cargar la clave de OpenAI en GitHub**:
   - En tu repo en GitHub, andá a la pestaña **Settings** (arriba a la derecha).
   - En el menú lateral izquierdo, andá a **Secrets and variables** > **Actions**.
   - Hacé clic en el botón verde **New repository secret**.
   - En **Name**: `OPENAI_API_KEY`
   - En **Secret**: Pegá tu clave de OpenAI (`sk-...`).
   - Hacé clic en **Add secret**.

4. **Habilitar permisos de escritura para el bot**:
   - En **Settings**, andá a **Actions** > **General**.
   - Bajá hasta la sección **Workflow permissions**.
   - Marcá la opción: **Read and write permissions** (para que el bot pueda commitear los resultados en `data/`).
   - Hacé clic en **Save**.

5. **Ejecutar el workflow a mano y ver el resultado**:
   - Andá a la pestaña **Actions** en GitHub.
   - En la lista izquierda, hacé clic en **Liga Semanal de Trading**.
   - Hacé clic en **Run workflow** (botón desplegable a la derecha) y luego en el botón verde **Run workflow**.
   - Hacé clic en la corrida que se inicia para ver la terminal en vivo:
     - Verás si los servidores de GitHub pudieron consultar Yahoo Finance o si Stooq fue invocado.
     - Al finalizar, verás un nuevo commit automático del bot actualizando `data/precios.csv`, `data/carteras.json` y `data/diario.md`.
