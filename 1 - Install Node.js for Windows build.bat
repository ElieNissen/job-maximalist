@echo off
setlocal

cd /d "%~dp0"
title JobMAXIMALIST - Windows build prerequisites

echo [1/3] Preparation de Node.js pour le build Windows
echo.
echo Ce script verifie que Node.js LTS est bien installe sur cette machine.
echo Node.js sert uniquement a fabriquer le package Windows.
echo L'utilisateur final n'aura pas besoin de l'installer.
echo.

where node >nul 2>nul
if not errorlevel 1 (
  echo Node.js est deja installe.
  echo.
  echo Etape suivante:
  echo 2. Double-clique sur "2 - Build JobMAXIMALIST Windows package.bat"
  echo.
  pause
  exit /b 0
)

where winget >nul 2>nul
if errorlevel 1 goto :manual

echo Installation de Node.js LTS via winget...
winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto :manual

echo.
echo Installation terminee.
echo.
echo Etapes suivantes:
echo 2. Double-clique sur "2 - Build JobMAXIMALIST Windows package.bat"
echo 3. Ouvre "3 - Open Windows package output.bat"
echo.
pause
exit /b 0

:manual
echo.
echo L'installation automatique n'a pas pu se terminer.
echo J'ouvre la page officielle de Node.js.
echo.
start "" "https://nodejs.org/en/download"
echo Etapes:
echo 1. Installe Node.js LTS depuis la page officielle
echo 2. Relance ce script
echo 3. Lance "2 - Build JobMAXIMALIST Windows package.bat"
echo.
pause
exit /b 1
