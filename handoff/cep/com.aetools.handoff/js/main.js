(function () {
    var csInterface = new CSInterface();
    var POLL_MS = 100;

    // Cache of last-known rig state per layer ID.
    // Key: layerId (string), Value: {parents, weights, postPos, postRot, postScl, time}
    var cache = {};

    // ---- Status bar ----

    var statusDot  = document.getElementById("status-dot");
    var statusText = document.getElementById("status-text");

    function setStatus(color, text) {
        statusDot.className = color;
        statusText.textContent = text;
    }

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

    // ---- Paths ----

    function initPaths() {
        var extPath = csInterface.getSystemPath(SystemPath.EXTENSION);
        // Normalize for ExtendScript (forward slashes)
        extPath = extPath.replace(/\\/g, "/");

        var ffxPath = extPath + "/assets/Handoff.ffx";
        csInterface.evalScript('setFFXPath("' + ffxPath + '")');

        // Tell host.jsx where the shared Handoff.jsx lives.
        // In dev (symlink), it's ../../Handoff.jsx relative to the extension.
        // We try the sibling path first, then fall back to the extension's
        // own jsx/ directory (for packaged ZXP distribution where Handoff.jsx
        // would be bundled alongside host.jsx).
        var jsxPath = extPath + "/../../Handoff.jsx";
        csInterface.evalScript('setHandoffJSXPath("' + jsxPath + '")');
    }

    // ---- DRY helper: get selected layer IDs ----

    function getSelectedLayerIds(callback) {
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
                if (result === "no_comp" || result === "no_sel" || !result) {
                    return;
                }
                callback(result.split(","));
            }
        );
    }

    // ---- Button Handlers ----

    document.getElementById("btn-handoff").addEventListener("click", function () {
        getSelectedLayerIds(function (ids) {
            for (var i = 0; i < ids.length; i++) {
                csInterface.evalScript('cepApplyOrRefresh(' + ids[i] + ',true)');
            }
            // Clear cache so next poll picks up fresh state
            cache = {};
        });
    });

    document.getElementById("btn-remove").addEventListener("click", function () {
        getSelectedLayerIds(function (ids) {
            for (var i = 0; i < ids.length; i++) {
                csInterface.evalScript('cepRemoveRig(' + ids[i] + ')');
                delete cache[ids[i]];
            }
        });
    });

    // ---- Polling Loop ----

    // Track whether any layer is settling (keyframe drag in progress).
    // When settling, use light-mode polls to avoid blocking AE's main
    // thread with expensive expression evaluation.
    var _anySettling = false;

    function poll() {
        var cmd = _anySettling
            ? 'cepReadRigState(true)'
            : 'cepReadRigState()';
        csInterface.evalScript(cmd, function (result) {
            if (result === "EvalScript error." || !result) {
                setStatus("red", "Disconnected");
                return;
            }
            var state;
            try { state = JSON.parse(result); } catch (e) { return; }
            if (!state.active || !state.rigged) {
                setStatus("", "Idle");
                return;
            }

            _anySettling = false;

            for (var i = 0; i < state.rigged.length; i++) {
                var lyr = state.rigged[i];
                var prev = cache[lyr.id];

                if (!prev) {
                    // First time seeing this layer — need full state.
                    // If light mode returned nulls, skip until next full poll.
                    if (!lyr.postPos) { continue; }
                    cache[lyr.id] = {
                        parents: lyr.parents.slice(),
                        weights: lyr.weights.slice(),
                        wkh:     lyr.wkh || "",
                        restPos: lyr.restPos ? lyr.restPos.slice() : null,
                        postPos: lyr.postPos.slice(),
                        postRot: lyr.postRot,
                        postScl: lyr.postScl.slice(),
                        time:    state.time
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

                // Check for weight keyframe changes (moved/added/removed).
                // The wkh (weight key hash) is a string encoding the count
                // and times of all weight keyframes. When it changes, the
                // BAKED_APPLY_OFFSET is stale and needs recalibration.
                var keysChanged = false;
                if ((lyr.wkh || "") !== (prev.wkh || "")) {
                    keysChanged = true;
                }

                // Check for child moved (rest position changed = user dragged child).
                // DEBOUNCED: don't rebake while the user is actively dragging.
                // Only rebake after the rest position stabilizes for 3 consecutive
                // polls (~300ms), meaning the user released the mouse.
                var childMoved = false;
                if (lyr.restPos && prev.restPos) {
                    var dx = Math.abs(lyr.restPos[0] - prev.restPos[0]);
                    var dy = Math.abs(lyr.restPos[1] - prev.restPos[1]);
                    if (dx > 0.5 || dy > 0.5) { childMoved = true; }
                }

                if (childMoved || keysChanged) {
                    // Position or keyframes still changing — user is dragging
                    // a layer or a keyframe. Update cache but DON'T rebake.
                    // Keep previous postPos/restPos (light mode returns nulls).
                    _anySettling = true;
                    setStatus("amber", "Settling");
                    cache[lyr.id] = {
                        parents: lyr.parents.slice(),
                        weights: lyr.weights.slice(),
                        wkh:     lyr.wkh || "",
                        restPos: lyr.restPos || prev.restPos,
                        postPos: lyr.postPos || prev.postPos,
                        postRot: lyr.postPos ? lyr.postRot : prev.postRot,
                        postScl: lyr.postScl || prev.postScl,
                        time:    state.time,
                        settling: true,
                        settleCount: 0
                    };
                    continue;
                }

                // Check if we're settling after a drag (position stopped changing)
                var settledRebake = false;
                if (prev.settling) {
                    var sc = (prev.settleCount || 0) + 1;
                    if (sc >= 3) {
                        settledRebake = true;
                    } else {
                        _anySettling = true;
                        cache[lyr.id] = {
                            parents: lyr.parents.slice(),
                            weights: lyr.weights.slice(),
                            wkh:     lyr.wkh || "",
                            restPos: lyr.restPos || prev.restPos,
                            postPos: lyr.postPos || prev.postPos,
                            postRot: lyr.postPos ? lyr.postRot : prev.postRot,
                            postScl: lyr.postScl || prev.postScl,
                            time:    state.time,
                            settling: true,
                            settleCount: sc
                        };
                        continue;
                    }
                }

                // Two rebake paths depending on what changed:
                //   preserveVisual: unparent only — keep child where it IS
                //   recompute: parent added/swapped, keyframe change, or child move
                //     — recompute from rest (preserving rest avoids baking the
                //     current expression delta into the base position)
                var preserveVisual = unparented;
                var recompute = parentChanged || settledRebake || keysChanged;

                if (preserveVisual || recompute) {
                    // Time guard: skip if playhead moved since we cached.
                    if (Math.abs(state.time - prev.time) > 0.001) {
                        cache[lyr.id] = {
                            parents: lyr.parents.slice(),
                            weights: lyr.weights.slice(),
                            wkh:     lyr.wkh || "",
                            restPos: lyr.restPos || prev.restPos,
                            postPos: lyr.postPos || prev.postPos,
                            postRot: lyr.postPos ? lyr.postRot : prev.postRot,
                            postScl: lyr.postScl || prev.postScl,
                            time:    state.time
                        };
                        continue;
                    }

                    setStatus("amber", "Rebaking");

                    if (preserveVisual) {
                        // Parent changed or weight dropped to 0: preserve the
                        // child's current visual position through the rebake.
                        var cachedPos = JSON.stringify(prev.postPos);
                        var cachedRot = prev.postRot;
                        var cachedScl = JSON.stringify(prev.postScl);
                        csInterface.evalScript(
                            'cepPreserveAndRebake(' + lyr.id + ',' +
                            "'" + cachedPos + "'," +
                            cachedRot + ',' +
                            "'" + cachedScl + "')"
                        );
                    } else {
                        // Keyframes changed or child moved: recompute the rig
                        // from the child's current rest position. DON'T use
                        // cached post-expression visual — it may be corrupt
                        // from stale bakes.
                        csInterface.evalScript('cepApplyOrRefresh(' + lyr.id + ')');
                    }

                    delete cache[lyr.id];
                    continue;
                }

                // Update cache with current state
                cache[lyr.id] = {
                    parents: lyr.parents.slice(),
                    weights: lyr.weights.slice(),
                    wkh:     lyr.wkh || "",
                    restPos: lyr.restPos ? lyr.restPos.slice() : (prev ? prev.restPos : null),
                    postPos: lyr.postPos ? lyr.postPos.slice() : (prev ? prev.postPos : null),
                    postRot: lyr.postPos ? lyr.postRot : (prev ? prev.postRot : 0),
                    postScl: lyr.postScl ? lyr.postScl.slice() : (prev ? prev.postScl : null),
                    time:    state.time
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

            // Status: tracking if any layers rigged and not settling
            if (!_anySettling && state.rigged.length > 0) {
                setStatus("green", "Tracking " + state.rigged.length + " layer" + (state.rigged.length > 1 ? "s" : ""));
            }
        });
    }

    // ---- Startup ----

    applyTheme();
    csInterface.addEventListener("com.adobe.csxs.events.ThemeColorChanged", applyTheme);
    initPaths();
    setInterval(poll, POLL_MS);
})();
