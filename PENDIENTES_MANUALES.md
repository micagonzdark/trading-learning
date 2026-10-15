# Pendientes Manuales y Verificaciones de Entorno

Este documento detalla las acciones manuales requeridas en GitHub y las consideraciones de verificación para macOS que no pueden automatizarse localmente desde este entorno Windows.

---

## 1. Conexión con GitHub y Automatización de Actions

El repositorio local está 100% preparado, con commits atómicos, workflow de Actions y soporte dual Yahoo/Stooq. Para activarlo en la nube:

1. **Crear el repositorio en GitHub**:
   - Crear un nuevo repositorio vacío en GitHub llamado `trading-learning` (sin README ni .gitignore).
2. **Vincular y subir el código**:
   ```bash
   cd "c:\Users\micag\Documents\proyectos personales\14_Pruebas_pre_clase\trading-learning"
   git remote add origin https://github.com/<TU_USUARIO>/trading-learning.git
   git branch -M master
   git push -u origin master
   ```
3. **Cargar el Secret de OpenAI**:
   - En GitHub: `Settings > Secrets and variables > Actions > New repository secret`.
   - Name: `OPENAI_API_KEY`
   - Secret: Tu clave de OpenAI.
4. **Habilitar permisos de escritura para el bot**:
   - En GitHub: `Settings > Actions > General > Workflow permissions`.
   - Seleccionar: `Read and write permissions` y guardar.
5. **Ejecutar prueba manual**:
   - En la pestaña `Actions`, elegir el workflow `Liga Semanal de Trading` y hacer clic en `Run workflow`.
   - El script ejecutará `liga.ts`, consultará OpenAI y commiteará automáticamente sobre `data/`.

---

## 2. Verificación de "Abrir Trading Learning.command" para macOS

El script fue analizado y optimizado línea por línea para macOS, con finales de línea UNIX (LF) forzados mediante `.gitattributes`, rutas de Apple Silicon (`/opt/homebrew/bin`), permisos ejecutables (`chmod +x`) y healthcheck compatible con BSD curl.

### Lo que NO se pudo probar por correr en Windows:
1. **Lanzamiento nativo desde Finder**: El comportamiento de macOS de abrir `Terminal.app` automáticamente al hacer doble clic sobre un archivo `.command`.
2. **Quarentine de Gatekeeper de macOS**: Si el archivo se descarga desde internet (ZIP o GitHub), macOS puede aplicarle el atributo `com.apple.quarantine`. En ese caso, en la primera apertura en Mac podría requerir hacer clic derecho > *Abrir* o ejecutar en terminal `xattr -d com.apple.quarantine "Abrir Trading Learning.command"`.
3. **Comando nativo `open`**: La invocación de `open http://localhost:3000` para abrir Safari/Chrome (en Windows se validó la sintaxis, pero el comando `open` solo existe en Darwin/macOS).
4. **Instalación automática vía Homebrew**: El flujo condicional `brew install node` en caso de que la Mac no tenga Node instalado.
