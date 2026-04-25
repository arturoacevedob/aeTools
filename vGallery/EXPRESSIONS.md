# vGallery Rig — canonical expressions

Source-of-truth expressions for the vGallery rig as it ships in
`vGalleryRig.jsx` v1.0.0. Reference for porting, debugging, or
hand-applying outside the script.

Companion docs in this folder:
- `CLAUDE.md` — context for AI assistants
- `README.md` — end-user docs

Process artifacts elsewhere in the repo:
- `docs/superpowers/specs/2026-04-25-v-gallery-apply-script-design.md`
- `docs/superpowers/plans/2026-04-25-v-gallery-apply-script.md`

---

## Pseudo-effect on `vGALLERY CONTROLLER`

Effect group name: **`vGallery`**. Authored via atom-ae's `create_rig` tool
(then saved as `vGallery.ffx` and embedded into the JSX). Empty `group`
entries act as section dividers in the Effect Controls panel.

```json
{
  "name": "vGallery",
  "layerId": <vGALLERY CONTROLLER id>,
  "controls": [
    {"type": "group",  "name": "// CONTROLS",          "children": []},
    {"type": "slider", "name": "Offset",        "default": 0,   "min": -100,  "max": 100},
    {"type": "slider", "name": "Spacing",       "default": 600, "min": 1,     "max": 5000},
    {"type": "angle",  "name": "V Angle",       "default": 90},
    {"type": "slider", "name": "Visible Range", "default": 5,   "min": 0,     "max": 20},
    {"type": "color",  "name": "Fade Color",    "default": [0, 0, 0]},
    {"type": "group",  "name": " ",                    "children": []},
    {"type": "group",  "name": "// DATA",              "children": []},
    {"type": "slider", "name": "Image Count",   "default": 0,   "min": 0,     "max": 1000},
    {"type": "slider", "name": "Total Length",  "default": 0,   "min": 0,     "max": 1000000},
    {"type": "group",  "name": "  ",                   "children": []},
    {"type": "group",  "name": "// Conjured with love", "children": []},
    {"type": "group",  "name": "// at The Heist.",     "children": []}
  ]
}
```

(The footer is split across two group rows because AE truncates property
names at 31 characters, so `// Conjured with love at The Heist.` won't
fit on one line.)

**User-facing controls:**
- `Offset` — image-index at apex. `Offset = 5` → image #5 at apex. Stable
  across N (image 5 stays as image 5 even when more images are added).
- `Spacing` — distance along the leg between adjacent images, in
  controller-local units.
- `V Angle` — opening angle, in degrees. 0° = collapsed onto bisector;
  180° = flat horizontal line. Rotate the controller layer to reorient.
- `Visible Range` — number of images per leg visible before fade completes.
- `Fade Color` — color images fade to at the visible-range boundary.

**Auto-computed (read-only) controls** — driven by expressions, not user
input. They centralize the layer scan so per-image expressions don't loop:
- `Image Count` — scans the comp once per frame for `vg_*`-prefixed
  enabled layers and emits N.
- `Total Length` — `Image Count × Spacing`.

### Auto-computed control expressions

`Image Count`:
```js
var n = 0;
for (var i = 1; i <= thisComp.numLayers; i++) {
    var L = thisComp.layer(i);
    if (L.name.toLowerCase().indexOf("vg_") === 0 && L.enabled) { n++; }
}
n;
```

`Total Length`:
```js
effect("vGallery")("Image Count") * effect("vGallery")("Spacing");
```

---

## Master `vGallery Drop Shadow` on `vGALLERY CONTROLLER`

A vanilla `ADBE Drop Shadow` effect, renamed to `vGallery Drop Shadow`. Its
five visible sub-properties are user-controlled (no expressions on the
controller side). Per-image layers' Drop Shadow sub-properties expression-link
into this one.

Default values set on first creation:
- Shadow Color: `[0, 0, 0, 1]` (opaque black)
- Opacity: `50`
- Direction: `135`
- Distance: `5`
- Softness: `0`

---

## Per-image expressions

Applied to every selected, validated, `vg_`-prefixed layer in the comp. The
script writes the controller's actual current name (e.g., `vGALLERY CONTROLLER`,
or whatever it was renamed to) into each expression at apply time, so a
controller rename → re-Apply rewires everything.

`<CTRL>` below stands for the controller's display name.

### `vGallery Travel Location` Slider — Slider sub-property

Computes path-position from the layer's index among `vg_*` siblings,
modulo total cycle length. Exits the scan early once self is found.

```js
var ctrl = thisComp.layer("<CTRL>");
var spacing = ctrl.effect("vGallery")("Spacing");
var offset  = ctrl.effect("vGallery")("Offset");
var totalLen = ctrl.effect("vGallery")("Total Length");
var myIdx = -1, cnt = 0;
for (var i = 1; i <= thisComp.numLayers; i++) {
    var L = thisComp.layer(i);
    if (L.name.toLowerCase().indexOf("vg_") === 0 && L.enabled) {
        if (L.index === index) { myIdx = cnt; break; }
        cnt++;
    }
}
if (myIdx < 0 || totalLen <= 0) {
    value;
} else {
    (((offset - myIdx) * spacing) % totalLen + totalLen) % totalLen;
}
```

### `Transform/Position`

Maps path-position to V coordinates in the controller's local space, then
to world. No comp scan — reads `Total Length` from the controller.

```js
var ctrl = thisComp.layer("<CTRL>");
var halfAng = degreesToRadians(ctrl.effect("vGallery")("V Angle") / 2);
var totalLen = ctrl.effect("vGallery")("Total Length");
var halfLen = totalLen / 2;
var p = effect("vGallery Travel Location")("Slider");
var d = p;
if (d > halfLen) { d = d - totalLen; }
var legSign = (d >= 0) ? 1 : -1;
var legDist = Math.abs(d);
var localX = legSign * legDist * Math.sin(halfAng);
var localY = legDist * Math.cos(halfAng);
ctrl.toWorld([localX, localY, 0]);
```

### `Transform/Opacity`

Hard cutoff to 0 outside the fade zone for performance — AE skips rendering
opacity-zero layers. Inside the fade zone, returns `value`, which is the
layer's underlying static value or keyframes. User keyframing is preserved.

```js
var ctrl = thisComp.layer("<CTRL>");
var spacing = ctrl.effect("vGallery")("Spacing");
var visRange = ctrl.effect("vGallery")("Visible Range");
var totalLen = ctrl.effect("vGallery")("Total Length");
var p = effect("vGallery Travel Location")("Slider");
var distFromApex = Math.min(p, totalLen - p);
var visDist = visRange * spacing;
if (visDist <= 0 || distFromApex > visDist) { 0; } else { value; }
```

### `vGallery Tint` — Amount to Tint

No comp scan.

```js
var ctrl = thisComp.layer("<CTRL>");
var spacing = ctrl.effect("vGallery")("Spacing");
var visRange = ctrl.effect("vGallery")("Visible Range");
var totalLen = ctrl.effect("vGallery")("Total Length");
var p = effect("vGallery Travel Location")("Slider");
var distFromApex = Math.min(p, totalLen - p);
var visDist = visRange * spacing;
if (visDist <= 0) { 100; } else { linear(distFromApex, 0, visDist, 0, 100); }
```

### `vGallery Tint` — Map Black To, Map White To

Both bound to vGallery's `Fade Color`:

```js
thisComp.layer("<CTRL>").effect("vGallery")("Fade Color")
```

MatchPaths on the renamed `ADBE Tint` effect:
- Map Black To: `ADBE Tint-0001`
- Map White To: `ADBE Tint-0002`
- Amount to Tint: `ADBE Tint-0003`

### `vGallery Drop Shadow` sub-properties

All five visible sub-properties expression-linked to the master
`vGallery Drop Shadow` on the controller:

| Sub-property | Expression |
|---|---|
| Shadow Color | `thisComp.layer("<CTRL>").effect("vGallery Drop Shadow")("Shadow Color")` |
| Opacity | `…effect("vGallery Drop Shadow")("Opacity")` |
| Direction | `…effect("vGallery Drop Shadow")("Direction")` |
| Distance | `…effect("vGallery Drop Shadow")("Distance")` |
| Softness | `…effect("vGallery Drop Shadow")("Softness")` |

`Shadow Only` is left per-layer (no expression).

MatchPaths on the renamed `ADBE Drop Shadow` effect:
- Shadow Color: `ADBE Drop Shadow-0001`
- Opacity: `ADBE Drop Shadow-0002`
- Direction: `ADBE Drop Shadow-0003`
- Distance: `ADBE Drop Shadow-0004`
- Softness: `ADBE Drop Shadow-0005`
- Shadow Only: `ADBE Drop Shadow-0006`

---

## Behavior summary

- `Offset` is image-index. `Offset = k` → image with `myIdx = k` sits at
  the apex. Image identity is stable: image #5 is always image #5
  regardless of how many total images are present.
- The path is a closed loop of length `N × Spacing`. Apex at `p=0`, seam at
  `p=halfLen=N×Spacing/2`. Adjacent images on a leg are exactly `Spacing` apart.
- Fade is symmetric around the apex: images within `Visible Range × Spacing`
  path-units of the apex tint smoothly to `Fade Color`; beyond that they're
  fully tinted.
- Both legs fade to the same color at the same rate. A draw-distance fog
  effect controlling how many images are seen before they vanish.
