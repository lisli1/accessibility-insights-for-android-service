// USAGE:
//
//     node verify-notice-contents.js ./path/to/NOTICE.html
//
// Verifies that gradle.lockfile and NOTICE.html are in sync. Exits with non-zero if NOTICE.html
// contains any listings that gradle.lockfile doesn't suggest are required OR if NOTICE.html is
// missing any listings that gradle.lockfile suggests are required.

const fs = require('fs');
const path = require('path');
const process = require('process');

const noticePath = process.argv[2];

const lockfilePath = path.join(__dirname, '..', 'AccessibilityInsightsForAndroidService', 'app', 'gradle.lockfile');

function isDevTarget(target) {
    return target === 'lintClassPath' || target === '_internal_aapt2_binary' || /Test/.test(target);
}
function isReleaseTarget(target) {
    return !isDevTarget(target);
}
function isEmptyLine(line) {
    // whitespace until EOL or start of comment
    return /^\s*(\#|$)/.test(line);
}

// input format: lines like "com.android.tools.build:apkzlib:4.0.1=target1,target2"
// output format: ["com.android.tools.build/apkzlib 4.0.1", ...]
function parseReleaseDepsFromLockfile(path) {
    const lockfileContent = fs.readFileSync(path).toString();
    const lockfileLines = lockfileContent.split(/\r?\n/);
    const output = [];
    for (const line of lockfileLines) {
        if (isEmptyLine(line) || line.startsWith('empty=')) {
            continue;
        }
    
        const parts = line.split('=');
        if (parts.length !== 2) {
            throw new Error(`malformatted line: ${line}`);
        }
    
        const [dep, targetsLine] = parts;
        const targets = targetsLine.split(',');
    
        if (targets.some(isReleaseTarget)) {
            const [groupId, artifactId, version] = dep.split(':');
            noticeFormatDep = `${groupId}/${artifactId} ${version}`;
            output.push(noticeFormatDep);
        }
    }
    output.sort();
    return output;
}

// input format: HTML page with snippets per dep like
//
// <summary>
//   org.jetbrains/annotations 15.0 - Apache-2.0
// </summary>
//
// output format: ["org.jetbrains/annotations 15.0", ...]
function parseDepsFromNoticeFile(path) {
    const noticeContent = fs.readFileSync(path).toString();
    const componentRegex = /\<summary\>\s*([a-zA-Z0-9\._\- \/]+) - ([a-zA-Z0-9\._\-\s]+)\s*\<\/summary\>/gm
    let captureGroups;
    const deps = [];
    while ((captureGroups = componentRegex.exec(noticeContent)) !== null) {
        deps.push(captureGroups[1]);
    }
    deps.sort();
    return deps;
}

function difference(from, to) {
    return from.filter(candidate => !to.includes(candidate));
}

const releaseDeps = parseReleaseDepsFromLockfile(lockfilePath);
const noticeDeps = parseDepsFromNoticeFile(noticePath);

const missingDeps = difference(releaseDeps, noticeDeps);
const extraneousDeps = difference(noticeDeps, releaseDeps);

let exitCode = 0;

if (extraneousDeps.length > 0) {
    console.error(`Error: extraneous deps found in ${noticePath} which aren't required by ${lockfilePath}:`);
    extraneousDeps.forEach(dep => console.error(`  "${dep}"`));
    exitCode = 1;
}
if (missingDeps.length > 0) {
    console.error(`Error: deps found in ${lockfilePath} but not ${noticePath}:`);
    missingDeps.forEach(dep => console.error(`  "${dep}"`));
    exitCode = 2;
}

if (exitCode !== 0) {
    console.log(`
Lockfile ${lockfilePath} does not match the NOTICE file at ${noticePath}.

The most likely issue is an outdated Component Governance Notice Config.

When a new dependency is added, you must go to the Component Governance
page for this repository in our private Azure DevOps project and adjust
the settings under "Notice > Configure" to check the box next to each new
non-dev dependency. Once you change the configuration there, you should be
able to re-run this build.

If that doesn't fix the problem, you can look over the generated NOTICE.html
file in the "terms" artifact to investigate further.`);
}

process.exit(exitCode);
