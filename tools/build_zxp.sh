#!/bin/bash
# Build a signed ZXP for the Handoff CEP panel.
# Mac-only build script; output ZXP installs on Mac and Windows.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---- Configuration ----
VERSION=$(cat "$REPO_ROOT/VERSION" | tr -d '[:space:]')
CERT_DIR="$REPO_ROOT/certs"
CERT_FILE="$CERT_DIR/handoff.p12"
CERT_PASS="handoff-internal"
STAGING="$REPO_ROOT/_build_staging"
DIST_DIR="$REPO_ROOT/dist"
OUTPUT="$DIST_DIR/Handoff-v${VERSION}.zxp"

EXT_SRC="$REPO_ROOT/handoff/cep/com.aetools.handoff"
HANDOFF_JSX="$REPO_ROOT/handoff/Handoff.jsx"

# ---- Check ZXPSignCmd ----
if ! command -v ZXPSignCmd &>/dev/null; then
    echo "ERROR: ZXPSignCmd not found on PATH."
    echo ""
    echo "Download it from:"
    echo "  https://github.com/nicollash/CEP-Installer/blob/master/ZXPSignCmd"
    echo "  (or search 'ZXPSignCmd download' — it's a free Adobe tool)"
    echo ""
    echo "After downloading, make it executable and move to your PATH:"
    echo "  chmod +x ZXPSignCmd"
    echo "  sudo mv ZXPSignCmd /usr/local/bin/"
    exit 1
fi

# ---- Create self-signed certificate (one-time) ----
if [ ! -f "$CERT_FILE" ]; then
    echo "Creating self-signed certificate..."
    mkdir -p "$CERT_DIR"
    ZXPSignCmd -selfSignedCert US CA aeTools aeTools "$CERT_FILE" "$CERT_PASS"
    echo "Certificate created: $CERT_FILE"
fi

# ---- Stage the extension ----
echo "Staging extension (v${VERSION})..."
rm -rf "$STAGING"
mkdir -p "$STAGING/com.aetools.handoff"

# Copy extension files
cp -R "$EXT_SRC/"* "$STAGING/com.aetools.handoff/"

# Bundle Handoff.jsx into jsx/ directory (alongside host.jsx)
cp "$HANDOFF_JSX" "$STAGING/com.aetools.handoff/jsx/Handoff.jsx"

# Remove .debug (dev-only, not needed in production ZXP)
rm -f "$STAGING/com.aetools.handoff/.debug"

# ---- Sign ----
echo "Signing ZXP..."
mkdir -p "$DIST_DIR"
rm -f "$OUTPUT"
ZXPSignCmd -sign "$STAGING/com.aetools.handoff" "$OUTPUT" "$CERT_FILE" "$CERT_PASS"

# ---- Copy install guide ----
if [ -f "$REPO_ROOT/handoff/INSTALL.md" ]; then
    cp "$REPO_ROOT/handoff/INSTALL.md" "$DIST_DIR/INSTALL.md"
fi

# ---- Cleanup ----
rm -rf "$STAGING"

echo ""
echo "Done! Built: $OUTPUT"
echo "Share the dist/ folder with your team:"
ls -lh "$DIST_DIR/"
