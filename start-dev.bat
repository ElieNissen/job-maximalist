@echo off
setlocal

cd /d "%~dp0"

set "APP_URL=http://localhost:3000"

echo [URL Radar] Demarrage en mode developpement...

echo [setup] Liberation du port 3000 si un autre serveur tourne deja
powershell -NoProfile -Command "$connections = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($procId in $connections) { if ($procId) { try { Stop-Process -Id $procId -Force -ErrorAction Stop } catch {} } }"

if not exist ".env" (
  if exist ".env.example" (
    echo [setup] Copie .env.example vers .env
    copy /Y ".env.example" ".env" >nul
  )
)

if not exist "node_modules" (
  echo [setup] Installation des dependances (npm install)
  call npm install
  if errorlevel 1 goto :error
)

if not exist "prisma\dev.db" (
  echo [setup] Initialisation Prisma
  call npm run prisma:generate
  if errorlevel 1 goto :error
  call npm run prisma:push
  if errorlevel 1 goto :error
)

echo [URL Radar] Le navigateur va s'ouvrir quand l'application repondra...
start "" powershell -NoProfile -WindowStyle Hidden -Command "$url = '%APP_URL%'; for ($i = 0; $i -lt 45; $i++) { try { Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 2 | Out-Null; Start-Process $url; break } catch { Start-Sleep -Seconds 1 } }"

echo [URL Radar] Lancement du serveur de dev rapide (laisse cette fenetre ouverte)
call npm run dev:fast
if errorlevel 1 goto :error

goto :eof

:error
echo.
echo [ERREUR] Le demarrage en mode developpement a echoue.
pause
exit /b 1
