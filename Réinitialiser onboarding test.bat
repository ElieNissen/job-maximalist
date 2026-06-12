@echo off
setlocal

cd /d "%~dp0"

echo [JobMAXIMALIST] Reset du profil TEST onboarding
echo [info] Cette action supprime uniquement .local-profiles\onboarding-test
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$repo = (Resolve-Path '.').Path; $target = Join-Path $repo '.local-profiles\onboarding-test'; $resolved = [System.IO.Path]::GetFullPath($target); $expected = [System.IO.Path]::GetFullPath((Join-Path $repo '.local-profiles\onboarding-test')); if ($resolved -ne $expected) { throw \"Chemin inattendu: $resolved\" }; if (-not $resolved.ToLowerInvariant().EndsWith('\.local-profiles\onboarding-test')) { throw \"Refus de supprimer un chemin non test: $resolved\" }; if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force; Write-Output \"Profil test supprime: $resolved\" } else { Write-Output \"Aucun profil test a supprimer.\" }"
if errorlevel 1 goto :error

echo.
echo [OK] Relance "Tester onboarding - profil vide.bat" pour revoir l'onboarding.
pause
goto :eof

:error
echo.
echo [ERREUR] Reset refuse ou impossible.
pause
exit /b 1
