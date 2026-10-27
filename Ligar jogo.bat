@echo off
rem Liga o Poke Fable Online local: servidor (HTTP+WebSocket 5190) e cliente Vite (5300), e abre o navegador.
cd /d "%~dp0"
if not exist node_modules call npm install
start "Pokemon - Servidor (5190)" cmd /k node servidor.mjs
start "Pokemon - Cliente (5300)" cmd /k npx vite
timeout /t 4 >nul
start "" http://localhost:5300/
