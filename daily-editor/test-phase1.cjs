/**
 * 每日高难关卡编辑器测试
 * node daily-editor/test-phase1.cjs
 */
const fs = require('fs');
const path = require('path');
const LevelDocument = require('./lib/level-document.js');
const { autoAssignTypeIds } = require('./lib/auto-assign.js');
const { validateLevel } = require('./lib/validation.cjs');

const LEVELS = path.join(__dirname, '../../mj-client/assets/resources/levels');
const EDITOR_INDEX = path.join(__dirname, '../editor/index.html');
const DAILY_INDEX = path.join(__dirname, 'index.html');
const FACES = path.join(__dirname, 'assets/tile-faces');

let passed = 0;
let failed = 0;

function ok(c, m) {
    if (c) { passed++; console.log('  OK  ' + m); }
    else { failed++; console.error('  FAIL  ' + m); }
}

function loadLevel(name) {
    return JSON.parse(fs.readFileSync(path.join(LEVELS, name), 'utf8'));
}

function snapshotDoc(doc) {
    return JSON.stringify({
        raw: doc.raw,
        edited: [...doc.editedById.entries()],
        added: doc.addedTiles,
        deleted: [...doc.deletedIds],
        dirty: doc.dirty,
    });
}

console.log('\n=== 1. 普通关可以导入 ===');
{
    const raw = loadLevel('level_01.json');
    ok(LevelDocument.checkImportAllowed(raw).ok, 'level_01 import allowed');
    const doc = LevelDocument.fromJson(raw);
    ok((doc.exportJson().tiles || []).length > 0, 'level_01 export has tiles');
}

console.log('\n=== 2. 普通+暗牌关可以导入 ===');
{
    const raw = loadLevel('level_48.json');
    ok(LevelDocument.checkImportAllowed(raw).ok, 'level_48 import allowed');
    const doc = LevelDocument.fromJson(raw);
    const exp = doc.exportJson();
    ok((exp.specialTiles || []).some((s) => s.type === 'dark'), 'level_48 has dark specialTiles');
    ok((exp.tiles || []).some((t) => t.isDark), 'level_48 tiles isDark synced');
}

console.log('\n=== 3～6. 特殊机制拒绝且草稿不变 ===');
{
    const draft = LevelDocument.fromJson({
        levelId: 90001,
        totalPairs: 1,
        tiles: [{ id: 1, layer: 0, row: 0, col: 0, typeId: 1, isDark: false }],
        specialTiles: [],
        discs: [],
        rotation: null,
    });
    const before = snapshotDoc(draft);
    const layersBefore = JSON.stringify(draft.buildEditableLayers());

    for (const [file, tag] of [
        ['level_131.json', 'spitter'],
        ['level_120.json', 'discs'],
        ['level_110.json', 'rotation'],
    ]) {
        const raw = loadLevel(file);
        const check = LevelDocument.checkImportAllowed(raw);
        ok(!check.ok, `${file} rejected (${tag})`);
        ok(check.message.includes('每日高难关卡'), `${file} message clear`);
        ok(LevelDocument.tryFromJson(raw).ok === false, `${file} tryFromJson fails`);
    }

    const unknown = loadLevel('level_01.json');
    unknown.specialTiles = [{ id: 1, type: 'hook', layer: 0, row: 0, col: 0 }];
    ok(!LevelDocument.checkImportAllowed(unknown).ok, 'unknown special rejected');

    ok(snapshotDoc(draft) === before, 'draft doc unchanged after rejects');
    ok(JSON.stringify(draft.buildEditableLayers()) === layersBefore, 'draft layers unchanged');
}

console.log('\n=== 7. 暗牌编辑同步 ===');
{
    const doc = LevelDocument.fromJson(loadLevel('level_01.json'));
    const layers = doc.buildEditableLayers();
    const l0 = layers[0];
    const key = Object.keys(l0.tiles)[0];
    const docId = l0.tiles[key]._docId;

    l0.tiles[key].type = 'dark';
    doc.mergeEditableFromLayers(layers);
    doc.markDirty();
    let exp = doc.exportJson();
    ok(exp.tiles.find((t) => t.id === docId)?.isDark, 'normal→dark isDark');
    ok(exp.specialTiles.some((s) => s.id === docId && s.type === 'dark'), 'normal→dark specialTiles');

    l0.tiles[key].type = 'normal';
    doc.mergeEditableFromLayers(layers);
    exp = doc.exportJson();
    ok(!exp.tiles.find((t) => t.id === docId)?.isDark, 'dark→normal isDark false');
    ok(!exp.specialTiles.some((s) => s.id === docId), 'dark→normal removes specialTiles');

    const [row, col] = key.split(',').map(Number);
    delete l0.tiles[key];
    const newKey = `${row},${col + 2}`;
    l0.tiles[newKey] = { type: 'dark', typeId: 5, _docId: docId };
    doc.mergeEditableFromLayers(layers);
    exp = doc.exportJson();
    const moved = exp.specialTiles.find((s) => s.id === docId);
    ok(moved && moved.col === col + 2, 'move dark syncs specialTiles col');

    delete l0.tiles[newKey];
    doc.mergeEditableFromLayers(layers);
    exp = doc.exportJson();
    ok(!exp.tiles.some((t) => t.id === docId), 'delete removes tile');
    ok(!exp.specialTiles.some((s) => s.id === docId), 'delete removes dark record');

    const docUndo = LevelDocument.fromJson(loadLevel('level_01.json'));
    const layersA = docUndo.buildEditableLayers();
    const undoKey = Object.keys(layersA[0].tiles)[0];
    const undoId = layersA[0].tiles[undoKey]._docId;
    const snapBefore = snapshotDoc(docUndo);

    layersA[0].tiles[undoKey].type = 'dark';
    docUndo.mergeEditableFromLayers(layersA);
    ok(docUndo.exportJson().specialTiles.some((s) => s.id === undoId), 'edit dark applied');

    const snapAfter = snapshotDoc(docUndo);
    ok(snapBefore !== snapAfter, 'edit changes doc snapshot');

    const restored = JSON.parse(snapBefore);
    docUndo.editedById = new Map(restored.edited);
    docUndo.addedTiles = restored.added;
    docUndo.deletedIds = new Set(restored.deleted);
    docUndo.dirty = restored.dirty;
    ok(!docUndo.exportJson().specialTiles.some((s) => s.id === undoId), 'undo restores no dark');

    const redo = JSON.parse(snapAfter);
    docUndo.editedById = new Map(redo.edited);
    docUndo.addedTiles = redo.added;
    docUndo.deletedIds = new Set(redo.deleted);
    docUndo.dirty = redo.dirty;
    ok(docUndo.exportJson().specialTiles.some((s) => s.id === undoId), 'redo restores dark');
}

console.log('\n=== 8. 导出仅含普通牌与 dark ===');
{
    const doc = LevelDocument.fromJson(loadLevel('level_48.json'));
    const exp = doc.exportJson();
    ok(!(exp.tiles || []).some((t) => t.type === 'spitter' || typeof t.spitterOrder === 'number'), 'no spitter');
    ok((exp.discs || []).length === 0, 'discs empty');
    ok(exp.rotation == null, 'rotation null');
    ok((exp.specialTiles || []).every((s) => s.type === 'dark'), 'specialTiles only dark');
    ok(LevelDocument.validateDailyExport(exp).ok, 'validateDailyExport ok');
}

console.log('\n=== 9. L0～L30 ===');
{
    const doc = LevelDocument.fromJson({
        levelId: 90002,
        totalPairs: 0,
        tiles: [],
        specialTiles: [],
        discs: [],
        rotation: null,
    });
    const layers = [];
    for (let i = 0; i <= 30; i++) layers.push({ tiles: {} });
    layers[30].tiles['0,0'] = { type: 'normal', typeId: 1 };
    doc.mergeEditableFromLayers(layers);
    const exp = doc.exportJson();
    ok(exp.tiles.some((t) => t.layer === 30), 'L30 tile exported');
}

console.log('\n=== 10. 31 张正式牌面 ===');
{
    for (let i = 1; i <= 31; i++) {
        const f = path.join(FACES, `${String(i).padStart(2, '0')}.png`);
        ok(fs.existsSync(f) && fs.statSync(f).size > 100, `${String(i).padStart(2, '0')}.png`);
    }
    ok(LevelDocument.normalizeFaceId(1) === 1, 'faceId 1');
    ok(LevelDocument.normalizeFaceId(32) === 1, 'faceId wrap 32→1');
}

console.log('\n=== 导出/再导入暗牌保持 ===');
{
    const doc = LevelDocument.fromJson(loadLevel('level_48.json'));
    const exp = doc.exportJson();
    const doc2 = LevelDocument.fromJson(exp);
    ok(LevelDocument.semanticEqual(exp, doc2.exportJson()), 'round-trip semantic equal');
}

console.log('\n=== 校验规则 ===');
{
    const raw = loadLevel('level_48.json');
    autoAssignTypeIds(raw, { typeKindCount: 16, seed: 1 });
    for (const t of raw.tiles) {
        if (t.typeId > 31) t.typeId = ((t.typeId - 1) % 31) + 1;
    }
    raw.totalPairs = LevelDocument.computeTotalPairs(raw);
    LevelDocument.normalizeImportJson(raw);
    const good = validateLevel(raw, true);
    ok(good.ok, 'level_48 validates after normalize typeIds');

    const bad = validateLevel({ levelId: 1, totalPairs: 1, tiles: [{ id: 1, layer: 0, row: 0, col: 0, typeId: 1 }] }, true);
    ok(!bad.ok, 'odd count fails');
}

console.log('\n=== 旧 /editor/ 未破坏 ===');
{
    ok(fs.existsSync(EDITOR_INDEX), 'editor/index.html exists');
    const old = fs.readFileSync(EDITOR_INDEX, 'utf8');
    ok(!old.includes('daily-editor-patch.js'), 'old editor has no daily patch');
    ok(fs.existsSync(DAILY_INDEX), 'daily-editor/index.html exists');
    const daily = fs.readFileSync(DAILY_INDEX, 'utf8');
    ok(daily.includes('daily-editor-patch.js'), 'daily has patch');
    ok(daily.includes('auto-assign.js'), 'daily has auto-assign');
}

console.log('\n=== Summary ===');
console.log(`passed=${passed} failed=${failed}`);
if (failed) process.exitCode = 1;
