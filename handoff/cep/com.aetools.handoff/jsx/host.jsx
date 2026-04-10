// host.jsx — CEP ExtendScript backend for Handoff
//
// This file is loaded automatically by AE when the CEP panel opens
// (via <ScriptPath> in manifest.xml). It sets CEP mode, loads the
// shared Handoff.jsx (which exports its functions to $.global.__handoff
// instead of building a ScriptUI panel), then adds CEP-callable
// wrapper functions that main.js calls via CSInterface.evalScript().
//
// Architecture: ONE source of truth. All expression templates, baking
// logic, and rig functions live in Handoff.jsx. This file only adds
// the CEP<->ExtendScript bridge layer.

// ---- Registry of rigged layer IDs ----------------------------------------
// Maintained by cepApplyOrRefresh (add) and cepRemoveRig (remove).
// cepReadRigState only scans these IDs instead of all comp layers.
var _riggedLayerIds = [];

function _registryAdd(id) {
    for (var i = 0; i < _riggedLayerIds.length; i++) {
        if (_riggedLayerIds[i] === id) { return; }
    }
    _riggedLayerIds.push(id);
}

function _registryRemove(id) {
    for (var i = 0; i < _riggedLayerIds.length; i++) {
        if (_riggedLayerIds[i] === id) {
            _riggedLayerIds.splice(i, 1);
            return;
        }
    }
}

// ---- Load shared Handoff.jsx ---------------------------------------------

// The CEP panel calls setHandoffJSXPath() at startup to tell us where
// Handoff.jsx lives (derived from the extension's install directory).
// We defer loading until the path is set.
var _handoffJSXLoaded = false;
var _handoffJSXPath = "";

function setHandoffJSXPath(path) {
    _handoffJSXPath = path;
    return "ok";
}

function _ensureLoaded() {
    if (_handoffJSXLoaded) { return; }
    if (_handoffJSXPath === "") {
        throw new Error("Handoff JSX path not set. Call setHandoffJSXPath() first.");
    }
    $.global.__handoff_cep = true;
    $.evalFile(new File(_handoffJSXPath));
    _handoffJSXLoaded = true;
}

// ---- FFX path (set by CEP panel) -----------------------------------------

function setFFXPath(path) {
    $.global.__handoff_ffx_path = path;
    return "ok";
}

// ---- CEP-callable wrapper functions --------------------------------------
// These return JSON strings. main.js parses the results in callbacks.

function cepApplyOrRefresh(layerId) {
    _ensureLoaded();
    var H = $.global.__handoff;
    var layer = app.project.layerByID(layerId);
    var fx = H.findHandoffEffect(layer);
    app.beginUndoGroup("Handoff Auto-Update");
    try {
        if (fx !== null) {
            H.refreshRig(layer);
        } else {
            H.applyRig(layer, H.ensureFFX());
        }
        _registryAdd(layerId);
    } finally {
        app.endUndoGroup();
    }
    return JSON.stringify({ok: true});
}

function cepRemoveRig(layerId) {
    _ensureLoaded();
    var H = $.global.__handoff;
    var layer = app.project.layerByID(layerId);
    app.beginUndoGroup("Remove Handoff");
    try {
        H.removeRig(layer);
        _registryRemove(layerId);
    } finally {
        app.endUndoGroup();
    }
    return JSON.stringify({ok: true});
}

function cepReadRigState(lightMode) {
    _ensureLoaded();
    var H = $.global.__handoff;
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) {
        return JSON.stringify({active: false});
    }

    // Prune registry: remove IDs for layers that no longer exist or
    // no longer have the Handoff effect (user may have deleted manually).
    var validIds = [];
    for (var r = 0; r < _riggedLayerIds.length; r++) {
        var rid = _riggedLayerIds[r];
        try {
            var rlyr = app.project.layerByID(rid);
            if (rlyr.containingComp.id !== comp.id) { continue; }
            if (H.findHandoffEffect(rlyr) === null) { continue; }
            validIds.push(rid);
        } catch (e) {
            // Layer no longer exists
        }
    }
    _riggedLayerIds = validIds;

    var rigged = [];
    for (var i = 0; i < _riggedLayerIds.length; i++) {
        var lyr = app.project.layerByID(_riggedLayerIds[i]);
        var fx = H.findHandoffEffect(lyr);
        if (fx === null) { continue; }

        var parents = [];
        var weights = [];
        var weightKeyHash = "";
        for (var p = 1; p <= H.SLOTS; p++) {
            parents.push(fx.property(H.nLayer(p)).value);
            var wp = fx.property(H.nWeight(p));
            weights.push(wp.value);
            // Build a hash from keyframe count + interpolated values at two
            // sentinel times. Avoids reading individual keyTime() values,
            // which forces AE to resolve keyframe overlaps during active
            // drags and causes keyframes to jump forward.
            var nk = wp.numKeys;
            weightKeyHash += nk;
            if (nk > 0) {
                weightKeyHash += ":" + wp.valueAtTime(0, false).toFixed(4);
                weightKeyHash += ":" + wp.valueAtTime(comp.duration * 0.5, false).toFixed(4);
                weightKeyHash += ":" + wp.valueAtTime(comp.duration, false).toFixed(4);
            }
            weightKeyHash += "|";
        }

        // Light mode: skip expensive expression evaluation (postPos/postRot/
        // postScl/restPos). Used during keyframe settling to avoid blocking
        // AE's main thread during UI interactions (keyframe drags).
        var postPos = null;
        var postRot = 0;
        var postScl = null;
        var restPos = null;

        if (!lightMode) {
            var tg = lyr.property("ADBE Transform Group");
            var posU = tg.property("ADBE Position");
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
            postRot = tg.property("ADBE Rotate Z").valueAtTime(comp.time, false);
            postScl = tg.property("ADBE Scale").valueAtTime(comp.time, false);

            // Pre-expression rest position (for detecting child moves)
            if (posU.dimensionsSeparated) {
                restPos = [
                    tg.property("ADBE Position_0").valueAtTime(comp.time, true),
                    tg.property("ADBE Position_1").valueAtTime(comp.time, true),
                    lyr.threeDLayer ? tg.property("ADBE Position_2").valueAtTime(comp.time, true) : 0
                ];
            } else {
                var rv = posU.valueAtTime(comp.time, true);
                restPos = [rv[0], rv[1], rv[2] || 0];
            }
        }

        rigged.push({
            id:       lyr.id,
            name:     lyr.name,
            parents:  parents,
            wkh:      weightKeyHash,
            weights:  weights,
            restPos:  restPos,
            postPos:  postPos,
            postRot:  postRot,
            postScl:  postScl
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
    _ensureLoaded();
    var H = $.global.__handoff;
    var layer = app.project.layerByID(layerId);
    var cachedPos = (typeof cachedPosJson === "string") ? JSON.parse(cachedPosJson) : cachedPosJson;
    var cachedScl = (typeof cachedSclJson === "string") ? JSON.parse(cachedSclJson) : cachedSclJson;

    // Save apply time BEFORE clearing expressions (v1.3.2 pattern)
    var savedApplyTime = H.readOldApplyTime(layer);

    app.beginUndoGroup("Handoff Auto-Update");
    try {
        var tg = layer.property("ADBE Transform Group");
        var posU = tg.property("ADBE Position");

        // Clear all expressions first
        H.safeClearExpression(posU);
        H.safeClearExpression(tg.property("ADBE Position_0"));
        H.safeClearExpression(tg.property("ADBE Position_1"));
        H.safeClearExpression(tg.property("ADBE Position_2"));
        H.safeClearExpression(tg.property("ADBE Rotate Z"));
        H.safeClearExpression(tg.property("ADBE Scale"));

        // Write cached visual as rest values so the child doesn't jump
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

        // Rebake with current parent configuration, preserving apply time
        var fx = H.findHandoffEffect(layer);
        if (fx !== null) {
            H.writeExpressions(layer, fx, savedApplyTime);
        }
    } finally {
        app.endUndoGroup();
    }
    return JSON.stringify({ok: true});
}
