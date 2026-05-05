@echo off
setlocal

cd /d "%~dp0"
title JobMAXIMALIST - Build Windows package

echo [2/3] Build du package Windows JobMAXIMALIST
echo.

where node >nul 2>nul
if errorlevel 1 goto :missing_node

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\distribution\build-windows-package.ps1"
if errorlevel 1 goto :error

echo.
echo Build terminee.
echo.
echo Etapes suivantes:
echo 3. Double-clique sur "3 - Open Windows package output.bat"
echo.
pause
exit /b 0

:missing_node
echo Node.js n'est pas installe.
echo Lance d'abord "1 - Install Node.js for Windows build.bat"
echo.
pause
exit /b 1

:error
echo.
echo Le build du package Windows a echoue.
echo.
pause
exit /b 1
