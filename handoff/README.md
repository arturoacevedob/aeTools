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

> No pseudo-effect install needed. The script creates all required expression
> controls programmatically on each layer it rigs. Works on any AE install
> with no `PresetEffects.xml` editing.

## Use

1. Select one or more layers in your comp.
2. Click **Handoff**. The script attaches expressions to Position, Rotation,
   and Scale, and adds **18 expression controls** to the layer — one
   6-control block per parent slot, in this order:
   - `Layer N` — layer picker for parent N
   - `Weight N` — shared weight slider (0..1) for parent N
   - `Use Individual N` — checkbox, off by default; toggles per-channel
     weights for *this* parent only
   - `Pos Weight N` — position-only weight, used when `Use Individual N` is on
   - `Rot Weight N` — rotation-only weight, same
   - `Scale Weight N` — scale-only weight, same
3. Drop the parent layers into the `Layer N` slots and animate `Weight N` to
   hand off between them.
4. To remove the rig, click the **✕** button. It clears the expressions and
   removes every managed control (matched by name pattern so it also cleans
   up rigs from older versions of the script).

The default `SLOTS` constant at the top of `Handoff.jsx` is **3** — three
parent slots, 18 top-level effects. Bump `SLOTS` up if you need more
(e.g., 5 parents = 30 controls); the math and expressions scale
automatically.

### Shared vs individual weights

By default, `Weight N` controls position, rotation, and scale together for
parent N — the simple case. Toggle **Use Individual N** to drive position,
rotation, and scale independently via `Pos Weight N`, `Rot Weight N`, and
`Scale Weight N`. Because the checkbox is per-parent, you can have one
parent contributing shared motion while another parent contributes only
position, for example.

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

## History

The original Handoff script integrated weight × velocity over the entire
timeline on every single frame and had a correctness bug under the V8
expression engine: array `+`/`-`/`*` operators do string concatenation or
NaN instead of component-wise math. This rewrite fixes the V8 bug, extends
the rig from position-only to all three transform channels (position,
rotation, scale), adds the shared-vs-individual weight mode, drops the
PresetEffects.xml pseudo-effect install dependency in favor of programmatic
control creation, and was live-verified in AE 2025 against a handoff
between two animated hand layers. See the git log for the full diff,
including an interim recursive-delta attempt that was reverted after live
testing showed AE's expression engine does not support the recursion
pattern it relied on.
