/**
 * backwardFill + replay 单元测试
 * node daily-editor/test-solvable-fill.cjs
 */
const path = require('path');
const LevelDocument = require('./lib/level-document.js');
const SolvableFill = require('./lib/solvable-fill.js');

let passed = 0;
let failed = 0;

function ok(c, m) {
    if (c) { passed++; console.log('  OK  ' + m); }
    else { failed++; console.error('  FAIL  ' + m); }
}

console.log('\n=== solvable-fill: odd count blocked ===');
{
    const r = SolvableFill.generateSolvableTypeIds({
        tiles: [{ id: 1, layer: 0, row: 0, col: 0, typeId: null }],
    });
    ok(!r.ok && /奇数/.test(r.error), 'odd count error');
}

console.log('\n=== solvable-fill: even layout generates ===');
{
    const tiles = [
        { id: 1, layer: 0, row: 0, col: 0, typeId: null },
        { id: 2, layer: 0, row: 0, col: 2, typeId: null },
        { id: 3, layer: 0, row: 0, col: 4, typeId: null },
        { id: 4, layer: 0, row: 0, col: 6, typeId: null },
    ];
    const fpBefore = SolvableFill.computeLayoutFingerprint(tiles);
    const r = SolvableFill.generateSolvableTypeIds({ tiles }, { seed: 42 });
    ok(r.ok, 'generation ok');
    ok(r.status === 'verified', 'status verified');
    ok(SolvableFill.allTypeCountsEven(tiles.map((t, i) => ({ ...t, typeId: r.assigned[i] }))), 'even type counts');
    const fpAfter = SolvableFill.computeLayoutFingerprint(
        tiles.map((t, i) => ({ ...t, typeId: r.assigned[i] })),
    );
    ok(fpBefore === fpAfter, 'layout fingerprint unchanged');
    const filled = tiles.map((t, i) => ({ ...t, typeId: r.assigned[i] }));
    ok(SolvableFill.replaySolution(filled, r.solution).ok, 'replay passes');
}

console.log('\n=== solvable-fill: dark tiles ===');
{
    const tiles = [
        { id: 1, layer: 0, row: 0, col: 0, typeId: null, isDark: true },
        { id: 2, layer: 0, row: 0, col: 2, typeId: null, isDark: false },
        { id: 3, layer: 0, row: 0, col: 4, typeId: null, isDark: true },
        { id: 4, layer: 0, row: 0, col: 6, typeId: null, isDark: false },
    ];
    const r = SolvableFill.generateSolvableTypeIds({ tiles }, { seed: 7 });
    ok(r.ok, 'dark layout generates');
    const filled = tiles.map((t, i) => ({ ...t, typeId: r.assigned[i] }));
    ok(SolvableFill.replaySolution(filled, r.solution).ok, 'dark replay passes');
}

console.log('\n=== solvable-fill: import verify ===');
{
    const layout = [
        { id: 1, layer: 0, row: 0, col: 0, typeId: null },
        { id: 2, layer: 0, row: 0, col: 2, typeId: null },
        { id: 3, layer: 0, row: 0, col: 4, typeId: null },
        { id: 4, layer: 0, row: 0, col: 6, typeId: null },
    ];
    const gen = SolvableFill.generateSolvableTypeIds({ tiles: layout }, { seed: 99 });
    ok(gen.ok, 'fixture generated');
    const level = {
        levelId: 80001,
        totalPairs: 2,
        tiles: layout.map((t, i) => ({ ...t, typeId: gen.assigned[i] })),
        specialTiles: [],
        discs: [],
        rotation: null,
    };
    const v = SolvableFill.verifyImportedLevel(level);
    ok(v.ok, 'complete import verified');
    ok(v.preserved, 'preserved import');
    ok(v.solution?.length > 0, 'has solution');
}

console.log('\n=== Summary ===');
console.log(`passed=${passed} failed=${failed}`);
if (failed) process.exitCode = 1;
