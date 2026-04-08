#!/usr/bin/env node
// Build a self-contained ExtendScript test rig that exercises the
// embedded-binary applyPreset path against Apple in dynamicParenting.
//
// The test rig reads HANDOFF_FFX_BINARY straight from Handoff.jsx so
// the test always uses the same payload as the script being shipped.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JSX  = path.join(ROOT, 'handoff', 'Handoff.jsx');

const src = fs.readFileSync(JSX, 'utf8');

// Pull HANDOFF_FFX_BINARY between the EMBED markers, and the three EXPR
// constants by evaling the IIFE in a sandbox.
function captureExprs(jsxSrc) {
    let captured = {};
    function __capture(pos, rot, scl, bin) {
        captured.pos = pos; captured.rot = rot; captured.scl = scl; captured.bin = bin;
    }
    global.__capture = __capture;
    let stub = jsxSrc.replace(
        /buildUI\(thisObj\);\s*\n\s*\}\)\(this\);\s*$/,
        '__capture(EXPR_POSITION, EXPR_ROTATION, EXPR_SCALE, HANDOFF_FFX_BINARY); })(null);'
    );
    eval(stub);
    return captured;
}

const cap = captureExprs(src);

if (!cap.bin || cap.bin.length === 0) {
    console.error('ERROR: HANDOFF_FFX_BINARY is empty in Handoff.jsx. Run `node tools/embed_ffx.js` first.');
    process.exit(1);
}

// JS-string-escape ExpressionScript source: backslash, quotes, newlines.
function jsLiteral(s) {
    return s
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}

// Re-encode a binary string (each char is a byte 0..255) as \xHH escape
// sequences. This is essential for control bytes (NUL, NL, etc.) which
// can't be embedded literally in source code or JSON-RPC payloads.
function binaryLiteral(s) {
    let out = '';
    for (let i = 0; i < s.length; i++) {
        const b = s.charCodeAt(i);
        out += '\\x' + (b < 16 ? '0' : '') + b.toString(16).toUpperCase();
    }
    return out;
}

const rig = `
var COMP_ID = 80485, APPLE_ID = 80517, RH_ID = 80516, LH_ID = 80515;

var SLOTS = 5;
var EFFECT_NAME = "Handoff";
var HANDOFF_MATCHNAME = "Pseudo/PEM Matchname";

function pn(prefix, n) { return "P" + n + " " + prefix; }
function nLayer(n)     { return pn("Layer", n); }
function nWeight(n)    { return pn("Weight", n); }
function nUseIndiv(n)  { return pn("Use Individual Weights", n); }
function nPosWeight(n) { return pn("Position", n); }
function nSclWeight(n) { return pn("Scale", n); }
function nRotWeight(n) { return pn("Rotation", n); }

var EXPR_POS = "${jsLiteral(cap.pos)}";
var EXPR_ROT = "${jsLiteral(cap.rot)}";
var EXPR_SCL = "${jsLiteral(cap.scl)}";

// Embedded binary preset (from Handoff.jsx HANDOFF_FFX_BINARY)
var HANDOFF_FFX_BINARY = "${binaryLiteral(cap.bin)}";

function ensureFFX() {
    var dir = new Folder(Folder.userData.fsName + "/aeTools/Handoff");
    if (!dir.exists) { dir.create(); }
    var ffx = new File(dir.fsName + "/Handoff.ffx");
    var needsWrite = !ffx.exists || ffx.length !== HANDOFF_FFX_BINARY.length;
    if (needsWrite) {
        ffx.encoding = "BINARY";
        if (!ffx.open("w")) {
            throw new Error("Could not open " + ffx.fsName + " for writing.");
        }
        ffx.write(HANDOFF_FFX_BINARY);
        ffx.close();
    }
    return ffx;
}

function sharedWeightClamp(p) {
    return 'effect("' + EFFECT_NAME + '")("' + nUseIndiv(p) + '").value > 0.5 ? 0 : value';
}
function individualWeightClamp(p) {
    return 'effect("' + EFFECT_NAME + '")("' + nUseIndiv(p) + '").value > 0.5 ? value : 0';
}

var LEGACY_PATTERNS = [/^Layer \\d+$/, /^Weight \\d+$/, /^Use Individual \\d+$/, /^Pos Weight \\d+$/, /^Rot Weight \\d+$/, /^Scale Weight \\d+$/];
var LEGACY_EXACT = ["Use Individual Weights"];
function isLegacyEffect(name) {
    for (var i = 0; i < LEGACY_PATTERNS.length; i++) { if (LEGACY_PATTERNS[i].test(name)) return true; }
    for (var j = 0; j < LEGACY_EXACT.length; j++) { if (name === LEGACY_EXACT[j]) return true; }
    return false;
}

function findHandoffEffect(layer) {
    var fxPar = layer.property("ADBE Effect Parade");
    for (var i = 1; i <= fxPar.numProperties; i++) {
        var fx = fxPar.property(i);
        if (fx.name === EFFECT_NAME || fx.matchName === HANDOFF_MATCHNAME) return fx;
    }
    return null;
}

function removeRig(layer) {
    var tg = layer.property("ADBE Transform Group");
    var props = ["ADBE Position", "ADBE Rotate Z", "ADBE Scale"];
    for (var i = 0; i < props.length; i++) {
        var pr = tg.property(props[i]);
        if (pr.expressionEnabled) { pr.expression = ""; }
    }
    var fxPar = layer.property("ADBE Effect Parade");
    for (var n = fxPar.numProperties; n >= 1; n--) {
        var fx = fxPar.property(n);
        if (fx.name === EFFECT_NAME || fx.matchName === HANDOFF_MATCHNAME) { fxPar.property(n).remove(); }
        else if (isLegacyEffect(fx.name)) { fxPar.property(n).remove(); }
    }
}

function selectOnly(layer) {
    var comp = layer.containingComp;
    for (var i = 1; i <= comp.numLayers; i++) { comp.layer(i).selected = false; }
    layer.selected = true;
}

function applyRig(layer, ffxFile) {
    removeRig(layer);
    selectOnly(layer);
    layer.applyPreset(ffxFile);
    var handoff = findHandoffEffect(layer);
    if (handoff === null) { throw new Error("applyPreset did not install the Handoff effect."); }
    for (var p = 1; p <= SLOTS; p++) {
        var sharedW = handoff.property(nWeight(p));
        var posW    = handoff.property(nPosWeight(p));
        var sclW    = handoff.property(nSclWeight(p));
        var rotW    = handoff.property(nRotWeight(p));
        if (sharedW) { sharedW.expression = sharedWeightClamp(p); }
        if (posW)    { posW.expression    = individualWeightClamp(p); }
        if (sclW)    { sclW.expression    = individualWeightClamp(p); }
        if (rotW)    { rotW.expression    = individualWeightClamp(p); }
    }
    var tg  = layer.property("ADBE Transform Group");
    tg.property("ADBE Position").expression  = EXPR_POS;
    tg.property("ADBE Rotate Z").expression  = EXPR_ROT;
    tg.property("ADBE Scale").expression     = EXPR_SCL;
}

// --- Run test ---
var apple = app.project.layerByID(APPLE_ID);
var lh    = app.project.layerByID(LH_ID);
var rh    = app.project.layerByID(RH_ID);

$.writeln("ensureFFX: writing/loading cached preset...");
var ffxFile = ensureFFX();
$.writeln("  cache path: " + ffxFile.fsName);
$.writeln("  cache size: " + ffxFile.length + " bytes");
$.writeln("  embedded:   " + HANDOFF_FFX_BINARY.length + " bytes");
$.writeln("  match:      " + (ffxFile.length === HANDOFF_FFX_BINARY.length));
$.writeln("");

applyRig(apple, ffxFile);

var handoff = findHandoffEffect(apple);
handoff.property(nLayer(1)).setValue(lh.index);
handoff.property(nLayer(2)).setValue(rh.index);

propByMatchPath(apple, "ADBE Transform Group#1/ADBE Position#1").setValue([320, 540, 0]);

var w1 = handoff.property(nWeight(1));
var w2 = handoff.property(nWeight(2));
w1.setValueAtTime(0,    1);
w1.setValueAtTime(5.75, 1);
w1.setValueAtTime(6.25, 0);
w1.setValueAtTime(15,   0);
w2.setValueAtTime(0,    0);
w2.setValueAtTime(5.75, 0);
w2.setValueAtTime(6.25, 1);
w2.setValueAtTime(15,   1);

$.writeln("Handoff pseudo effect applied to " + apple.name);
$.writeln("  Apple effect count: " + apple.property("ADBE Effect Parade").numProperties);
$.writeln("  Layer 1 -> " + lh.name + " (index " + lh.index + ")");
$.writeln("  Layer 2 -> " + rh.name + " (index " + rh.index + ")");
`;

fs.writeFileSync('/tmp/handoff_pseudo_test.jsx', rig);
console.log('Wrote /tmp/handoff_pseudo_test.jsx (' + rig.length + ' chars)');
console.log('  embedded binary: ' + cap.bin.length + ' chars');
