#!/bin/bash
# Script de inicio rápido de Trading Learning para macOS

# 1. Navegar a la carpeta del proyecto sin importar desde dónde se invoque el script
cd "$(cd "$(dirname "$0")" && pwd)"

echo "============================================="
echo "   Iniciando Trading Learning Simulator"
echo "============================================="

# 2. Verificar si Node.js está instalado
if ! command -v node >/dev/null 2>&1; then
    echo "Node.js no fue encontrado en tu sistema."
    if command -v brew >/dev/null 2>&1; then
        echo "Instalando Node.js con Homebrew..."
        brew install node
    else
        echo "Por favor instala Node.js desde https://nodejs.org/"
        echo "Presiona Enter para salir."
        read -r
        exit 1
    fi
fi

echo "✓ Node.js detectado: $(node -v)"

# 3. Correr npm install solo si falta la carpeta node_modules
if [ ! -d "node_modules" ]; then
    echo "Instalando dependencias necesarias (primera vez)..."
    npm install
else
    echo "✓ Dependencias ya instaladas."
fi

# 4. Crear .env desde .env.example si no existe
if [ ! -f ".env" ]; then
    echo "Creando archivo .env inicial desde .env.example..."
    cp .env.example .env
fi

# 5. Iniciar el servidor Next.js en segundo plano
echo "Iniciando servidor de desarrollo..."
npm run dev &
SERVER_PID=$!

# Función para limpiar el proceso al cerrar
cleanup() {
    echo ""
    echo "Deteniendo servidor Trading Learning..."
    kill "$SERVER_PID" 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 6. Esperar a que el servidor esté listo y abrir el navegador
echo "Esperando a que el servidor responda en http://localhost:3000..."
while ! curl -s --head --request GET http://localhost:3000 | grep "200 OK" > /dev/null 2>&1; do
    sleep 1
done

echo "✓ Servidor listo! Abriendo navegador..."
if command -v open >/dev/null 2>&1; then
    open "http://localhost:3000"
elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:3000"
fi

# 7. Mantener la terminal abierta mostrando los logs
echo "Trading Learning está corriendo en http://localhost:3000"
echo "Presiona Ctrl+C en esta ventana para detener el servidor."
wait "$SERVER_PID"
