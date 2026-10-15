# Pendientes Manuales: Conectar con GitHub y Despliegue de Actions

Todo el código, pruebas, scripts, motor de simulación y workflow de GitHub Actions están listos y verificados localmente al 100%. Para habilitar la ejecución automática semanal en los servidores de GitHub, sigue estos 4 pasos cortos:

---

### Paso 1: Crear el repositorio en GitHub
1. Ingresa a tu cuenta de GitHub y crea un nuevo repositorio llamado: `trading-learning`
2. Déjalo **público o privado** y **sin inicializar** (no marques README, .gitignore ni licencia, porque ya los tenemos listos).

---

### Paso 2: Vincular el repositorio local y subir el código
Abre una terminal en la carpeta `trading-learning` y ejecuta los siguientes comandos:
```bash
cd "c:\Users\micag\Documents\proyectos personales\14_Pruebas_pre_clase\trading-learning"
git remote add origin https://github.com/<TU_USUARIO>/trading-learning.git
git branch -M master
git push -u origin master
```

---

### Paso 3: Configurar el Secret de OpenAI en GitHub
1. En tu repositorio de GitHub, ve a **Settings** (pestaña superior derecha).
2. En la barra lateral izquierda, baja hasta **Secrets and variables** y haz clic en **Actions**.
3. Haz clic en el botón verde **New repository secret**.
4. En **Name**, escribe exactamente: `OPENAI_API_KEY`
5. En **Secret**, pega tu clave de API de OpenAI.
6. Haz clic en **Add secret**.

---

### Paso 4: Permitir que el bot de GitHub Actions haga commits automáticos
1. En **Settings** de tu repositorio, ve en el menú izquierdo a **Actions** > **General**.
2. Desplázate hacia abajo hasta la sección **Workflow permissions**.
3. Selecciona la opción: **Read and write permissions** (para que el bot pueda commitear los precios y carteras actualizadas en `data/`).
4. Haz clic en **Save**.

---

### Paso 5: Probar la ejecución manual (Opcional)
1. Ve a la pestaña **Actions** en tu repositorio de GitHub.
2. Selecciona en el menú izquierdo el workflow **Liga Semanal de Trading**.
3. Haz clic en el botón desplegable **Run workflow** y luego en el botón verde **Run workflow**.
4. Observa la ejecución: el bot traerá las cotizaciones, consultará al agente OpenAI, validará las reglas y commiteará automáticamente los cambios a la rama principal.
