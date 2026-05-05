#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)"

if [ "$(uname)" != "Darwin" ]; then
  echo "This script must be run on macOS."
  exit 1
fi

cd "$REPO_ROOT"

echo "[JobMAXIMALIST] Build Next standalone..."
npm run build

echo "[JobMAXIMALIST] Create runtime bundle..."
STAGING_ROOT="$(node scripts/distribution/create-runtime-bundle.mjs --platform darwin)"

USER_OUTPUT_ROOT="$REPO_ROOT/dist/JobMAXIMALIST - macOS"
PAYLOAD_ROOT="$REPO_ROOT/dist/_build/macos-payload"
APP_BUNDLE="$PAYLOAD_ROOT/Applications/JobMAXIMALIST.app"
TOOLS_DIRECTORY="$PAYLOAD_ROOT/Applications/JobMAXIMALIST Tools"
APP_RESOURCES="$APP_BUNDLE/Contents/Resources/JobMAXIMALIST"
APP_MACOS="$APP_BUNDLE/Contents/MacOS"

rm -rf "$PAYLOAD_ROOT" "$USER_OUTPUT_ROOT"
mkdir -p "$APP_RESOURCES" "$APP_MACOS" "$TOOLS_DIRECTORY" "$USER_OUTPUT_ROOT"

cp -R "$STAGING_ROOT/Application Files/JobMAXIMALIST/." "$APP_RESOURCES/"
cp "scripts/distribution/macos/jobmaximalist-info.plist" "$APP_BUNDLE/Contents/Info.plist"
cp "scripts/distribution/macos/installation-readme-template.txt" "$USER_OUTPUT_ROOT/Lisez-moi - Installation.txt"

cat > "$APP_MACOS/JobMAXIMALIST" <<'EOF'
#!/bin/sh
set -eu
APP_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../Resources/JobMAXIMALIST" && pwd)"
"$APP_ROOT/Node Runtime/node" "$APP_ROOT/Application/jobmaximalist-runtime.mjs" start
EOF

cat > "$TOOLS_DIRECTORY/Reparer JobMAXIMALIST.command" <<'EOF'
#!/bin/sh
set -eu
APP_ROOT="/Applications/JobMAXIMALIST.app/Contents/Resources/JobMAXIMALIST"
"$APP_ROOT/Node Runtime/node" "$APP_ROOT/Application/jobmaximalist-runtime.mjs" repair
EOF

cat > "$TOOLS_DIRECTORY/Ouvrir les donnees JobMAXIMALIST.command" <<'EOF'
#!/bin/sh
set -eu
APP_ROOT="/Applications/JobMAXIMALIST.app/Contents/Resources/JobMAXIMALIST"
"$APP_ROOT/Node Runtime/node" "$APP_ROOT/Application/jobmaximalist-runtime.mjs" open-data
EOF

chmod +x "$APP_MACOS/JobMAXIMALIST" "$TOOLS_DIRECTORY/Reparer JobMAXIMALIST.command" "$TOOLS_DIRECTORY/Ouvrir les donnees JobMAXIMALIST.command"

pkgbuild \
  --root "$PAYLOAD_ROOT" \
  --install-location "/" \
  --identifier "com.jobmaximalist.installer" \
  --version "0.1.0" \
  "$USER_OUTPUT_ROOT/1 - Installer JobMAXIMALIST.pkg"

echo "[JobMAXIMALIST] macOS installer ready in $USER_OUTPUT_ROOT"
