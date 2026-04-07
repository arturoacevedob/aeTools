/*
    Handoff — ScriptUI Panel
    Weighted, switchable, sticky dynamic parenting for After Effects.

    What it does
    ------------
    Dynamic parenting via velocity inheritance. Pick up to 5 parent layers
    and a per-parent weight (0..1). When a weight is non-zero, the rigged
    layer inherits that parent's *delta motion* in world space — frame to
    frame. When you ease a weight back to 0 the layer keeps the offset it
    accumulated and stops inheriting; it does NOT snap back to its rest
    position. This is the "stays where it was" property motion designers
    expect for hand-offs (e.g. apple from left hand to right hand).

    Position, rotation, and scale are all rigged. By default a single
    "Weight N" slider controls all three channels for parent N. Toggle
    "Use Individual Weights" to drive Position / Rotation / Scale weights
    separately per parent.

    How the math works
    ------------------
    For each frame t, the expression computes the full integral from 0
    to t of the weighted parent velocity, and adds that offset to the
    host's own value:

        offset(t) = Σ_parents  ∫₀ᵗ  weight(s) · (d/ds parent.toWorld(anchor, s))  ds
        result(t) = value + offset(t)

    The integral is split into segments at the boundaries of each
    parent's weight keyframes. On a segment where the weight is constant
    (e.g., before a fade begins, or after it ends), the integral has a
    closed form:

        segment_offset = (parent.toWorld(anchor, tB) - parent.toWorld(anchor, tA)) · weight

    On a segment where the weight varies (the crossfade window itself),
    the integral is evaluated as a midpoint Riemann sum over individual
    frames — slower, but accurate through the transition.

    Per-frame cost is O(weight keyframes) in the fast case (constant
    segments), and O(frames within variable segments) in the slow case.
    For typical motion-design rigs with a handful of weight keyframes
    and short crossfade windows, total render cost is O(frames × few).

    WHY NOT RECURSIVE DELTA?
    An earlier version of this rig tried to use recursive
    thisProperty.valueAtTime(t - dt) to achieve O(frames) total cost.
    Live testing in AE 2025 confirmed that the expression engine does
    NOT feed the expression's previous-frame output back into itself
    through this call — instead it returns the raw keyframed value and
    breaks the accumulator. The segment-based integration below avoids
    recursion entirely and is verified to work.

    Position is integrated as additive world-space vectors via toWorld().
    Rotation is integrated as additive degrees via the angle of a unit
    vector transformed through toWorld(). Scale is integrated as a
    multiplicative ratio via the length of basis vectors transformed
    through toWorld() — handled in log space inside the accumulator so
    that contributions from multiple parents combine cleanly.

    Compatible with both the Legacy and V8 expression engines (uses
    add/sub/mul vector helpers throughout — no array-operator booby
    traps).
*/

(function (thisObj) {

    var SCRIPT_NAME = "Handoff";

    // ---- Control naming ------------------------------------------------------
    //
    // Programmatic effect creation. No pseudo effect dependency. Each rigged
    // layer gets these 26 expression controls at the top level of its Effect
    // Controls panel:
    //
    //   Layer 1..5             — Layer Control, picks the parent layer
    //   Weight 1..5            — Slider, shared weight (0..1) for parent N
    //   Use Individual Weights — Checkbox
    //   Pos Weight 1..5        — Slider, position-only weight when checkbox on
    //   Rot Weight 1..5        — Slider, rotation-only weight when checkbox on
    //   Scale Weight 1..5      — Slider, scale-only weight when checkbox on

    var SLOTS           = 5;
    var NAME_LAYER      = "Layer ";
    var NAME_WEIGHT     = "Weight ";
    var NAME_USE_INDIV  = "Use Individual Weights";
    var NAME_POS_WEIGHT = "Pos Weight ";
    var NAME_ROT_WEIGHT = "Rot Weight ";
    var NAME_SCL_WEIGHT = "Scale Weight ";

    var MN_LAYER     = "ADBE Layer Control";
    var MN_SLIDER    = "ADBE Slider Control";
    var MN_CHECKBOX  = "ADBE Checkbox Control";

    // ---- Shared expression preamble ------------------------------------------
    //
    // Every property's expression starts with these helpers. Defining them as
    // a single block keeps the three expression bodies short and consistent.

    var EXPR_PREAMBLE = [
        'var dt = thisComp.frameDuration;',
        'var L = thisLayer;',
        'var useIndiv = L.effect("' + NAME_USE_INDIV + '")(1).value > 0.5;',
        '',
        '// Resolve weight for this channel (shared or individual)',
        'function W(p, indivName) {',
        '    var name = useIndiv ? (indivName + p) : ("' + NAME_WEIGHT + '" + p);',
        '    return L.effect(name)(1).value;',
        '}',
        ''
    ].join('\n');

    // Helper: given a weight property wProp, return the list of segment
    // boundary times in (0, now) — used by all three expressions.
    var SEGS_HELPER = [
        'function segsFor(wProp) {',
        '    var segs = [0];',
        '    var nk = wProp.numKeys;',
        '    for (var k = 1; k <= nk; k++) {',
        '        var kt = wProp.key(k).time;',
        '        if (kt > 0 && kt < time) { segs.push(kt); }',
        '    }',
        '    segs.push(time);',
        '    return segs;',
        '}',
        '',
        '// Get the effect name for parent slot p on this channel',
        'function wName(p, indivName) {',
        '    return useIndiv ? (indivName + p) : ("' + NAME_WEIGHT + '" + p);',
        '}',
        ''
    ].join('\n');

    // ---- Position expression -------------------------------------------------
    //
    // Segment-based integration of weighted parent velocity in world space.
    // For each parent slot with a non-trivial weight, walk the weight
    // property's keyframes and integrate the parent's world-space motion
    // weighted by the per-segment weight. Constant-weight segments use the
    // closed form  (toWorld(tB) - toWorld(tA)) * weight. Variable-weight
    // segments use a per-frame midpoint Riemann sum.

    var EXPR_POSITION = EXPR_PREAMBLE + SEGS_HELPER + [
        'function pOff(p) {',
        '    var lyr   = L.effect("' + NAME_LAYER + '" + p)(1);',
        '    var wProp = L.effect(wName(p, "' + NAME_POS_WEIGHT + '"))(1);',
        '    var a     = lyr.transform.anchorPoint.value;',
        '    var n     = value.length;',
        '    var zero  = [];',
        '    for (var i = 0; i < n; i++) { zero[i] = 0; }',
        '',
        '    if (wProp.numKeys === 0) {',
        '        var wVal = wProp.value;',
        '        if (wVal === 0) { return zero; }',
        '        return mul(sub(lyr.toWorld(a, time), lyr.toWorld(a, 0)), wVal);',
        '    }',
        '',
        '    var segs = segsFor(wProp);',
        '    var off  = zero;',
        '    var pA   = lyr.toWorld(a, segs[0]);',
        '    var wA   = wProp.valueAtTime(segs[0]);',
        '    for (var s = 1; s < segs.length; s++) {',
        '        var tB = segs[s];',
        '        var pB = lyr.toWorld(a, tB);',
        '        var wB = wProp.valueAtTime(tB);',
        '        if (wA !== 0 || wB !== 0) {',
        '            if (Math.abs(wA - wB) < 1e-4) {',
        '                off = add(off, mul(sub(pB, pA), wA));',
        '            } else {',
        '                var fStart = Math.round(segs[s - 1] / dt);',
        '                var fEnd   = Math.round(tB / dt);',
        '                var pPrev  = pA;',
        '                for (var f = fStart; f < fEnd; f++) {',
        '                    var tNext = (f + 1) * dt;',
        '                    if (tNext > tB) { tNext = tB; }',
        '                    var pNext = lyr.toWorld(a, tNext);',
        '                    var wMid  = wProp.valueAtTime((f * dt + tNext) * 0.5);',
        '                    if (wMid !== 0) {',
        '                        off = add(off, mul(sub(pNext, pPrev), wMid));',
        '                    }',
        '                    pPrev = pNext;',
        '                }',
        '            }',
        '        }',
        '        pA = pB;',
        '        wA = wB;',
        '    }',
        '    return off;',
        '}',
        '',
        'var total = [];',
        'for (var i = 0; i < value.length; i++) { total[i] = 0; }',
        'for (var p = 1; p <= ' + SLOTS + '; p++) {',
        '    try { total = add(total, pOff(p)); } catch (e) {}',
        '}',
        'add(value, total);'
    ].join('\n');

    // ---- Rotation expression -------------------------------------------------
    //
    // Scalar segment-based integration. World rotation is derived from the
    // angle of the parent's local X-axis after toWorld — this correctly
    // walks the parent's parent chain. Wraparound (359° → 1°) is corrected
    // by clamping per-segment deltas to ±180° via unwrap().

    var EXPR_ROTATION = EXPR_PREAMBLE + SEGS_HELPER + [
        'function worldRot(lyr, t) {',
        '    var p0 = lyr.toWorld([0, 0], t);',
        '    var p1 = lyr.toWorld([100, 0], t);',
        '    return radiansToDegrees(Math.atan2(p1[1] - p0[1], p1[0] - p0[0]));',
        '}',
        '',
        'function unwrap(d) {',
        '    while (d > 180)  { d -= 360; }',
        '    while (d < -180) { d += 360; }',
        '    return d;',
        '}',
        '',
        'function rOff(p) {',
        '    var lyr   = L.effect("' + NAME_LAYER + '" + p)(1);',
        '    var wProp = L.effect(wName(p, "' + NAME_ROT_WEIGHT + '"))(1);',
        '',
        '    if (wProp.numKeys === 0) {',
        '        var wVal = wProp.value;',
        '        if (wVal === 0) { return 0; }',
        '        return unwrap(worldRot(lyr, time) - worldRot(lyr, 0)) * wVal;',
        '    }',
        '',
        '    var segs = segsFor(wProp);',
        '    var off  = 0;',
        '    var rA   = worldRot(lyr, segs[0]);',
        '    var wA   = wProp.valueAtTime(segs[0]);',
        '    for (var s = 1; s < segs.length; s++) {',
        '        var tB = segs[s];',
        '        var rB = worldRot(lyr, tB);',
        '        var wB = wProp.valueAtTime(tB);',
        '        if (wA !== 0 || wB !== 0) {',
        '            if (Math.abs(wA - wB) < 1e-4) {',
        '                off += unwrap(rB - rA) * wA;',
        '            } else {',
        '                var fStart = Math.round(segs[s - 1] / dt);',
        '                var fEnd   = Math.round(tB / dt);',
        '                var rPrev  = rA;',
        '                for (var f = fStart; f < fEnd; f++) {',
        '                    var tNext = (f + 1) * dt;',
        '                    if (tNext > tB) { tNext = tB; }',
        '                    var rNext = worldRot(lyr, tNext);',
        '                    var wMid  = wProp.valueAtTime((f * dt + tNext) * 0.5);',
        '                    if (wMid !== 0) {',
        '                        off += unwrap(rNext - rPrev) * wMid;',
        '                    }',
        '                    rPrev = rNext;',
        '                }',
        '            }',
        '        }',
        '        rA = rB;',
        '        wA = wB;',
        '    }',
        '    return off;',
        '}',
        '',
        'var total = 0;',
        'for (var p = 1; p <= ' + SLOTS + '; p++) {',
        '    try { total += rOff(p); } catch (e) {}',
        '}',
        'value + total;'
    ].join('\n');

    // ---- Scale expression ----------------------------------------------------
    //
    // Scale combines multiplicatively, so we integrate in log space:
    //     log_offset = Σ_parents  ∫₀ᵗ  weight · d/ds log(parent_scale)  ds
    //     result     = value ⊙ exp(log_offset)   (component-wise)
    //
    // Only the X and Y components are derived from toWorld basis vectors.
    // Z (on 3D layers) passes through unchanged — log delta stays at 0, so
    // exp(0) = 1 multiplies value[2] by 1.

    var EXPR_SCALE = EXPR_PREAMBLE + SEGS_HELPER + [
        'var EPS = 1e-6;',
        '',
        'function worldScale(lyr, t) {',
        '    var p0 = lyr.toWorld([0, 0], t);',
        '    var px = lyr.toWorld([100, 0], t);',
        '    var py = lyr.toWorld([0, 100], t);',
        '    var sx = length(sub(px, p0)) / 100;',
        '    var sy = length(sub(py, p0)) / 100;',
        '    return [Math.max(sx, EPS), Math.max(sy, EPS)];',
        '}',
        '',
        '// log delta between two worldScale samples, zero-padded to length n',
        'function logD(sA, sB, n) {',
        '    var d = [];',
        '    for (var i = 0; i < n; i++) { d[i] = 0; }',
        '    d[0] = Math.log(sB[0]) - Math.log(sA[0]);',
        '    d[1] = Math.log(sB[1]) - Math.log(sA[1]);',
        '    return d;',
        '}',
        '',
        'function sOff(p, n) {',
        '    var lyr   = L.effect("' + NAME_LAYER + '" + p)(1);',
        '    var wProp = L.effect(wName(p, "' + NAME_SCL_WEIGHT + '"))(1);',
        '    var zero  = [];',
        '    for (var i = 0; i < n; i++) { zero[i] = 0; }',
        '',
        '    if (wProp.numKeys === 0) {',
        '        var wVal = wProp.value;',
        '        if (wVal === 0) { return zero; }',
        '        return mul(logD(worldScale(lyr, 0), worldScale(lyr, time), n), wVal);',
        '    }',
        '',
        '    var segs = segsFor(wProp);',
        '    var off  = zero;',
        '    var sA   = worldScale(lyr, segs[0]);',
        '    var wA   = wProp.valueAtTime(segs[0]);',
        '    for (var s = 1; s < segs.length; s++) {',
        '        var tB = segs[s];',
        '        var sB = worldScale(lyr, tB);',
        '        var wB = wProp.valueAtTime(tB);',
        '        if (wA !== 0 || wB !== 0) {',
        '            if (Math.abs(wA - wB) < 1e-4) {',
        '                off = add(off, mul(logD(sA, sB, n), wA));',
        '            } else {',
        '                var fStart = Math.round(segs[s - 1] / dt);',
        '                var fEnd   = Math.round(tB / dt);',
        '                var sPrev  = sA;',
        '                for (var f = fStart; f < fEnd; f++) {',
        '                    var tNext = (f + 1) * dt;',
        '                    if (tNext > tB) { tNext = tB; }',
        '                    var sNext = worldScale(lyr, tNext);',
        '                    var wMid  = wProp.valueAtTime((f * dt + tNext) * 0.5);',
        '                    if (wMid !== 0) {',
        '                        off = add(off, mul(logD(sPrev, sNext, n), wMid));',
        '                    }',
        '                    sPrev = sNext;',
        '                }',
        '            }',
        '        }',
        '        sA = sB;',
        '        wA = wB;',
        '    }',
        '    return off;',
        '}',
        '',
        'var n = value.length;',
        'var totalLog = [];',
        'for (var i = 0; i < n; i++) { totalLog[i] = 0; }',
        'for (var p = 1; p <= ' + SLOTS + '; p++) {',
        '    try { totalLog = add(totalLog, sOff(p, n)); } catch (e) {}',
        '}',
        'var out = [];',
        'for (var i = 0; i < n; i++) { out[i] = value[i] * Math.exp(totalLog[i]); }',
        'out;'
    ].join('\n');

    // ---- Rig apply / remove --------------------------------------------------

    function findEffect(layer, name) {
        var fxPar = layer.property("ADBE Effect Parade");
        for (var i = 1; i <= fxPar.numProperties; i++) {
            if (fxPar.property(i).name === name) return fxPar.property(i);
        }
        return null;
    }

    function ensureControl(layer, name, matchName, defaultValue) {
        var existing = findEffect(layer, name);
        if (existing) return existing;
        var fxPar = layer.property("ADBE Effect Parade");
        var ctrl  = fxPar.addProperty(matchName);
        ctrl.name = name;
        if (defaultValue !== undefined && matchName === MN_SLIDER) {
            try { ctrl.property(1).setValue(defaultValue); } catch (e) {}
        }
        return ctrl;
    }

    function applyRig(layer) {
        // Layer pickers + shared weights
        for (var p = 1; p <= SLOTS; p++) {
            ensureControl(layer, NAME_LAYER  + p, MN_LAYER);
            ensureControl(layer, NAME_WEIGHT + p, MN_SLIDER, 0);
        }
        // Mode toggle
        ensureControl(layer, NAME_USE_INDIV, MN_CHECKBOX);
        // Per-channel weights (only used when toggle is on)
        for (var q = 1; q <= SLOTS; q++) {
            ensureControl(layer, NAME_POS_WEIGHT + q, MN_SLIDER, 0);
            ensureControl(layer, NAME_ROT_WEIGHT + q, MN_SLIDER, 0);
            ensureControl(layer, NAME_SCL_WEIGHT + q, MN_SLIDER, 0);
        }

        // Attach the three expressions
        var tg  = layer.property("ADBE Transform Group");
        tg.property("ADBE Position").expression  = EXPR_POSITION;
        tg.property("ADBE Rotate Z").expression  = EXPR_ROTATION;
        tg.property("ADBE Scale").expression     = EXPR_SCALE;
    }

    function removeRig(layer) {
        // Clear expressions first
        var tg = layer.property("ADBE Transform Group");
        var props = ["ADBE Position", "ADBE Rotate Z", "ADBE Scale"];
        for (var i = 0; i < props.length; i++) {
            var pr = tg.property(props[i]);
            if (pr.expressionEnabled) pr.expression = "";
        }

        // Remove all controls we created (matched by name)
        var names = [];
        for (var p = 1; p <= SLOTS; p++) {
            names.push(NAME_LAYER  + p);
            names.push(NAME_WEIGHT + p);
        }
        names.push(NAME_USE_INDIV);
        for (var q = 1; q <= SLOTS; q++) {
            names.push(NAME_POS_WEIGHT + q);
            names.push(NAME_ROT_WEIGHT + q);
            names.push(NAME_SCL_WEIGHT + q);
        }

        var fxPar = layer.property("ADBE Effect Parade");
        for (var n = fxPar.numProperties; n >= 1; n--) {
            var fxName = fxPar.property(n).name;
            for (var k = 0; k < names.length; k++) {
                if (fxName === names[k]) {
                    fxPar.property(n).remove();
                    break;
                }
            }
        }
    }

    // ---- UI ------------------------------------------------------------------

    function buildUI(thisObj) {
        var panel = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });

        panel.orientation = "column";
        panel.alignChildren = ["fill", "top"];
        panel.spacing = 0;
        panel.margins = 6;

        var row = panel.add("group");
        row.orientation = "row";
        row.alignChildren = ["fill", "fill"];
        row.spacing = 4;
        row.margins = 0;

        var mainBtn = row.add("button", undefined, "Handoff");
        mainBtn.alignment = ["fill", "fill"];
        mainBtn.preferredSize = [-1, 32];
        mainBtn.helpTip = "Apply dynamic parenting to selected layers";

        var xBtn = row.add("button", undefined, "\u2715");
        xBtn.preferredSize = [32, 32];
        xBtn.maximumSize = [32, 32];
        xBtn.alignment = ["right", "fill"];
        xBtn.helpTip = "Remove dynamic parenting from selected layers";

        mainBtn.onClick = function () {
            var comp = app.project.activeItem;
            if (!comp || !(comp instanceof CompItem)) {
                alert("Open a composition first.", SCRIPT_NAME);
                return;
            }
            var sel = comp.selectedLayers;
            if (sel.length === 0) {
                alert("Select at least one layer.", SCRIPT_NAME);
                return;
            }
            app.beginUndoGroup("Apply " + SCRIPT_NAME);
            for (var i = 0; i < sel.length; i++) {
                try {
                    applyRig(sel[i]);
                } catch (e) {
                    alert(
                        "Could not apply to \"" + sel[i].name + "\".\n\n"
                        + "Error: " + e.message,
                        SCRIPT_NAME
                    );
                    break;
                }
            }
            app.endUndoGroup();
        };

        xBtn.onClick = function () {
            var comp = app.project.activeItem;
            if (!comp || !(comp instanceof CompItem)) return;
            var sel = comp.selectedLayers;
            if (sel.length === 0) {
                alert("Select layer(s) to remove rig from.", SCRIPT_NAME);
                return;
            }
            app.beginUndoGroup("Remove " + SCRIPT_NAME);
            for (var i = 0; i < sel.length; i++) {
                removeRig(sel[i]);
            }
            app.endUndoGroup();
        };

        panel.layout.layout(true);
        if (!(panel instanceof Panel)) {
            panel.center();
            panel.show();
        }
        return panel;
    }

    buildUI(thisObj);

})(this);
