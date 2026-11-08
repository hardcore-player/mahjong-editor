/**
 * 可点 / 卡槽验解回归
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
if (!GEN || !GEN.isClickable || !GEN.verifySolution) {
  console.error('GEN.isClickable / verifySolution missing');
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

console.log('\n=== 2. 上方遮挡：任意更高层重叠即压住 ===');
{
  const tiles = [
    { id: 1, layer: 0, row: 0, col: 0 },
    { id: 2, layer: 0, row: 0, col: 2 },
    { id: 3, layer: 1, row: 0, col: 2 },
    { id: 4, layer: 2, row: 0, col: 1 },
  ];
  ok(!GEN.isClickable(tiles[0], tiles), 'id=1 被 L2 压一点也算压住');
  ok(!GEN.isClickable(tiles[1], tiles), 'id=2 被 L1 压住');
  ok(!GEN.isClickable(tiles[2], tiles), 'id=3 被 L2 压住');
  ok(GEN.isClickable(tiles[3], tiles), 'id=4 顶层可拿');
  ok(GEN.covers(tiles[3], tiles[2]), 'covers(L2,L1) 成立');
  ok(GEN.covers(tiles[3], tiles[0]), 'covers(L2,L0) 成立（跨层也算）');
}

console.log('\n=== 3. reshufflePlayLevel 验解 ===');
{
  const tmpl = GEN.TEMPLATE_T2_GONG;
  const tiles = tmpl.tiles.map(function (t) {
    return { id: t.id, layer: t.layer, row: t.row, col: t.col };
  });
  let accepted = null;
  for (let k = 0; k < 120 && !accepted; k++) {
    const level = { tiles: tiles.map(function (t) { return Object.assign({}, t); }) };
    const out = GEN.reshufflePlayLevel(level, k, GEN.makeRng(50 + k));
    if (out && out.solution) accepted = out;
  }
  ok(!!accepted, '模板布局能 reshuffle 并验解通过');
  if (accepted) {
    const again = GEN.verifySolution(accepted.tiles, accepted.solution);
    ok(again.ok, '二次 verifySolution 通过');
  }
}

console.log('\n=== 4. 四格槽：满 4 张不同花色立即失败 ===');
{
  // 8 张全可拿，花色 A B C D A B C D —— 第 4 步 D 入槽应失败
  const tilesAbcd = [];
  const suits = [1, 2, 3, 4, 1, 2, 3, 4];
  for (let i = 0; i < 8; i++) {
    tilesAbcd.push({ id: i + 1, layer: 0, row: 0, col: i * 2, typeId: suits[i] });
  }
  const badSteps = tilesAbcd.map(function (t) {
    return { action: 'pick', tileId: t.id };
  });
  const bad = GEN.verifySolution(tilesAbcd, {
    version: 1,
    slotCapacity: 4,
    usesProps: false,
    steps: badSteps,
  });
  ok(!bad.ok, 'A,B,C,D… 路径必须失败：' + (bad.reason || ''));
  ok(/卡槽已满/.test(bad.reason || ''), '失败原因提到卡槽已满');

  // A,B,C,A —— 第 4 张配对，应允许继续（再补齐其余配对步骤）
  const tilesAbca = [
    { id: 1, layer: 0, row: 0, col: 0, typeId: 1 },
    { id: 2, layer: 0, row: 0, col: 2, typeId: 2 },
    { id: 3, layer: 0, row: 0, col: 4, typeId: 3 },
    { id: 4, layer: 0, row: 0, col: 6, typeId: 1 },
    { id: 5, layer: 0, row: 4, col: 0, typeId: 2 },
    { id: 6, layer: 0, row: 4, col: 2, typeId: 3 },
  ];
  const goodSteps = [
    { action: 'pick', tileId: 1 },
    { action: 'pick', tileId: 2 },
    { action: 'pick', tileId: 3 },
    { action: 'pick', tileId: 4 }, // 与槽内 A 配对
    { action: 'pick', tileId: 5 },
    { action: 'pick', tileId: 6 },
  ];
  const good = GEN.verifySolution(tilesAbca, {
    version: 1,
    slotCapacity: 4,
    usesProps: false,
    steps: goodSteps,
  });
  ok(good.ok, 'A,B,C,A 第 4 张配对路径应通过');
}

console.log('\n=== Summary ===');
console.log('passed=' + passed + ' failed=' + failed);
if (failed) process.exitCode = 1;
