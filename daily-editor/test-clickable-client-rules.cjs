/**
 * 客户端可点规则回归：夹击半格错位 + 遮挡仅 layer+1 + 花色种类不受 31 限制
 * node daily-editor/test-clickable-client-rules.cjs
 */
const SolvableFill = require('./lib/solvable-fill.js');

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

console.log('\n=== 1. 左右夹击：abs(row)<2，非严格同行 ===');
{
    const tiles = [
        { id: 1, layer: 0, row: 0, col: 0 },
        { id: 2, layer: 0, row: 4, col: 0 },
        { id: 3, layer: 0, row: 1, col: -2 },
        { id: 4, layer: 0, row: -1, col: 2 },
    ];
    ok(!SolvableFill.isClickable(tiles[0], tiles), 'id=1 被 3/4 半格错位左右夹住，不可拿');
    ok(SolvableFill.isClickable(tiles[1], tiles), 'id=2 可拿');
    ok(SolvableFill.isClickable(tiles[2], tiles), 'id=3 可拿');
    ok(SolvableFill.isClickable(tiles[3], tiles), 'id=4 可拿');

    // 旧 bug 复现：seed=3 / maxRetries=1 曾产出 (1,4) 为首步且编辑器误判通过
    const badPath = [
        { id1: 1, id2: 4 },
        { id1: 3, id2: 2 },
    ];
    const assigned = { 1: 8, 2: 29, 3: 29, 4: 8 };
    const filled = tiles.map((t) => ({ ...t, typeId: assigned[t.id] }));
    const replay = SolvableFill.replaySolution(filled, badPath);
    ok(!replay.ok, '旧错误路径 (1,4) 必须验解失败：' + (replay.reason || ''));

    const gen = SolvableFill.generateSolvableTypeIds({ tiles }, { seed: 3, maxRetries: 40 });
    ok(gen.ok, '夹击盘面仍能生成可解花色');
    if (gen.ok) {
        const open = filled.map(() => null);
        const withIds = tiles.map((t, i) => ({ ...t, typeId: gen.assigned[i] }));
        const first = gen.solution[0];
        const clickable = withIds.filter((t) => SolvableFill.isClickable(t, withIds));
        ok(
            clickable.some((t) => t.id === first.id1) && clickable.some((t) => t.id === first.id2),
            `生成首步 (${first.id1},${first.id2}) 均在可点集合内`,
        );
        ok(!clickable.some((t) => t.id === 1) || (first.id1 !== 1 && first.id2 !== 1), '首步不会拿被夹住的 id=1');
        ok(SolvableFill.replaySolution(withIds, gen.solution).ok, '生成路径 replay 通过');
    }
}

console.log('\n=== 2. 上方遮挡：仅检查 layer+1（有支撑也会与「查所有上层」不同）===');
{
    const tiles = [
        { id: 1, layer: 0, row: 0, col: 0 },
        { id: 2, layer: 0, row: 0, col: 2 },
        { id: 3, layer: 1, row: 0, col: 2 },
        { id: 4, layer: 2, row: 0, col: 1 },
    ];
    // 旧「所有更高层」口径会认为 L2 压住 id=1；客户端只看 L1，id=1 可拿
    ok(SolvableFill.isClickable(tiles[0], tiles), '客户端口径：id=1 可拿（L2 不计入遮挡）');
    ok(!SolvableFill.isClickable(tiles[1], tiles), 'id=2 被 L1 正上方压住');
    ok(!SolvableFill.isClickable(tiles[2], tiles), 'id=3 被 L2 压住');
    ok(SolvableFill.isClickable(tiles[3], tiles), 'id=4 顶层可拿');

    // 该几何在「双可点同时消除」模型下结构无解（先消 1+4 后只剩 3 可点），此处不要求生成成功
    const gen = SolvableFill.generateSolvableTypeIds({ tiles }, { seed: 11, maxRetries: 20 });
    ok(!gen.ok, '结构无解盘面生成器应失败（与客户端遮挡口径一致）');

    // 可解遮挡样例：L1 只压住一张，另一张 L0 可配对
    const solvableCover = [
        { id: 1, layer: 0, row: 0, col: 0 },
        { id: 2, layer: 0, row: 0, col: 4 },
        { id: 3, layer: 1, row: 0, col: 0 },
        { id: 4, layer: 0, row: 4, col: 2 },
    ];
    ok(!SolvableFill.isClickable(solvableCover[0], solvableCover), 'id=1 被 L1 压住');
    ok(SolvableFill.isClickable(solvableCover[1], solvableCover), 'id=2 可拿');
    const genOk = SolvableFill.generateSolvableTypeIds({ tiles: solvableCover }, { seed: 5, maxRetries: 60 });
    ok(genOk.ok, '可解遮挡盘面可生成');
    if (genOk.ok) {
        const withIds = solvableCover.map((t, i) => ({ ...t, typeId: genOk.assigned[i] }));
        ok(SolvableFill.replaySolution(withIds, genOk.solution).ok, '可解遮挡路径 replay 通过');
    }
}

console.log('\n=== 3. 取消 31 花色上限：按 pairsPerSuit 推算种类 ===');
{
    ok(SolvableFill.computeTypeCount(106, 2) === 53, '106 对 / 每色 2 对 → 53 种');
    ok(SolvableFill.computeTypeCount(5, 2) === 3, '5 对 / 每色 2 对 → 3 种');

    // 20 张 = 10 对，pairsPerSuit=1 → 10 种
    const tiles = [];
    let id = 1;
    for (let i = 0; i < 10; i++) {
        tiles.push({ id: id++, layer: 0, row: 0, col: i * 2 });
        tiles.push({ id: id++, layer: 0, row: 4, col: i * 2 });
    }
    const gen = SolvableFill.generateSolvableTypeIds(
        { tiles },
        { seed: 21, maxRetries: 80, pairsPerSuit: 1 },
    );
    ok(gen.ok, 'pairsPerSuit=1 可生成');
    if (gen.ok) {
        ok(gen.typeCount === 10, `typeCount=10 实际=${gen.typeCount}`);
        ok(gen.pairsPerSuit === 1, 'pairsPerSuit 回传为 1');
        const withIds = tiles.map((t, i) => ({ ...t, typeId: gen.assigned[i] }));
        const kinds = new Set(withIds.map((t) => t.typeId));
        ok(kinds.size === 10, `实际使用 ${kinds.size} 种花色`);
        ok(SolvableFill.replaySolution(withIds, gen.solution).ok, '多花色路径 replay 通过');
    }

    // 超过 31 种：70 张 = 35 对，pairsPerSuit=1 → 35 种
    const big = [];
    id = 1;
    for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 5; c++) {
            big.push({ id: id++, layer: 0, row: r * 4, col: c * 2 });
            big.push({ id: id++, layer: 0, row: r * 4 + 2, col: c * 2 });
        }
    }
    ok(big.length === 70, '70 张牌布局');
    const genBig = SolvableFill.generateSolvableTypeIds(
        { tiles: big },
        { seed: 33, maxRetries: 120, pairsPerSuit: 1 },
    );
    ok(genBig.ok, '35 种花色可生成（突破 31）');
    if (genBig.ok) {
        ok(genBig.typeCount === 35, `typeCount=35 实际=${genBig.typeCount}`);
        const maxId = Math.max(...genBig.assigned);
        ok(maxId >= 32, `存在 typeId>=32（max=${maxId}）`);
        const withIds = big.map((t, i) => ({ ...t, typeId: genBig.assigned[i] }));
        ok(SolvableFill.replaySolution(withIds, genBig.solution).ok, '35 色路径 replay 通过');
    }
}

console.log('\n=== Summary ===');
console.log(`passed=${passed} failed=${failed}`);
if (failed) process.exitCode = 1;
