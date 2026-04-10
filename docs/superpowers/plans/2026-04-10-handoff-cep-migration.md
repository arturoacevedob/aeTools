# Handoff CEP Panel Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the JSX ScriptUI panel with a CEP extension that auto-rebakes when parent assignments change and preserves visual position on unparent, eliminating the two-click workflow.

**Architecture:** CEP panel with HTML UI + ExtendScript backend. A 300ms polling loop reads the rig state (parent indices, weights, post-expression transforms) via read-only `evalScript` calls (no undo flooding). When parent assignments change, it triggers a rebake. When weight drops to 0 or a parent is cleared, it snapshots the post-expression visual and bakes it into the rest value before the snap-back becomes visible. The existing expression generation code (EXPR_POSITION, EXPR_ROTATION, EXPR_SCALE), baking system (computeBakes + expression probes), and two-pass apply-time anchoring are preserved unchanged.

**Tech Stack:** CEP 11+ (AE 2022+), HTML/CSS/JS panel, ExtendScript backend, CSInterface.js bridge

---

## File Structure

```
handoff/
  Handoff.jsx                    -- KEEP as standalone JSX fallback (unchanged)
  Handoff.ffx                    -- KEEP as source-of-truth preset
  cep/
    com.aetools.handoff/
      CSXS/
        manifest.xml             -- CEP extension manifest
      .debug                     -- Development debug config
      index.html                 -- Panel UI (Handoff + X buttons)
      css/
        style.css                -- Panel styling (AE theme-aware)
      js/
        main.js                  -- CEP JS: polling loop, state diffing, auto-rebake
        CSInterface.js           -- Adobe bridge library (copied from CEP SDK)
      jsx/
        host.jsx                 -- ExtendScript backend: all rig logic
      assets/
        Handoff.ffx              -- Bundled preset (copy of handoff/Handoff.ffx)
  tools/
    install_cep_dev.sh           -- Symlink extension to CEP dir for development
```

**Key decisions:**
- `host.jsx` contains ALL ExtendScript logic (expression templates, computeBakes, writeExpressions, etc.) — extracted from the IIFE in Handoff.jsx but identical logic.
- `main.js` is the new code: polling loop, state caching, change detection, auto-rebake dispatch.
- `Handoff.jsx` stays as a standalone fallback for users who can't install CEP extensions.
- `Handoff.ffx` is bundled as a regular file — no hex-encoded binary needed in CEP mode.

---

### Task 1: CEP Extension Scaffold

**Files:**
- Create: `handoff/cep/com.aetools.handoff/CSXS/manifest.xml`
- Create: `handoff/cep/com.aetools.handoff/.debug`
- Create: `handoff/cep/com.aetools.handoff/index.html`
- Create: `handoff/cep/com.aetools.handoff/css/style.css`
- Create: `handoff/cep/com.aetools.handoff/js/CSInterface.js`
- Create: `handoff/tools/install_cep_dev.sh`

- [ ] **Step 1: Create manifest.xml**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionManifest xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    Version="6.0"
    ExtensionBundleId="com.aetools.handoff"
    ExtensionBundleVersion="2.0.0"
    ExtensionBundleName="Handoff">

    <ExtensionList>
        <Extension Id="com.aetools.handoff.panel" Version="2.0"/>
    </ExtensionList>

    <ExecutionEnvironment>
        <HostList>
            <Host Name="AEFT" Version="[22.0,99.0]"/>
        </HostList>
        <LocaleList>
            <Locale Code="All"/>
        </LocaleList>
        <RequiredRuntimeList>
            <RequiredRuntime Name="CSXS" Version="11.0"/>
        </RequiredRuntimeList>
    </ExecutionEnvironment>

    <DispatchInfoList>
        <Extension Id="com.aetools.handoff.panel">
            <DispatchInfo>
                <Resources>
                    <MainPath>./index.html</MainPath>
                    <ScriptPath>./jsx/host.jsx</ScriptPath>
                    <CEFCommandLine>
                        <Parameter>--allow-file-access-from-files</Parameter>
                    </CEFCommandLine>
                </Resources>
                <Lifecycle>
                    <AutoVisible>true</AutoVisible>
                </Lifecycle>
                <UI>
                    <Type>Panel</Type>
                    <Menu>Handoff</Menu>
                    <Geometry>
                        <Size>
                            <Height>60</Height>
                            <Width>200</Width>
                        </Size>
                        <MinSize>
                            <Height>44</Height>
                            <Width>128</Width>
                        </MinSize>
                    </Geometry>
                </UI>
            </DispatchInfo>
        </Extension>
    </DispatchInfoList>
</ExtensionManifest>
```

- [ ] **Step 2: Create .debug file**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionList>
    <Extension Id="com.aetools.handoff.panel">
        <HostList>
            <Host Name="AEFT" Port="8088"/>
        </HostList>
    </Extension>
</ExtensionList>
```

- [ ] **Step 3: Create minimal index.html**

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <link rel="stylesheet" href="css/style.css">
</head>
<body>
    <div id="panel">
        <button id="btn-handoff">Handoff</button>
        <button id="btn-remove">&times;</button>
    </div>
    <script src="js/CSInterface.js"></script>
    <script src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create style.css**

Match the AE dark theme. The panel reads theme colors via `CSInterface.getHostEnvironment()` at startup.

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
    font-family: "Adobe Clean", "Segoe UI", sans-serif;
    font-size: 11px;
    overflow: hidden;
}

#panel {
    display: flex;
    gap: 4px;
    padding: 6px;
    height: 100vh;
}

#btn-handoff {
    flex: 1;
    min-height: 32px;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
}

#btn-remove {
    width: 32px;
    min-height: 32px;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 16px;
    font-weight: bold;
}

button:active { opacity: 0.7; }
```

- [ ] **Step 5: Copy CSInterface.js**

```bash
cp "/Library/Application Support/Adobe/CEP/extensions/Atom/CSInterface.js" \
   "handoff/cep/com.aetools.handoff/js/CSInterface.js"
```

- [ ] **Step 6: Create install_cep_dev.sh**

```bash
#!/bin/bash
# Symlink the extension into the CEP extensions directory for development.
# Run once; AE picks it up on next launch.
set -e
EXT_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
SRC_DIR="$(cd "$(dirname "$0")/../handoff/cep/com.aetools.handoff" && pwd)"
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
```

- [ ] **Step 7: Copy Handoff.ffx to assets**

```bash
mkdir -p handoff/cep/com.aetools.handoff/assets
cp handoff/Handoff.ffx handoff/cep/com.aetools.handoff/assets/Handoff.ffx
```

- [ ] **Step 8: Verify structure**

```bash
find handoff/cep -type f | sort
```

Expected:
```
handoff/cep/com.aetools.handoff/.debug
handoff/cep/com.aetools.handoff/CSXS/manifest.xml
handoff/cep/com.aetools.handoff/assets/Handoff.ffx
handoff/cep/com.aetools.handoff/css/style.css
handoff/cep/com.aetools.handoff/index.html
handoff/cep/com.aetools.handoff/js/CSInterface.js
handoff/cep/com.aetools.handoff/js/main.js
handoff/cep/com.aetools.handoff/jsx/host.jsx
```

- [ ] **Step 9: Commit scaffold**

```bash
git add handoff/cep/ handoff/tools/install_cep_dev.sh
git commit -m "feat(handoff): CEP extension scaffold"
```

---

### Task 2: ExtendScript Backend (host.jsx)

**Files:**
- Create: `handoff/cep/com.aetools.handoff/jsx/host.jsx`
- Read: `handoff/Handoff.jsx` (source of all expression templates and rig logic)

Extract all rig logic from the Handoff.jsx IIFE into `host.jsx` as top-level functions callable by `CSInterface.evalScript()`. The expression templates and baking logic are copied verbatim. The ScriptUI code is NOT copied (replaced by HTML panel).

- [ ] **Step 1: Create host.jsx with constants and expression templates**

Copy from `Handoff.jsx` lines 147-635 (everything from `var SCRIPT_NAME` through the end of `EXPR_SCALE`). These are:
- Constants: `SCRIPT_NAME`, `EFFECT_NAME`, `SLOTS`, `HANDOFF_MATCHNAME`
- Naming helpers: `pn()`, `nLayer()`, `nWeight()`, etc.
- Shared expression preamble: `EXPR_PREAMBLE`
- Segment helper: `SEGS_HELPER`
- Position expression: `POSITION_INTEGRATE`, `POSITION_APPLY`, `EXPR_POSITION`, `EXPR_POSITION_X/Y/Z`
- Rotation expression: `EXPR_ROTATION`
- Scale expression: `EXPR_SCALE`

Do NOT wrap in an IIFE — these must be globally accessible for `evalScript`. Do NOT copy the embedded FFX binary constant — CEP bundles the file directly.

- [ ] **Step 2: Add FFX handling for CEP mode**

Replace the hex-encoded binary + cache logic with direct file access:

```javascript
// Path to the bundled .ffx — set by the CEP panel at startup
var HANDOFF_FFX_PATH = "";

function setFFXPath(path) {
    HANDOFF_FFX_PATH = path;
    return "ok";
}

function ensureFFX() {
    if (HANDOFF_FFX_PATH === "") {
        throw new Error("FFX path not set. Call setFFXPath() from CEP panel first.");
    }
    var f = new File(HANDOFF_FFX_PATH);
    if (!f.exists) {
        throw new Error("Handoff.ffx not found at: " + HANDOFF_FFX_PATH);
    }
    return f;
}
```

- [ ] **Step 3: Copy rig logic functions**

Copy from `Handoff.jsx` (approximately lines 1894-2530):
- `LEGACY_PATTERNS`, `LEGACY_EXACT`, `LEGACY_HANDOFF_MATCHNAMES`
- `isLegacyEffect()`, `isHandoffMatchname()`, `findHandoffEffect()`
- `safeClearExpression()`
- `removeRig()`
- `selectOnly()`
- `computeBakes()` (including the `slotsValid` addition from our fix)
- Transform helpers: `layerLocalToParentSpace()`, `parentSpaceToLayerLocal()`, `worldToLayerLocal()`, `accumulatedRotation()`, `accumulatedScale()`
- `renderBakePrefix()` (including `SLOTS_VALID`)
- `readOldApplyTime()`
- `writeExpressions()`
- `writeAllExpressions()`
- `applyRig()`
- `refreshRig()`

All as top-level functions (not inside IIFE).

- [ ] **Step 4: Add CEP-callable wrapper functions**

These are the functions the CEP panel calls via `evalScript`. They return JSON strings.

```javascript
function cepApplyOrRefresh(layerId) {
    var layer = app.project.layerByID(layerId);
    var fx = findHandoffEffect(layer);
    app.beginUndoGroup("Handoff");
    if (fx !== null) {
        refreshRig(layer);
    } else {
        applyRig(layer, ensureFFX());
    }
    app.endUndoGroup();
    return JSON.stringify({ok: true});
}

function cepRemoveRig(layerId) {
    var layer = app.project.layerByID(layerId);
    app.beginUndoGroup("Remove Handoff");
    removeRig(layer);
    app.endUndoGroup();
    return JSON.stringify({ok: true});
}

function cepReadRigState() {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) {
        return JSON.stringify({active: false});
    }

    var rigged = [];
    for (var i = 1; i <= comp.numLayers; i++) {
        var lyr = comp.layer(i);
        var fx = findHandoffEffect(lyr);
        if (fx === null) { continue; }

        var parents = [];
        var weights = [];
        for (var p = 1; p <= SLOTS; p++) {
            parents.push(fx.property(nLayer(p)).value);
            weights.push(fx.property(nWeight(p)).value);
        }

        var tg = lyr.property("ADBE Transform Group");
        var posU = tg.property("ADBE Position");
        var postPos;
        if (posU.dimensionsSeparated) {
            postPos = [
                tg.property("ADBE Position_0").valueAtTime(comp.time, false),
                tg.property("ADBE Position_1").valueAtTime(comp.time, false),
                lyr.threeDLayer ? tg.property("ADBE Position_2").valueAtTime(comp.time, false) : 0
            ];
        } else {
            var pv = posU.valueAtTime(comp.time, false);
            postPos = [pv[0], pv[1], pv[2] || 0];
        }
        var postRot = tg.property("ADBE Rotate Z").valueAtTime(comp.time, false);
        var postScl = tg.property("ADBE Scale").valueAtTime(comp.time, false);

        rigged.push({
            id:       lyr.id,
            name:     lyr.name,
            parents:  parents,
            weights:  weights,
            postPos:  [postPos[0], postPos[1], postPos[2] || 0],
            postRot:  postRot,
            postScl:  [postScl[0], postScl[1], postScl[2] || 0]
        });
    }

    return JSON.stringify({
        active: true,
        compId: comp.id,
        time:   comp.time,
        rigged: rigged
    });
}

function cepPreserveAndRebake(layerId, cachedPosJson, cachedRot, cachedSclJson) {
    var layer = app.project.layerByID(layerId);
    var cachedPos = JSON.parse(cachedPosJson);
    var cachedScl = JSON.parse(cachedSclJson);

    app.beginUndoGroup("Handoff Auto-Update");

    var tg = layer.property("ADBE Transform Group");
    var posU = tg.property("ADBE Position");

    safeClearExpression(posU);
    safeClearExpression(tg.property("ADBE Position_0"));
    safeClearExpression(tg.property("ADBE Position_1"));
    safeClearExpression(tg.property("ADBE Position_2"));
    safeClearExpression(tg.property("ADBE Rotate Z"));
    safeClearExpression(tg.property("ADBE Scale"));

    if (posU.dimensionsSeparated) {
        tg.property("ADBE Position_0").setValue(cachedPos[0]);
        tg.property("ADBE Position_1").setValue(cachedPos[1]);
        if (layer.threeDLayer) {
            tg.property("ADBE Position_2").setValue(cachedPos[2] || 0);
        }
    } else {
        posU.setValue(cachedPos);
    }
    tg.property("ADBE Rotate Z").setValue(cachedRot);
    tg.property("ADBE Scale").setValue(cachedScl);

    var fx = findHandoffEffect(layer);
    if (fx !== null) {
        writeExpressions(layer, fx);
    }

    app.endUndoGroup();
    return JSON.stringify({ok: true});
}
```

- [ ] **Step 5: Verify host.jsx parses cleanly**

```bash
cp handoff/cep/com.aetools.handoff/jsx/host.jsx /tmp/check.js && node --check /tmp/check.js && rm /tmp/check.js && echo "OK"
```

- [ ] **Step 6: Commit host.jsx**

```bash
git add handoff/cep/com.aetools.handoff/jsx/host.jsx
git commit -m "feat(handoff): CEP ExtendScript backend with auto-rebake support"
```

---

### Task 3: CEP Panel JavaScript (main.js) — Polling and Auto-Rebake

**Files:**
- Create: `handoff/cep/com.aetools.handoff/js/main.js`

This is the core new code. It runs in the CEP panel's Chromium context and polls AE's state via `evalScript`, detecting parent assignment changes and weight transitions.

- [ ] **Step 1: Create main.js with initialization**

```javascript
(function () {
    var csInterface = new CSInterface();
    var POLL_MS = 300;

    // Cache of last-known rig state per layer ID.
    // Key: layerId (number), Value: {parents: [...], weights: [...], postPos, postRot, postScl}
    var cache = {};

    // ---- Theme ----

    function applyTheme() {
        var env = csInterface.getHostEnvironment();
        var bg = env.appSkinInfo.panelBackgroundColor.color;
        var r = Math.round(bg.red), g = Math.round(bg.green), b = Math.round(bg.blue);
        var bgColor = "rgb(" + r + "," + g + "," + b + ")";
        var textColor = (r + g + b) / 3 < 128 ? "#ddd" : "#222";
        var btnBg = (r + g + b) / 3 < 128
            ? "rgb(" + Math.min(r + 30, 255) + "," + Math.min(g + 30, 255) + "," + Math.min(b + 30, 255) + ")"
            : "rgb(" + Math.max(r - 30, 0) + "," + Math.max(g - 30, 0) + "," + Math.max(b - 30, 0) + ")";

        document.body.style.backgroundColor = bgColor;
        document.body.style.color = textColor;
        var btns = document.querySelectorAll("button");
        for (var i = 0; i < btns.length; i++) {
            btns[i].style.backgroundColor = btnBg;
            btns[i].style.color = textColor;
        }
    }

    // ---- FFX Path ----

    function initFFXPath() {
        var extPath = csInterface.getSystemPath(SystemPath.EXTENSION);
        var ffxPath = extPath + "/assets/Handoff.ffx";
        // Normalize path for ExtendScript (forward slashes)
        ffxPath = ffxPath.replace(/\\/g, "/");
        csInterface.evalScript('setFFXPath("' + ffxPath + '")', function (r) {
            if (r === "EvalScript error.") {
                console.error("Failed to set FFX path");
            }
        });
    }

    // ---- Button Handlers ----

    document.getElementById("btn-handoff").addEventListener("click", function () {
        csInterface.evalScript(
            'var comp = app.project.activeItem;' +
            'if (!(comp instanceof CompItem)) { "no_comp"; }' +
            'else if (comp.selectedLayers.length === 0) { "no_sel"; }' +
            'else {' +
            '  var ids = [];' +
            '  for (var i = 0; i < comp.selectedLayers.length; i++) {' +
            '    ids.push(comp.selectedLayers[i].id);' +
            '  }' +
            '  ids.join(",");' +
            '}',
            function (result) {
                if (result === "no_comp" || result === "no_sel") { return; }
                var ids = result.split(",");
                for (var i = 0; i < ids.length; i++) {
                    csInterface.evalScript('cepApplyOrRefresh(' + ids[i] + ')');
                }
                // Clear cache so next poll picks up fresh state
                cache = {};
            }
        );
    });

    document.getElementById("btn-remove").addEventListener("click", function () {
        csInterface.evalScript(
            'var comp = app.project.activeItem;' +
            'if (!(comp instanceof CompItem)) { "no_comp"; }' +
            'else if (comp.selectedLayers.length === 0) { "no_sel"; }' +
            'else {' +
            '  var ids = [];' +
            '  for (var i = 0; i < comp.selectedLayers.length; i++) {' +
            '    ids.push(comp.selectedLayers[i].id);' +
            '  }' +
            '  ids.join(",");' +
            '}',
            function (result) {
                if (result === "no_comp" || result === "no_sel") { return; }
                var ids = result.split(",");
                for (var i = 0; i < ids.length; i++) {
                    csInterface.evalScript('cepRemoveRig(' + ids[i] + ')');
                    delete cache[ids[i]];
                }
            }
        );
    });

    // ---- Polling Loop ----

    function poll() {
        csInterface.evalScript('cepReadRigState()', function (result) {
            if (result === "EvalScript error." || !result) { return; }
            var state;
            try { state = JSON.parse(result); } catch (e) { return; }
            if (!state.active || !state.rigged) { return; }

            for (var i = 0; i < state.rigged.length; i++) {
                var lyr = state.rigged[i];
                var prev = cache[lyr.id];

                if (!prev) {
                    // First time seeing this layer — cache and move on
                    cache[lyr.id] = {
                        parents: lyr.parents.slice(),
                        weights: lyr.weights.slice(),
                        postPos: lyr.postPos.slice(),
                        postRot: lyr.postRot,
                        postScl: lyr.postScl.slice()
                    };
                    continue;
                }

                // Check for parent assignment changes
                var parentChanged = false;
                for (var p = 0; p < lyr.parents.length; p++) {
                    if (lyr.parents[p] !== prev.parents[p]) {
                        parentChanged = true;
                        break;
                    }
                }

                // Check for weight going from >0 to 0 (unparent)
                var unparented = false;
                for (var w = 0; w < lyr.weights.length; w++) {
                    if (prev.weights[w] > 0.001 && lyr.weights[w] < 0.001) {
                        unparented = true;
                        break;
                    }
                }

                if (parentChanged || unparented) {
                    // Use the CACHED post-expression visual (from before the change)
                    // to preserve the child's position through the rebake.
                    var cachedPos = JSON.stringify(prev.postPos);
                    var cachedRot = prev.postRot;
                    var cachedScl = JSON.stringify(prev.postScl);
                    csInterface.evalScript(
                        'cepPreserveAndRebake(' + lyr.id + ',' +
                        "'" + cachedPos + "'," +
                        cachedRot + ',' +
                        "'" + cachedScl + "')"
                    );
                }

                // Update cache with current state
                cache[lyr.id] = {
                    parents: lyr.parents.slice(),
                    weights: lyr.weights.slice(),
                    postPos: lyr.postPos.slice(),
                    postRot: lyr.postRot,
                    postScl: lyr.postScl.slice()
                };
            }

            // Remove cached entries for layers no longer rigged
            var riggedIds = {};
            for (var j = 0; j < state.rigged.length; j++) {
                riggedIds[state.rigged[j].id] = true;
            }
            for (var key in cache) {
                if (!riggedIds[key]) { delete cache[key]; }
            }
        });
    }

    // ---- Startup ----

    applyTheme();
    csInterface.addEventListener("com.adobe.csxs.events.ThemeColorChanged", applyTheme);
    initFFXPath();
    setInterval(poll, POLL_MS);
})();
```

- [ ] **Step 2: Commit main.js**

```bash
git add handoff/cep/com.aetools.handoff/js/main.js
git commit -m "feat(handoff): CEP polling loop with auto-rebake and visual preservation"
```

---

### Task 4: Install, Load in AE, and Test Basic Panel Functionality

**Files:**
- None created; testing existing files

- [ ] **Step 1: Run install script**

```bash
chmod +x handoff/tools/install_cep_dev.sh
bash handoff/tools/install_cep_dev.sh
```

Expected output: "Created symlink" + "PlayerDebugMode set"

- [ ] **Step 2: Restart AE and verify panel loads**

After AE restart, go to Window menu — "Handoff" should appear as a panel option. Open it. The panel should show the Handoff button and X button with AE's dark theme colors.

If the panel doesn't appear: check `http://localhost:8088` in Chrome for debug console errors. Common issues:
- manifest.xml syntax error → AE silently ignores the extension
- CSInterface.js not found → blank panel
- host.jsx syntax error → `evalScript` returns "EvalScript error."

- [ ] **Step 3: Test apply button (manual, no automation)**

1. Select a layer in the comp
2. Click "Handoff" in the CEP panel
3. Verify the Handoff pseudo effect appears on the layer
4. Verify position/rotation/scale expressions are written

- [ ] **Step 4: Test remove button**

1. With the rigged layer selected, click X
2. Verify the effect is removed and the layer doesn't jump

- [ ] **Step 5: Commit any fixes**

```bash
git add -A handoff/cep/
git commit -m "fix(handoff): CEP panel loading fixes"
```

---

### Task 5: Test Auto-Rebake on Parent Assignment Change

**Files:**
- None; testing only

This is the critical test. The CEP panel should detect when the user assigns a parent in the effect controls and automatically rebake.

- [ ] **Step 1: Set up test scenario**

1. Reset Apple to [960, 400], Left Hand to [500, 600], both rotation=0, scale=100%
2. Click Handoff on Apple → rig applied with no parents

- [ ] **Step 2: Assign parent and verify no jump**

1. In Apple's Effect Controls, set P1 Layer = Left Hand
2. Wait 300ms (one poll cycle)
3. Verify: Apple should NOT jump — it should stay at [960, 400]
4. The CEP panel should have detected the parent change and triggered `cepPreserveAndRebake`

- [ ] **Step 3: Verify tracking works after auto-rebake**

1. Drag Left Hand to [700, 600] — Apple should follow (offset by +200 X)
2. Rotate Left Hand 45° — Apple should orbit at the original distance
3. Scale Left Hand 150% — Apple should scale 150% and move radially

- [ ] **Step 4: Test changing to a different parent**

1. Set P1 Layer = Right Hand (instead of Left Hand)
2. Wait for auto-rebake
3. Verify Apple didn't jump
4. Move Right Hand — Apple should follow Right Hand now

- [ ] **Step 5: Test removing parent (P1 Layer → None)**

1. Set P1 Layer = None
2. Wait for auto-rebake with visual preservation
3. Verify Apple stays at its current displaced position (doesn't snap to rest)

---

### Task 6: Test Unparent via Weight Change

**Files:**
- None; testing only

- [ ] **Step 1: Set up test: parent active, child displaced**

1. Re-assign P1 Layer = Left Hand, P1 Weight = 1
2. Wait for auto-rebake
3. Move Left Hand so Apple is displaced from its rest position

- [ ] **Step 2: Set P1 Weight to 0**

1. Change P1 Weight from 1 to 0 in Effect Controls
2. Wait for the poll to detect the change
3. Verify Apple stays at its displaced position (doesn't snap back to rest)

- [ ] **Step 3: Set P1 Weight back to 1**

1. Change P1 Weight from 0 to 1
2. The poll detects weight went from 0 to >0
3. This triggers a rebake from the current rest value (which was updated in step 2)
4. Verify Apple stays at the same position and tracking resumes

---

### Task 7: Edge Case Testing and Polish

**Files:**
- Modify: `handoff/cep/com.aetools.handoff/js/main.js` (if fixes needed)
- Modify: `handoff/cep/com.aetools.handoff/jsx/host.jsx` (if fixes needed)

- [ ] **Step 1: Test multi-parent scenario**

1. Assign P1 = Left Hand (weight 1), P2 = Right Hand (weight 1)
2. Wait for auto-rebake
3. Move both parents — Apple should follow the weighted average
4. Set P1 Weight = 0 — Apple should maintain position and only follow Right Hand

- [ ] **Step 2: Test with keyframed weights**

1. Set P1 Weight with keyframes (0 at t=0, 1 at t=1s, 0 at t=2s)
2. Scrub through the timeline — the segment walker should handle smooth transitions
3. Verify no interaction with the CEP polling (the poll should not interfere with keyframed weights)

- [ ] **Step 3: Test panel resize**

Resize the panel to various sizes. Buttons should scale appropriately.

- [ ] **Step 4: Test with multiple rigged layers**

1. Apply Handoff to both Apple and another layer
2. Assign different parents
3. Verify the polling tracks both layers independently

- [ ] **Step 5: Commit any fixes**

```bash
git add -A handoff/cep/
git commit -m "fix(handoff): CEP edge case fixes from testing"
```

---

### Task 8: Final Cleanup and Documentation

**Files:**
- Modify: `handoff/CLAUDE.md`
- Modify: `handoff/README.md`

- [ ] **Step 1: Update CLAUDE.md with CEP architecture notes**

Add a section about the CEP panel: how it works, the polling loop, auto-rebake behavior, how to install for development, and known limitations.

- [ ] **Step 2: Update README.md**

Update installation instructions to mention the CEP panel option alongside the standalone JSX.

- [ ] **Step 3: Commit documentation**

```bash
git add handoff/CLAUDE.md handoff/README.md
git commit -m "docs(handoff): CEP panel architecture and installation"
```

---

### Task 9: ZXP Packaging for Distribution

**Files:**
- Create: `handoff/tools/build_zxp.sh`

- [ ] **Step 1: Create self-signed certificate**

```bash
# Generate a self-signed certificate for ZXP signing (one-time)
ZXPSignCmd -selfSignedCert US CA "aeTools" "Handoff" "password123" handoff/cep/cert.p12
```

If `ZXPSignCmd` is not installed, download from Adobe's CEP resources or use `npx zxp-sign-cmd`.

- [ ] **Step 2: Create build_zxp.sh**

```bash
#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXT_DIR="$SCRIPT_DIR/../handoff/cep/com.aetools.handoff"
CERT="$SCRIPT_DIR/../handoff/cep/cert.p12"
OUT="$SCRIPT_DIR/../handoff/Handoff.zxp"

if [ ! -f "$CERT" ]; then
    echo "Certificate not found. Run: ZXPSignCmd -selfSignedCert US CA aeTools Handoff password123 $CERT"
    exit 1
fi

# Remove .debug file from the package (not needed in production)
DEBUG_FILE="$EXT_DIR/.debug"
HAD_DEBUG=false
if [ -f "$DEBUG_FILE" ]; then
    HAD_DEBUG=true
    mv "$DEBUG_FILE" "$DEBUG_FILE.bak"
fi

ZXPSignCmd -sign "$EXT_DIR" "$OUT" "$CERT" "password123" -tsa http://timestamp.digicert.com

if [ "$HAD_DEBUG" = true ]; then
    mv "$DEBUG_FILE.bak" "$DEBUG_FILE"
fi

echo "Built: $OUT"
ls -lh "$OUT"
```

- [ ] **Step 3: Test the ZXP**

```bash
chmod +x handoff/tools/build_zxp.sh
bash handoff/tools/build_zxp.sh
# Verify the ZXP was created
ls -lh handoff/Handoff.zxp
```

- [ ] **Step 4: Add cert.p12 to .gitignore**

```bash
echo "handoff/cep/cert.p12" >> .gitignore
echo "handoff/Handoff.zxp" >> .gitignore
```

- [ ] **Step 5: Commit**

```bash
git add handoff/tools/build_zxp.sh .gitignore
git commit -m "feat(handoff): ZXP build script for distribution"
```

---

## ENG REVIEW: Accepted Changes

These modifications were accepted during the eng review and MUST be applied during implementation:

1. **Shared source file (no duplication):** Do NOT copy rig logic into host.jsx. Instead, refactor Handoff.jsx to detect CEP mode via `$.global.__handoff_cep = true`. In CEP mode, export functions to `$.global` instead of wrapping in IIFE. host.jsx becomes: set flag → `$.evalFile(Handoff.jsx)` → add 4 CEP wrapper functions. One source of truth.

2. **Layer registry:** Add a `_riggedLayerIds` array in host.jsx. `cepApplyOrRefresh` adds layer IDs, `cepRemoveRig` removes them. `cepReadRigState` only scans registered IDs instead of all comp layers.

3. **Time guard:** Cache `comp.time` alongside post-expression values in the poll. Skip `cepPreserveAndRebake` if current `comp.time` differs from cached time. Re-cache on next poll.

4. **DRY button handlers:** Extract `getSelectedLayerIds(callback)` helper in main.js. Both button click handlers call it.

## NOT in scope

- **UXP migration** — AE's UXP support is not stable enough. CEP works through AE 2025. Revisit when Adobe deprecates CEP.
- **Auto-rebake on parent transform drag** — Would break rigid tracking. By design, the rigid fallback uses frozen bake references.
- **Windows testing** — Only macOS paths covered. Add Windows support when needed.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 4 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**VERDICT:** ENG CLEARED — 4 issues resolved (shared source, layer registry, time guard, DRY helpers). Ready to implement.
