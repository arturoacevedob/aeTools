/*
    Handoff — ScriptUI Panel
    Weighted, switchable, sticky dynamic parenting for After Effects.
    Requires the Atom-DynParent pseudo effect in PresetEffects.xml.
*/

(function (thisObj) {

    var SCRIPT_NAME = "Handoff";
    var EFFECT_MATCH = "Atom-DynParent";
    var EFFECT_NAME = "Dynamic Parenting";

    // ---- Expression (segment-optimized) --------------------------------------

    var EXPR = [
        'var dt = thisComp.frameDuration;',
        'var now = time;',
        'var fx = effect("Dynamic Parenting");',
        '',
        'function pOff(lyr, wP) {',
        '    var a = lyr.transform.anchorPoint.value;',
        '    var nk = wP.numKeys;',
        '    if (nk === 0) {',
        '        var w = wP.value;',
        '        return w > 0 ? (lyr.toWorld(a, now) - lyr.toWorld(a, 0)) * w : [0, 0];',
        '    }',
        '    var segs = [0];',
        '    for (var k = 1; k <= nk; k++) {',
        '        var kt = wP.key(k).time;',
        '        if (kt > 0 && kt < now) { segs.push(kt); }',
        '    }',
        '    segs.push(now);',
        '    var off = [0, 0];',
        '    for (var s = 0; s < segs.length - 1; s++) {',
        '        var tA = segs[s], tB = segs[s + 1];',
        '        var wA = wP.valueAtTime(tA);',
        '        var wB = wP.valueAtTime(tB);',
        '        if (wA <= 0 && wB <= 0) { continue; }',
        '        if (Math.abs(wA - wB) < 0.001) {',
        '            off = off + (lyr.toWorld(a, tB) - lyr.toWorld(a, tA)) * wA;',
        '        } else {',
        '            for (var f = Math.round(tA / dt); f < Math.round(tB / dt); f++) {',
        '                var t = f * dt, t1 = Math.min(t + dt, now);',
        '                var w = wP.valueAtTime(t);',
        '                if (w > 0) { off = off + (lyr.toWorld(a, t1) - lyr.toWorld(a, t)) * w; }',
        '            }',
        '        }',
        '    }',
        '    return off;',
        '}',
        '',
        'var total = [0, 0];',
        'for (var p = 1; p <= 5; p++) {',
        '    try {',
        '        total = total + pOff(fx("Layer " + p), fx("Weight " + p));',
        '    } catch(e) {}',
        '}',
        'value + total;'
    ].join('\n');

    // ---- Core ----------------------------------------------------------------

    function hasEffect(layer) {
        var fxPar = layer.property("ADBE Effect Parade");
        for (var i = 1; i <= fxPar.numProperties; i++) {
            if (fxPar.property(i).matchName === EFFECT_MATCH) return true;
        }
        return false;
    }

    function applyRig(layer) {
        if (!hasEffect(layer)) {
            var pe = layer.property("ADBE Effect Parade").addProperty(EFFECT_MATCH);
            pe.name = EFFECT_NAME;
        }
        layer.property("ADBE Transform Group").property("ADBE Position").expression = EXPR;
    }

    function removeRig(layer) {
        var pos = layer.property("ADBE Transform Group").property("ADBE Position");
        if (pos.expressionEnabled) pos.expression = "";
        var fxPar = layer.property("ADBE Effect Parade");
        for (var i = fxPar.numProperties; i >= 1; i--) {
            if (fxPar.property(i).matchName === EFFECT_MATCH) {
                fxPar.property(i).remove();
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
