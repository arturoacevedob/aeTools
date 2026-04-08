# aeTools — Claude Code instructions

A collection of After Effects scripts, pseudo-effect rigs, and dev tools.

## Layout

```
aeTools/
  CLAUDE.md           — this file (collection-level)
  README.md           — collection index for humans
  <script>/           — one folder per script, each with its own CLAUDE.md
    CLAUDE.md         — script-specific notes (live in the script folder)
    <Script>.jsx      — single-file deliverable
    <Script>.ffx      — pseudo-effect source-of-truth (if applicable)
    README.md
  tools/              — dev helpers shared across scripts
    embed_ffx.js      — re-embed a script's .ffx into its .jsx after PEM edits
    build_pseudo_test.js — generate atom-ae test rigs with embedded binaries
  resources/          — gitignored: Adobe docs, scripting guides, reference material
```

Each script folder has its own `CLAUDE.md` with the script-specific
learnings (AE expression-engine traps, test fixture details, code style for
that script's runtime, etc). When working in a script subfolder, both this
root `CLAUDE.md` AND the script's `CLAUDE.md` are loaded.

## Conventions across the collection

- **Single-file delivery.** End users should only need to drop the `.jsx`
  into their `Scripts/ScriptUI Panels/` folder. If a script needs a binary
  pseudo-effect, embed it via the rendertom-style hex-escape pattern (see
  `tools/embed_ffx.js` and `handoff/CLAUDE.md`) — no `.ffx` sidecars, no
  `PresetEffects.xml` editing, no install dance.
- **Source-of-truth binaries live in the script folder** (e.g.,
  `handoff/Handoff.ffx`) so they can be edited in Pseudo Effect Maker and
  inspected in git. After editing, rerun `node tools/embed_ffx.js` to
  refresh the embedded blob in the corresponding `.jsx`.
- **Per-script READMEs** for end users. **Per-script CLAUDE.md files** for
  AI-assistant context.
- **Never auto-commit.** Only commit when explicitly asked.

## Versioning (semver, in the filename)

The version lives in **two places**, kept in lockstep:

1. **`VERSION`** at the repo root — single line, e.g. `1.0.1`
2. **The `.jsx` filename** — e.g. `handoff/Handoff v1.0.1.jsx`

There is intentionally NO `SCRIPT_VERSION` constant inside the script
source. The filename IS the version, which means AE shows it
automatically in the **`Window` menu** and the **docked panel tab title**
without the script having to render anything in its UI. Script display
names stay clean ("Handoff", not "Handoff v1.0.1") forever — only the
filename carries the version.

**Bump the version on every commit**, choosing the right segment:

| Bump | When | Example |
|---|---|---|
| `patch` (default) | Small fixes: typos, doc tweaks, refactors with no behavior change | `1.0.5 → 1.0.6` |
| `minor` | New features, schema additions, anything backwards-compatible | `1.0.5 → 1.1.0` |
| `major` | Breaking changes: removed parameters, renamed pseudo-effect matchnames without legacy cleanup, anything that breaks existing rigs in user projects | `1.5.3 → 2.0.0` |

Workflow:

```bash
node tools/bump_version.js          # patch (default)
node tools/bump_version.js minor    # bump minor, reset patch
node tools/bump_version.js major    # bump major, reset minor + patch
git add -A
git commit -m "..."
git push
```

`tools/bump_version.js` parses the current version, increments the
requested segment (resetting lower segments per semver), writes the
new value to `VERSION`, and **renames** every script registered in the
`SCRIPTS` array inside the bump tool (e.g.
`Handoff v1.0.4.jsx` → `Handoff v1.0.5.jsx`). Add new scripts to that
array as the collection grows. Each entry has `dir`, `prefix`, and
`suffix` — the bump tool finds the current versioned filename via glob
and renames it in place.

Other tools that need to read a script's source (`embed_ffx.js`,
`build_pseudo_test.js`) also use the same glob pattern to locate the
current versioned `.jsx` file, so renames don't break them.
