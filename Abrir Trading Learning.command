#!/bin/bash
# ==============================================================================
# Script de inicio rápido de Trading Learning para macOS
# Doble clic en este archivo para iniciar el simulador y abrir el navegador.
# ==============================================================================

# 1. Asegurar rutas habituales de Node y Homebrew en macOS (Apple Silicon e Intel)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# 2. Navegar a la carpeta del proyecto sin importar desde dónde se abra (Finder o Terminal)
cd "$(cd "$(dirname "$0")" && pwd)" || exit 1

echo "============================================="
echo "   Iniciando Trading Learning (macOS)"
echo "============================================="

# 3. Verificar si Node.js está instalado
if ! command -v node >/dev/null 2>&1; then
    echo "⚠️ Node.js no fue encontrado en tu sistema."
    if command -v brew >/dev/null 2>&1; then
        echo "Instalando Node.js con Homebrew..."
        brew install node
    else
        echo "Por favor descarga e instala Node.js desde: https://nodejs.org/"
        echo "Presiona Enter para cerrar esta ventana."
        read -r
        exit 1
    fi
fi

echo "✓ Node.js detectado: $(node -v)"

# 4. Instalar dependencias solo si falta la carpeta node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependencias necesarias (primera vez)..."
    npm install
else
    echo "✓ Dependencias ya instaladas."
fi

# 5. Crear .env desde .env.example si no existe
if [ ! -f ".env" ]; then
    echo "⚙️ Creando archivo .env inicial desde .env.example..."
    cp .env.example .env
fi

# 6. Iniciar el servidor Next.js en segundo plano
echo "🚀 Iniciando servidor de Trading Learning..."
npm run dev &
SERVER_PID=$!

# Función para cerrar el servidor de forma segura al salir de la terminal
cleanup() {
    echo ""
    echo "🛑 Deteniendo servidor Trading Learning (PID: $SERVER_PID)..."
    kill "$SERVER_PID" 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 7. Esperar a que el servidor responda en localhost:3000
echo "⏳ Esperando a que el servidor esté listo..."
until curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -E "200|304" >/dev/null 2>&1; do
    sleep 1
done

echo "✓ Servidor listo! Abriendo simulador en tu navegador..."
if command -v open >/dev/null 2>&1; then
    open "http://localhost:3000"
elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:3000"
fi

# 8. Mantener la terminal activa para mostrar los registros
echo ""
echo "============================================="
echo " Trading Learning está corriendo en:"
echo " http://localhost:3000"
echo " (Presiona Ctrl + C para detener)"
echo "============================================="
wait "$SERVER_PID"
