#!/bin/bash
# Symlink the extension into the CEP extensions directory for development.
# Run once; AE picks it up on next launch.
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXT_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
SRC_DIR="$(cd "$SCRIPT_DIR/../../handoff/cep/com.aetools.handoff" && pwd)"
LINK="$EXT_DIR/com.aetools.handoff"

mkdir -p "$EXT_DIR"
if [ -L "$LINK" ]; then
    echo "Symlink already exists: $LINK -> $(readlink "$LINK")"
elif [ -e "$LINK" ]; then
    echo "ERROR: $LINK exists and is not a symlink. Remove it manually."
    exit 1
else
    ln -s "$SRC_DIR" "$LINK"
    echo "Created symlink: $LINK -> $SRC_DIR"
fi

# Ensure PlayerDebugMode is set for unsigned extensions
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
echo "PlayerDebugMode set. Restart AE to load the extension."
