# Handoff

Weighted, switchable, sticky dynamic parenting for After Effects.

## What it does

Pick up to 5 parent layers and a per-parent weight (0..1). When a weight is
non-zero, the rigged layer **inherits that parent's motion in world space** —
position, rotation, and scale, frame to frame. When you ease a weight back to 0
the layer **keeps the offset it accumulated and stops inheriting**; it does
NOT snap back to its rest position.

This is the "stays where it was" property motion designers expect for
hand-offs. Classic example: an apple parented to the left hand, handed off to
the right hand mid-shot. With Handoff you fade the left-hand weight to 0 and
the right-hand weight to 1; the apple inherits left-hand motion during the
fade-out, then right-hand motion during the fade-in, and ends up correctly
attached to the right hand without any popping.

This is **velocity inheritance**, not positional blending. If you wanted the
layer to *snap* to the parent's current position when weight goes to 1, that
is a different rig (a Look-At / Track-To constraint) and not what this script
does.

## Install

Drop `Handoff.jsx` into After Effects' ScriptUI Panels folder:

- **macOS**: `~/Library/Application Support/Adobe/After Effects <version>/Scripts/ScriptUI Panels/`
- **Windows**: `C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\ScriptUI Panels\`

Restart After Effects. The panel appears under `Window → Handoff.jsx`. Dock it
anywhere.

> **Single-file install.** `Handoff.jsx` is everything you need. No
> `PresetEffects.xml` editing, no `.ffx` sidecar, no AE restart beyond the
> first one. The pseudo effect is embedded inside the script as a binary
> blob; on first run it gets cached to
> `~/Library/Application Support/aeTools/Handoff/Handoff.ffx` and
> applied via `layer.applyPreset()`. Same pattern as Smart Rekt, Overlord,
> and other widely-distributed AE scripts.

## Use

1. Select one or more layers in your comp.
2. Click **Handoff**. The script attaches expressions to Position, Rotation,
   and Scale, and applies a single **"Handoff" pseudo effect** to the layer.
   The effect contains 5 collapsible Parent groups, each with:
   - `P{n} Layer` — layer picker for parent n
   - `P{n} Weight` — shared weight (0..1) driving all three channels
   - `P{n} Individual Weights` (sub-group)
     - `P{n} Use Individual Weights` — checkbox, off by default
     - `P{n} Position` — per-channel position weight
     - `P{n} Scale` — per-channel scale weight
     - `P{n} Rotation` — per-channel rotation weight
3. Drop the parent layers into the `P{n} Layer` slots and animate
   `P{n} Weight` (or the individual sliders) to hand off between them.
4. To remove the rig, click the **✕** button. It clears the expressions and
   removes the Handoff effect (and any leftover controls from older
   versions of the script).

The Handoff effect is a single collapsible block in the Effect Controls
panel — twirl down `Parent N` to see that parent's controls, twirl down
`P{n} Individual Weights` to expose the per-channel sliders. Same UX as
Smart Rekt and other Pseudo Effect Maker-built rigs.

### Shared vs individual weights

By default, `P{n} Weight` controls position, rotation, and scale together
for parent n — the simple case. Toggle **`P{n} Use Individual Weights`**
to drive position, rotation, and scale independently via `P{n} Position`,
`P{n} Scale`, and `P{n} Rotation`. The toggle is **per-parent**, so you can
mix shared and individual modes across parent slots — e.g., parent 1 uses
shared weight, parent 2 contributes only position via the individual
slider.

When the checkbox is OFF, the individual sliders are clamped to 0 by an
expression on each one (so they have no effect on the rig). When the
checkbox is ON, the shared weight slider is clamped to 0 the same way.
This mutual-exclusion is purely cosmetic — only one mode is "live" for
each parent at any time, even though all sliders are visually editable.
(AE doesn't let scripts gray out pseudo-effect sub-parameters at runtime;
this clamp pattern is the closest approximation.)

## How the math works

Each frame, the expression computes the full integral from time 0 through
the current time of the weighted parent velocity, and adds that offset to
the host's own `value`:

```
offset(t) = Σ_parents  ∫₀ᵗ  weight(s) · (d/ds parent.toWorld(anchor, s))  ds
result(t) = value + offset(t)
```

The integral for each parent is split into segments at the boundaries of
that parent's weight keyframes. On a segment where the weight is constant
(typical: before a fade begins, or after it ends), the integral has a
closed form:

```
segment_offset = (parent.toWorld(anchor, tB) - parent.toWorld(anchor, tA)) · weight
```

On a segment where the weight varies (the crossfade window itself), the
integral is evaluated as a midpoint Riemann sum over individual frames —
slower, but accurate through the transition.

Per-frame cost is `O(weight keyframes)` in the fast path and
`O(frames within variable segments)` in the slow path. Total render cost
is approximately `O(frames × weight keyframes)` — typically a handful of
keyframes per parent, so in practice it scales near-linearly with comp
length.

- **Position** integrates weighted world-space vector deltas via `toWorld()`.
- **Rotation** integrates weighted degree deltas derived from `atan2` of a
  parent-local unit vector after `toWorld()`. Wraparound (359° → 1°) is
  corrected by clamping per-segment deltas to ±180° via `unwrap()`.
- **Scale** integrates in log space: weighted `log(scale_ratio)` per axis,
  derived from the length of parent-local basis vectors after `toWorld()`.
  Multiple parents combine cleanly by log-sum, then the output is
  `value ⊙ exp(log_offset)` component-wise.

All three expressions use AE's `add` / `sub` / `mul` / `length` vector
helpers and are compatible with both the **Legacy** and **V8** expression
engines.

> **Why not recursive delta?** An earlier draft tried
> `thisProperty.valueAtTime(t - dt)` to recursively accumulate a per-frame
> offset for `O(frames)` total cost. Live testing in AE 2025 confirmed that
> the expression engine does NOT feed the expression's previous-frame
> output back into itself through this call — the recursive lookup returns
> the raw keyframed value instead, and the accumulator collapses to a
> single frame's worth of delta. The segment-based approach above avoids
> recursion entirely and is verified to work in-engine.

## Limitations

- **Comp must start at time 0.** The expressions assume `t=0` is the
  reference state. If your work area starts later, the rig still works but
  the "rest position" is the layer's value at frame 0.
- **Variable-weight segments introduce a small residual offset.** The
  crossfade window is integrated by midpoint Riemann sum, which is a
  first-order approximation. In live testing, a 15-frame crossfade between
  two hands yielded about 1 px of residual offset that is then carried
  forward (which is the correct "sticky" behavior — once the handoff
  completes, the layer stays locked to the new parent from wherever it
  landed). Shorter crossfades reduce the residual; longer ones may
  accumulate a noticeable offset.
- **Scale is unsigned.** Flipped layers (negative scale) are not handled
  correctly because we extract scale from `length()` of basis vectors.
- **Rotation is 2D only.** The script attaches to `ADBE Rotate Z`. For 3D
  layers with X/Y/Z rotation, only Z is rigged.
- **Host layer can't have keyframes on the rigged property.** The rig
  adds its computed offset to `value`, which is the host's rest position.
  If you keyframe the host's own position while it's rigged, the host's
  keyframes will animate underneath the rig's contribution — usually
  not what you want. Animate a parent layer instead, or bake the rig.
- **Keyframing the `Use Individual Weights` checkbox isn't recommended.**
  The expression samples the checkbox state at the current evaluation
  time and picks one slider as the "live" weight source for each channel.
  If you keyframe the toggle itself, the segment integration won't see
  the toggle as a boundary and the contribution from before the toggle
  may be miscounted. Pick a mode per parent and stick with it.

## Updating the embedded preset (developers)

`Handoff.jsx` ships with the pseudo effect's binary `.ffx` embedded as a
hex string. To regenerate it after editing the pseudo effect in
[Pseudo Effect Maker](https://aescripts.com/pseudo-effect-maker/):

1. Save the updated `.ffx` over `handoff/Handoff.ffx` (the source-of-truth
   binary lives in the repo so it can be inspected and re-edited).
2. From the repo root, run:
   ```
   node tools/embed_ffx.js
   ```
3. This rewrites the `EMBED:BEGIN`...`EMBED:END` block inside
   `handoff/Handoff.jsx` with the encoded bytes from the new `.ffx`.
4. Commit both files together.

End users only need `Handoff.jsx`. The `.ffx` in the repo is for
development only — the script writes its own copy to the user's
`Application Support` folder on first run from the embedded data.

## History

The original Handoff script integrated weight × velocity over the entire
timeline on every single frame and had a correctness bug under the V8
expression engine: array `+`/`-`/`*` operators do string concatenation or
NaN instead of component-wise math. This rewrite fixes the V8 bug, extends
the rig from position-only to all three transform channels (position,
rotation, scale), adds the shared-vs-individual weight mode, replaces the
flat 18-control programmatic layout with a single-file pseudo effect
delivery (Pseudo Effect Maker → embedded binary in the .jsx → cached and
applied on first run), and was live-verified in AE 2025 against a handoff
between two animated hand layers. See the git log for the full diff,
including an interim recursive-delta attempt that was reverted after live
testing showed AE's expression engine does not support the recursion
pattern it relied on.
