# handoff — Claude Code instructions

Dynamic parenting rig for After Effects, shipped as a single `.jsx` with the
pseudo-effect `.ffx` embedded as a hex-escape binary string. End users only
need `Handoff.jsx`. Source-of-truth `.ffx` lives at `handoff/Handoff.ffx`
for editing in Pseudo Effect Maker.

## Live AE testing — atom-ae MCP server

`atom-ae` is connected at `http://127.0.0.1:51310/mcp` (verify with
`claude mcp list`). Tools are NOT in Claude Code's deferred pool — call
directly via curl JSON-RPC:

```bash
curl -sS -X POST http://127.0.0.1:51310/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"<tool>","arguments":{...}}}'
```

Useful tools: `initialize_session` (call first, returns Atom instructions
+ active comp state), `run_extendscript` (auto-rollback checkpoints),
`revert_checkpoint` (id from prior output), `list_layers`, `get_keyframes`,
`scan_property_tree`, `preview_frames` (base64 contact sheets).

Test fixture: `dynamicParenting` comp (id `80485`), `Apple` (id `80517`,
3D shape), `Right Hand` (id `80516`), `Left Hand` (id `80515`). Hands meet
at `[960, 540]` at t=6 — that's the handoff moment.

## AE expression engine — known traps (verified live in AE 2025)

These broke earlier rewrites. Don't rediscover them.

- **`valueAtTime(t, preExpression)`** — two-arg form is **ExtendScript ONLY**,
  not in expressions. Use single-arg form.
- **Recursive `thisProperty.valueAtTime(t-dt)`** — AE returns the raw
  keyframed value, NOT the expression's previous-frame output. Accumulator
  patterns DO NOT work. Use segment-based integration instead.
- **Array `+` `-` `*`** — broken on V8 expression engine. Use `add` / `sub`
  / `mul` / `length` vector helpers.
- **`if/else` and `while`** — must brace BOTH branches in expressions
  (`if (x) { a; } else { b; }`). The parser is strict.
- **`addProperty("Pseudo/anything")`** — fails unless the pseudo effect is
  already registered. Register via `layer.applyPreset(File)` with a `.ffx`
  containing the definition (Smart Rekt / rendertom pattern).
- **Pseudo effect sub-properties** — `canSetEnabled = false`. You CANNOT
  gray out a sub-property at runtime. We considered clamp expressions on
  the controls as a workaround but rejected it: 20+ expression badges
  cluttering the layer when the user presses EE is worse than no visual
  feedback. The position/rotation/scale expressions handle mutual
  exclusion mathematically via `wPropFor(p, channel)` instead — only the
  three transform properties carry expressions.
- **`applyPreset(file)` selection requirement** — target layer must be the
  SOLE selection, or AE creates a new Solid layer for the preset. Always
  `selectOnly(layer)` first.
- **Pseudo effect "groups" are visually nested but FLAT in the property
  tree.** Header rows are NO_VALUE (`pvt=6412`). Access children by name
  at the effect's top level: `effect("Handoff")("P1 Layer")`, not
  `.property("Parent 1").property("P1 Layer")` (which throws).
- **`addProperty` invalidates prior child refs** — re-acquire after each
  call.

## Pseudo effect via embedded binary (Smart Rekt / rendertom pattern)

End users get a single `.jsx`. The `.ffx` is hex-encoded as `\xHH` escape
sequences between `// EMBED:BEGIN` / `// EMBED:END` markers. On first run,
the script writes the bytes to
`~/Library/Application Support/aeTools/Handoff/Handoff.ffx` then
`applyPreset`s it. AE auto-registers the pseudo effect when applied.

Regenerate the embedded blob after editing the `.ffx` in Pseudo Effect Maker:

```bash
node tools/embed_ffx.js   # from the repo root
```

ExtendScript binary writes are byte-exact when `file.encoding = "BINARY"`
and the string contains only code units 0x00–0xFF — verified with all 256
byte values round-tripping cleanly.

## Code style (ExtendScript)

- ES3 only: `var`, `function` keyword, no `let`/`const`/arrow/destructuring.
- Always brace `if/else` AND `while` bodies in expressions (parser quirk).
- Use `add`/`sub`/`mul`/`length` vector helpers, never `+`/`-`/`*` on arrays.
- Use `propByMatchPath(layer, path)` runtime helper from atom-ae.
- Never `comp.layer(idx)` — use `app.project.layerByID(id)`.
- Re-acquire property refs after each `addProperty` (it invalidates priors).

## Pre-flight before sending to live AE

```bash
cp handoff/Handoff.jsx /tmp/check.js && node --check /tmp/check.js && rm /tmp/check.js
```

Plus: extract `EXPR_POSITION` / `EXPR_ROTATION` / `EXPR_SCALE` from the IIFE
and `new Function()` each to catch expression-string parse errors before
they show up "Expression Disabled" in AE. The script `tools/build_pseudo_test.js`
does this automatically when generating the test rig.
