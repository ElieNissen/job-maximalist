@echo off
setlocal

cd /d "%~dp0"

if not exist "dist\JobMAXIMALIST - Windows" (
  echo Le dossier de sortie n'existe pas encore.
  echo Lance d'abord "2 - Build JobMAXIMALIST Windows package.bat"
  echo.
  pause
  exit /b 1
)

explorer "dist\JobMAXIMALIST - Windows"
