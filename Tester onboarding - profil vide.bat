@echo off
setlocal

cd /d "%~dp0"

set "APP_URL=http://localhost:3015/?onboarding=1"
set "TEST_PROFILE_DIR=%CD%\.local-profiles\onboarding-test"
set "JOBMAX_APP_DATA_DIR=%TEST_PROFILE_DIR%"
set "JOBMAX_NEXT_DIST_DIR=.next-onboarding-test"

if not exist "%TEST_PROFILE_DIR%\database" mkdir "%TEST_PROFILE_DIR%\database"
set "DATABASE_URL=file:../.local-profiles/onboarding-test/database/jobmaximalist.db"

echo [JobMAXIMALIST] Profil TEST onboarding
echo [info] Port: 3015
echo [info] Donnees test: %TEST_PROFILE_DIR%
echo [info] Ce profil ne touche pas au profil reel sur le port 3000.
echo.

echo [setup] Liberation du port 3015 si un serveur de test tourne deja
powershell -NoProfile -Command "$connections = Get-NetTCPConnection -LocalPort 3015 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($procId in $connections) { if ($procId) { try { Stop-Process -Id $procId -Force -ErrorAction Stop } catch {} } }"

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

if not exist "%TEST_PROFILE_DIR%\database\jobmaximalist.db" (
  echo [setup] Initialisation de la base SQLite du profil test
  call node --no-warnings scripts\create-empty-sqlite-db.mjs --output ".local-profiles\onboarding-test\database\jobmaximalist.db"
  if errorlevel 1 goto :error
)

echo [JobMAXIMALIST] Le navigateur va s'ouvrir sur le profil test onboarding...
start "" powershell -NoProfile -WindowStyle Hidden -Command "$url = '%APP_URL%'; for ($i = 0; $i -lt 45; $i++) { try { Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 2 | Out-Null; Start-Process $url; break } catch { Start-Sleep -Seconds 1 } }"

echo [JobMAXIMALIST] Lancement du serveur de test (laisse cette fenetre ouverte)
call npm run dev:fast -- -p 3015
if errorlevel 1 goto :error

goto :eof

:error
echo.
echo [ERREUR] Le lancement du profil test onboarding a echoue.
pause
exit /b 1
