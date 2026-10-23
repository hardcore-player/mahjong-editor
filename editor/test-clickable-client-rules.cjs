/**
 * 客户端可点规则回归：夹击半格错位 + 遮挡仅 layer+1
 * node editor/test-clickable-client-rules.cjs
 */
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, 'generator.js'), 'utf8');
const sandbox = { console, Math, Array, Object, Number, String, Boolean, JSON, Set, Map, parseInt, isFinite };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(src, sandbox);
const GEN = sandbox.GEN;
if (!GEN || !GEN.isClickable) {
  console.error('GEN.isClickable missing');
  process.exit(1);
}

let passed = 0;
let failed = 0;
function ok(c, m) {
  if (c) {
    passed++;
    console.log('  OK  ' + m);
  } else {
    failed++;
    console.error('  FAIL  ' + m);
  }
}

console.log('\n=== 1. 左右夹击：abs(row)<2 ===');
{
  const tiles = [
    { id: 1, layer: 0, row: 0, col: 0 },
    { id: 2, layer: 0, row: 4, col: 0 },
    { id: 3, layer: 0, row: 1, col: -2 },
    { id: 4, layer: 0, row: -1, col: 2 },
  ];
  ok(!GEN.isClickable(tiles[0], tiles), 'id=1 被半格错位左右夹住');
  ok(GEN.isClickable(tiles[1], tiles), 'id=2 可拿');
  ok(GEN.isClickable(tiles[2], tiles), 'id=3 可拿');
  ok(GEN.isClickable(tiles[3], tiles), 'id=4 可拿');
}

console.log('\n=== 2. 上方遮挡：仅 layer+1 ===');
{
  const tiles = [
    { id: 1, layer: 0, row: 0, col: 0 },
    { id: 2, layer: 0, row: 0, col: 2 },
    { id: 3, layer: 1, row: 0, col: 2 },
    { id: 4, layer: 2, row: 0, col: 1 },
  ];
  ok(GEN.isClickable(tiles[0], tiles), 'id=1 可拿（L2 不计入遮挡）');
  ok(!GEN.isClickable(tiles[1], tiles), 'id=2 被 L1 压住');
  ok(!GEN.isClickable(tiles[2], tiles), 'id=3 被 L2 压住');
  ok(GEN.isClickable(tiles[3], tiles), 'id=4 顶层可拿');
  ok(GEN.covers(tiles[3], tiles[2]), 'covers(L2,L1) 成立');
  ok(!GEN.covers(tiles[3], tiles[0]), 'covers(L2,L0) 不成立');
}

console.log('\n=== 3. reshufflePlayLevel 生成后用客户端口径验解 ===');
{
  const tmpl = GEN.TEMPLATE_T2_GONG;
  const tiles = tmpl.tiles.map(function (t) {
    return { id: t.id, layer: t.layer, row: t.row, col: t.col };
  });
  let accepted = null;
  for (let k = 0; k < 60 && !accepted; k++) {
    const level = { tiles: tiles.map(function (t) { return Object.assign({}, t); }) };
    const out = GEN.reshufflePlayLevel(level, k, GEN.makeRng(50 + k));
    if (out && out.solution) accepted = out;
  }
  ok(!!accepted, '模板布局能 reshuffle 并客户端验解通过');
  if (accepted) {
    const again = GEN.verifySolution(accepted.tiles, accepted.solution);
    ok(again.ok, '二次 verifySolution 通过');
  }
}

console.log('\n=== Summary ===');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) process.exitCode = 1;
