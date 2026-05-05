$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repoRoot

Write-Host "[JobMAXIMALIST] Build Next standalone..."
cmd /c npm run build
if ($LASTEXITCODE -ne 0) {
  throw "Next build failed."
}

Write-Host "[JobMAXIMALIST] Create runtime bundle..."
$stagingRoot = node scripts/distribution/create-runtime-bundle.mjs --platform win32
if ($LASTEXITCODE -ne 0) {
  throw "Runtime bundle creation failed."
}

$userOutputRoot = Join-Path $repoRoot "dist\JobMAXIMALIST - Windows"
$zipOutputPath = Join-Path $repoRoot "dist\JobMAXIMALIST - Windows.zip"
$stagedAppRoot = Join-Path $stagingRoot "Application Files\JobMAXIMALIST"

if (Test-Path $userOutputRoot) {
  Remove-Item -LiteralPath $userOutputRoot -Recurse -Force
}

if (Test-Path $zipOutputPath) {
  Remove-Item -LiteralPath $zipOutputPath -Force
}

New-Item -ItemType Directory -Force -Path $userOutputRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $userOutputRoot "Application Files") | Out-Null
Copy-Item -LiteralPath $stagedAppRoot -Destination (Join-Path $userOutputRoot "Application Files\JobMAXIMALIST") -Recurse -Force

Copy-Item -LiteralPath "scripts\distribution\windows\portable-package-readme-template.txt" -Destination (Join-Path $userOutputRoot "Lisez-moi - Demarrage.txt") -Force
Copy-Item -LiteralPath "scripts\distribution\windows\start-jobmaximalist.vbs" -Destination (Join-Path $userOutputRoot "1 - Start JobMAXIMALIST.vbs") -Force
Copy-Item -LiteralPath "scripts\distribution\windows\repair-jobmaximalist.vbs" -Destination (Join-Path $userOutputRoot "2 - Repair JobMAXIMALIST.vbs") -Force
Copy-Item -LiteralPath "scripts\distribution\windows\open-jobmaximalist-data.vbs" -Destination (Join-Path $userOutputRoot "3 - Open JobMAXIMALIST data.vbs") -Force

Compress-Archive -Path $userOutputRoot -DestinationPath $zipOutputPath -CompressionLevel Optimal

Write-Host "[JobMAXIMALIST] Windows package ready in $userOutputRoot"
Write-Host "[JobMAXIMALIST] Zip ready in $zipOutputPath"
