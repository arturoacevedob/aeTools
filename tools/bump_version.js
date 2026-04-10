#!/usr/bin/env node
// bump_version.js — increment the aeTools collection version (semver).
//
// The version lives in two places, kept in lockstep:
//   1. /VERSION at the repo root (single line, e.g. "1.0.5")
//   2. The "Version: X.Y.Z" line inside each script's header comment block
//
// The .jsx FILENAME stays clean (e.g. "Handoff.jsx") so AE's docked panel
// header reads "Handoff" with no version clutter. The script display
// name stays "Handoff" forever. The version is visible to anyone who
// opens the source — second line of the script header comment block —
// but never appears in the user-facing UI.
//
// Usage:
//   node tools/bump_version.js              # patch (default): 1.0.5 -> 1.0.6
//   node tools/bump_version.js patch        # explicit patch
//   node tools/bump_version.js minor        # 1.0.5 -> 1.1.0  (resets patch)
//   node tools/bump_version.js major        # 1.5.3 -> 2.0.0  (resets minor + patch)
//
// When to bump which:
//   patch — small fixes: typos, doc tweaks, refactors with no behavior change
//   minor — new features, schema additions, anything backwards-compatible
//   major — breaking changes: removed parameters, renamed pseudo-effect
//           matchnames without legacy cleanup, anything that breaks
//           existing rigs in user projects
//
// Run before every commit:
//   node tools/bump_version.js [bump]
//   git add -A && git commit -m "..."
//   git push

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VERSION_FILE = path.join(ROOT, 'VERSION');

// Each script the bump tool manages. The tool finds the "Version: X.Y.Z"
// line in the script's header comment block and rewrites it. Add new
// scripts here as the collection grows.
const JSX_TARGETS = [
    path.join(ROOT, 'handoff', 'Handoff.jsx'),
];

// Additional files with version strings in other formats.
const EXTRA_TARGETS = [
    { file: path.join(ROOT, 'handoff', 'cep', 'com.aetools.handoff', 'index.html'),
      pattern: /v\d+\.\d+\.\d+/,
      replace: function(v) { return 'v' + v; } },
];

function parseSemver(versionStr) {
    var m = versionStr.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!m) {
        throw new Error(
            'Invalid semver in VERSION file: "' + versionStr + '"\n' +
            'Expected format: MAJOR.MINOR.PATCH (e.g. "1.0.5")'
        );
    }
    return { major: parseInt(m[1], 10), minor: parseInt(m[2], 10), patch: parseInt(m[3], 10) };
}

function bumpSemver(v, level) {
    if (level === 'major') return { major: v.major + 1, minor: 0, patch: 0 };
    if (level === 'minor') return { major: v.major,     minor: v.minor + 1, patch: 0 };
    if (level === 'patch') return { major: v.major,     minor: v.minor,     patch: v.patch + 1 };
    throw new Error('Unknown bump level: "' + level + '" (expected patch | minor | major)');
}

function format(v) {
    return v.major + '.' + v.minor + '.' + v.patch;
}

function main() {
    var level = (process.argv[2] || 'patch').toLowerCase();
    if (level !== 'patch' && level !== 'minor' && level !== 'major') {
        console.error('ERROR: bump level must be patch | minor | major (got "' + level + '")');
        process.exit(1);
    }

    if (!fs.existsSync(VERSION_FILE)) {
        console.error('ERROR: VERSION file not found at ' + VERSION_FILE);
        process.exit(1);
    }
    var oldStr = fs.readFileSync(VERSION_FILE, 'utf8').trim();
    var oldVer = parseSemver(oldStr);
    var newVer = bumpSemver(oldVer, level);
    var newStr = format(newVer);

    fs.writeFileSync(VERSION_FILE, newStr + '\n');
    console.log('VERSION: ' + oldStr + ' -> ' + newStr + '  (' + level + ')');

    var updated = 0;
    for (var i = 0; i < JSX_TARGETS.length; i++) {
        var jsxPath = JSX_TARGETS[i];
        if (!fs.existsSync(jsxPath)) {
            console.warn('  WARN: skipping missing target ' + jsxPath);
            continue;
        }
        var before = fs.readFileSync(jsxPath, 'utf8');
        // Match "Version: X.Y.Z" anywhere on a comment line. Indent and
        // surrounding whitespace are preserved.
        var pattern = /(Version:\s*)\d+\.\d+\.\d+/;
        if (!pattern.test(before)) {
            console.warn('  WARN: no "Version: X.Y.Z" line found in ' + path.basename(jsxPath));
            continue;
        }
        var after = before.replace(pattern, '$1' + newStr);
        fs.writeFileSync(jsxPath, after);
        console.log('  ' + path.relative(ROOT, jsxPath) + ': comment header updated to ' + newStr);
        updated++;
    }

    if (updated === 0) {
        console.warn('No .jsx targets updated. Did you forget the "Version: X.Y.Z" line?');
    }

    for (var j = 0; j < EXTRA_TARGETS.length; j++) {
        var et = EXTRA_TARGETS[j];
        if (!fs.existsSync(et.file)) {
            console.warn('  WARN: skipping missing target ' + et.file);
            continue;
        }
        var content = fs.readFileSync(et.file, 'utf8');
        if (!et.pattern.test(content)) {
            console.warn('  WARN: no version match in ' + path.basename(et.file));
            continue;
        }
        fs.writeFileSync(et.file, content.replace(et.pattern, et.replace(newStr)));
        console.log('  ' + path.relative(ROOT, et.file) + ': updated to ' + newStr);
    }
}

main();
