@echo off
setlocal enabledelayedexpansion
title AutoParts - Lanceur
cd /d "%~dp0"

echo ================================================
echo    AutoParts Cameroun - demarrage complet
echo ================================================
echo.

REM ---- 1/4 Docker Desktop + conteneurs ------------------------
echo [1/4] Docker...
docker info >nul 2>&1
if errorlevel 1 (
  if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
    start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
  ) else (
    echo    ERREUR : Docker Desktop introuvable - installe-le d'abord.
    pause
    exit /b 1
  )
  set /a tries=0
  :waitdocker
  timeout /t 5 /nobreak >nul
  docker info >nul 2>&1
  if errorlevel 1 (
    set /a tries+=1
    if !tries! LSS 18 goto waitdocker
    echo    ERREUR : le moteur Docker ne repond pas apres 90 s.
    pause
    exit /b 1
  )
)
echo    Docker OK.
cd /d "%~dp0autoparts-backend"
docker compose up -d >nul 2>&1
docker start autoparts-postgres autoparts-redis >nul 2>&1
echo    PostgreSQL + Redis demarres.

REM ---- 2/4 Backend API (port 3000) ----------------------------
echo [2/4] Backend...
if not exist "%~dp0autoparts-backend\node_modules" (
  echo    Premiere fois : installation des dependances backend...
  pushd "%~dp0autoparts-backend"
  call npm install
  popd
)
start "AutoParts-Backend" cmd /k "cd /d %~dp0autoparts-backend && npm run dev"

REM ---- 3/4 App Web (port 5173) --------------------------------
echo [3/4] App web...
if not exist "%~dp0autoparts-frontend\node_modules" (
  echo    Premiere fois : installation des dependances frontend...
  pushd "%~dp0autoparts-frontend"
  call npm install
  popd
)
start "AutoParts-Web" cmd /k "cd /d %~dp0autoparts-frontend\apps\web && npx vite --port 5173"

REM ---- 4/4 App Mobile (Expo) ----------------------------------
echo [4/4] App mobile...
REM IP locale du PC : le telephone l'utilise pour joindre le backend
set "LOCAL_IP="
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' } | Select-Object -First 1).IPAddress" 2^>nul') do set "LOCAL_IP=%%i"
if "%LOCAL_IP%"=="" set "LOCAL_IP=localhost"
start "AutoParts-Mobile" cmd /k "cd /d %~dp0autoparts-frontend\apps\mobile && set EXPO_PUBLIC_API_URL=http://%LOCAL_IP%:3000/api/v1&& npx expo start"

echo.
echo ================================================
echo    Tout est lance !
echo    API    : http://localhost:3000/health
echo    Web    : http://localhost:5173
echo    Mobile : scanne le QR code avec Expo Go
echo             backend joignable sur http://%LOCAL_IP%:3000
echo.
echo    Les serveurs tournent dans 3 fenetres separees.
echo    Ferme-les (ou stop-all.bat) pour tout arreter.
echo ================================================
pause
