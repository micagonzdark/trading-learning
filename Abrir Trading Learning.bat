@echo off
title Trading Learning Launcher
cd /d "%~dp0"
echo =============================================
echo    Iniciando Trading Learning Simulator
echo =============================================

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js no fue encontrado en tu sistema.
    echo Por favor instala Node.js desde https://nodejs.org/
    pause
    exit /b 1
)

if not exist node_modules (
    echo Instalando dependencias necesarias (primera vez)...
    call npm install
)

if not exist .env (
    echo Creando archivo .env inicial...
    copy .env.example .env
)

echo Iniciando servidor de desarrollo...
start "" http://localhost:3000
npm run dev
