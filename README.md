# aeTools

A collection of After Effects scripts, pseudo-effect rigs, and dev tools.

## Scripts

| Folder | What it does |
|---|---|
| [`handoff/`](handoff/) | Weighted, switchable, sticky dynamic parenting. Hand off a layer from one parent to another with a slider, without snapping back to its rest position. |

## Layout

Each script lives in its own subfolder with a `README.md`, the `.jsx` file(s),
and any supporting assets. Scripts are independent and have no shared
dependencies.

`tools/` holds dev helpers shared across scripts (e.g. `embed_ffx.js` for
re-embedding pseudo-effect binaries into single-file deliverables).

## Installation (general)

After Effects scripts can be loaded two ways:

1. **Run once**: `File → Scripts → Run Script File…` and pick the `.jsx`.
2. **Dock as a panel**: copy the `.jsx` into `~/Library/Application Support/Adobe/After Effects <version>/Scripts/ScriptUI Panels/` (macOS) or `C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\ScriptUI Panels\` (Windows). Restart AE. The script appears under `Window → <script name>.jsx` and can be docked like any panel.

Per-script install notes live in each subfolder's README.
