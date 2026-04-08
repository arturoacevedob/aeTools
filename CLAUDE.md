# aeTools — Claude Code instructions

After Effects scripts, pseudo-effect rigs, and dev tools. Each script in its own
subfolder (`handoff/` so far). Dev helpers in `tools/`.

## Live AE testing — atom-ae MCP server

`atom-ae` is connected at `http://127.0.0.1:51310/mcp` (verify with `claude mcp list`).
Tools are NOT in Claude Code's deferred pool — call directly via curl JSON-RPC:

```bash
curl -sS -X POST http://127.0.0.1:51310/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"<tool>","arguments":{...}}}'
```

Useful tools: `initialize_session` (call first, returns Atom instructions + active
comp state), `run_extendscript` (auto-rollback checkpoints), `revert_checkpoint`
(id from prior output), `list_layers`, `get_keyframes`, `scan_property_tree`,
`preview_frames` (base64 contact sheets).

Test fixture: `dynamicParenting` comp (id `80485`), `Apple` (id `80517`, 3D shape),
`Right Hand` (id `80516`), `Left Hand` (id `80515`). Hands meet at `[960, 540]` at t=6.

## AE expression engine — known traps (verified live in AE 2025)

- **`valueAtTime(t, preExpression)`** — two-arg form is **ExtendScript ONLY**, not in
  expressions. Use single-arg form.
- **Recursive `thisProperty.valueAtTime(t-dt)`** — AE returns the raw keyframed value,
  NOT the expression's previous-frame output. Accumulator patterns DO NOT work.
- **Array `+` `-` `*`** — broken on V8 expression engine. Use `add`/`sub`/`mul`/`length`.
- **`if/else` and `while`** — must brace BOTH branches in expressions.
- **`addProperty("Pseudo/anything")`** — fails unless the pseudo effect is already
  registered. Register via `layer.applyPreset(File)` with a `.ffx` containing the
  definition (Smart Rekt / rendertom pattern).
- **Pseudo effect sub-properties** — `canSetEnabled = false` (no runtime gray-out).
  Use clamp expressions on the controls themselves to force values to 0 in inactive
  modes.
- **`applyPreset(file)` selection requirement** — target layer must be the SOLE
  selection or AE creates a new Solid layer. Always `selectOnly(layer)` first.
- **Pseudo effect "groups" are visually nested but FLAT in the property tree.**
  Header rows are NO_VALUE properties (`pvt=6412`). Access children by name at
  the effect's top level, not via `.property("Parent 1").property("P1 Layer")`.
- **`addProperty` invalidates prior child refs** — re-acquire after each call.

## Pseudo effect via embedded binary (Smart Rekt / rendertom pattern)

End users get a single `.jsx`. The `.ffx` is hex-encoded as `\xHH` escape sequences
between `// EMBED:BEGIN` / `// EMBED:END` markers in the script. On first run, the
script writes the bytes to `~/Library/Application Support/aeTools/<Name>/<Name>.ffx`
then `applyPreset`s it.

Source-of-truth `.ffx` lives in the script's folder (e.g. `handoff/Handoff.ffx`)
for editing in [Pseudo Effect Maker](https://aescripts.com/pseudo-effect-maker/).
Regenerate the embedded blob after edits:

```bash
node tools/embed_ffx.js
```

ExtendScript binary writes are byte-exact when `file.encoding = "BINARY"` and
the string contains only code units 0x00–0xFF — verified with all 256 byte
values round-tripping cleanly.

## Code style

- ExtendScript ES3: `var`, `function` keyword, no `let`/`const`/arrow/destructuring.
- Always brace `if/else` AND `while` bodies in expressions (parser quirk).
- Use `add`/`sub`/`mul`/`length` vector helpers, never `+`/`-`/`*`.
- Use `propByMatchPath(layer, path)` runtime helper from atom-ae.
- Never `comp.layer(idx)` — use `app.project.layerByID(id)`.
- Re-acquire property refs after each `addProperty` (it invalidates priors).

## Pre-flight checks before sending to live AE

```bash
cp handoff/Handoff.jsx /tmp/check.js && node --check /tmp/check.js && rm /tmp/check.js
```

Plus extract `EXPR_*` constants from the IIFE and `new Function()` each to catch
expression-string parse errors before they show up disabled in AE.

## Repo layout

```
aeTools/
  CLAUDE.md
  README.md                        — collection index
  handoff/                         — Handoff dynamic parenting rig
    Handoff.jsx                    — single-file delivery (embedded .ffx blob)
    Handoff.ffx                    — pseudo effect source-of-truth (PEM-built)
    README.md
  tools/
    embed_ffx.js                   — re-embed .ffx into .jsx after PEM edits
    build_pseudo_test.js           — generate atom-ae test rig with embedded binary
  resources/                       — gitignored: Adobe docs, scripting guides
```
