#!/usr/bin/env node
// bump_version.js — increment the aeTools collection version (semver).
//
// The version lives in two places:
//   1. /VERSION at the repo root (single line, e.g. "1.0.5")
//   2. The .jsx filename of every script (e.g. "Handoff v1.0.5.jsx")
//
// There is intentionally NO SCRIPT_VERSION constant inside the .jsx
// source. The filename IS the version, which means AE shows it in the
// Window menu and the docked tab title automatically without the script
// having to render anything in its UI. The script's display name stays
// "Handoff" forever.
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

// Each script the bump tool manages. The bump tool finds the current
// versioned filename via the prefix + suffix pattern, then renames it.
// Add new scripts here as the collection grows.
const SCRIPTS = [
    {
        dir: path.join(ROOT, 'handoff'),
        prefix: 'Handoff v',
        suffix: '.jsx',
    }
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

function findCurrent(script) {
    if (!fs.existsSync(script.dir)) {
        throw new Error('Script directory missing: ' + script.dir);
    }
    var files = fs.readdirSync(script.dir).filter(function (f) {
        return f.indexOf(script.prefix) === 0
            && f.lastIndexOf(script.suffix) === f.length - script.suffix.length;
    });
    if (files.length === 0) {
        throw new Error(
            'No file matching "' + script.prefix + '*' + script.suffix + '" in ' + script.dir
        );
    }
    if (files.length > 1) {
        throw new Error(
            'Multiple matching files in ' + script.dir + ' — clean up old versions first:\n  '
            + files.join('\n  ')
        );
    }
    return path.join(script.dir, files[0]);
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

    for (var i = 0; i < SCRIPTS.length; i++) {
        var s = SCRIPTS[i];
        var oldPath = findCurrent(s);
        var newPath = path.join(s.dir, s.prefix + newStr + s.suffix);
        if (oldPath === newPath) {
            console.warn('  WARN: script already at ' + newStr + ' (' + path.basename(oldPath) + ')');
            continue;
        }
        fs.renameSync(oldPath, newPath);
        console.log('  ' + path.relative(ROOT, oldPath) + ' -> ' + path.relative(ROOT, newPath));
    }
}

main();
