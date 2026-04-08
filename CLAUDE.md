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
