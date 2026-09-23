/**
 * mergeEditableFromLayers 幂等 + 统计/导出回归
 * node daily-editor/test-daily-merge-stats-quick.cjs
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const LevelDocument = require('./lib/level-document.js');
const { resolvePlaywrightModule, launchChromeBrowser } = require('./lib/playwright-chrome-launch.cjs');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.MERGE_TEST_PORT) || 9014;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.json': 'application/json; charset=utf-8',
};

function createStaticServer() {
    return http.createServer((req, res) => {
        let u;
        try { u = decodeURIComponent(req.url.split('?')[0]); } catch (_) {
            res.writeHead(400); res.end(); return;
        }
        if (u === '/') u = '/index.html';
        const fp = path.join(ROOT, u.replace(/^\//, '').split('/').join(path.sep));
        if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
        const serveFile = (filePath) => {
            fs.readFile(filePath, (err, data) => {
                if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not Found'); return; }
                const ext = path.extname(filePath).toLowerCase();
                res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
                res.end(data);
            });
        };
        fs.stat(fp, (err, st) => {
            if (!err && st.isDirectory()) {
                serveFile(path.join(fp, 'index.html'));
                return;
            }
            if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not Found'); return; }
            serveFile(fp);
        });
    });
}

function buildBlankLayers(cells) {
    const layerMap = new Map();
    for (const { layer, row, col, type, typeId, docId } of cells) {
        if (!layerMap.has(layer)) layerMap.set(layer, { tiles: {}, stacks: {} });
        const key = `${row},${col}`;
        const cell = { type: type || 'normal', typeId: typeId ?? null };
        if (docId != null) cell._docId = docId;
        layerMap.get(layer).tiles[key] = cell;
    }
    const max = Math.max(...layerMap.keys(), 0);
    const layers = [];
    for (let i = 0; i <= max; i++) layers.push(layerMap.get(i) || { tiles: {}, stacks: {} });
    return layers;
}

let passed = 0;
let failed = 0;

function ok(c, m) {
    if (c) { passed++; console.log('  OK  ' + m); }
    else { failed++; console.error('  FAIL  ' + m); }
}

console.log('\n=== Node: merge idempotency (blank 4 tiles) ===');
{
    const doc = LevelDocument.fromJson({
        levelId: 91001, totalPairs: 0, tiles: [], specialTiles: [], discs: [], rotation: null,
    });
    const layers = buildBlankLayers([
        { layer: 0, row: 0, col: -3 },
        { layer: 0, row: 0, col: -1 },
        { layer: 0, row: 0, col: 1 },
        { layer: 0, row: 0, col: 3 },
    ]);

    doc.mergeEditableFromLayers(layers);
    const snap1 = JSON.stringify({
        added: doc.addedTiles.length,
        edited: doc.editedById.size,
        exportN: doc.exportJson().tiles.length,
        ids: doc.exportJson().tiles.map((t) => t.id).sort((a, b) => a - b),
    });

    for (let i = 0; i < 5; i++) doc.mergeEditableFromLayers(layers);
    const snap2 = JSON.stringify({
        added: doc.addedTiles.length,
        edited: doc.editedById.size,
        exportN: doc.exportJson().tiles.length,
        ids: doc.exportJson().tiles.map((t) => t.id).sort((a, b) => a - b),
    });

    ok(snap1 === snap2, '5x repeat merge unchanged doc/export');
    ok(doc.addedTiles.length === 4, `addedTiles stays 4 (${doc.addedTiles.length})`);
    ok(doc.editedById.size === 0, `raw edits empty (${doc.editedById.size})`);
    ok(doc.getStats().totalTiles === 4, `getStats totalTiles=4 (${doc.getStats().totalTiles})`);

    layers[0].tiles['0,-3']._docId = doc.addedTiles[0].id;
    layers[0].tiles['0,-1']._docId = doc.addedTiles[1].id;
    layers[0].tiles['0,1']._docId = doc.addedTiles[2].id;
    layers[0].tiles['0,3']._docId = doc.addedTiles[3].id;
    for (let i = 0; i < 3; i++) doc.mergeEditableFromLayers(layers);
    ok(doc.addedTiles.length === 4, 'with _docId repeat merge keeps 4 added');
    ok(doc.editedById.size === 0, 'added _docId not moved to editedById');
    ok(doc.exportJson().tiles.length === 4, 'export still 4 after _docId merges');
}

console.log('\n=== Node: 624 tiles / 13 layers ===');
{
    const doc = LevelDocument.fromJson({
        levelId: 91002, totalPairs: 0, tiles: [], specialTiles: [], discs: [], rotation: null,
    });
    const cells = [];
    let n = 0;
    outer: for (let layer = 0; layer < 13; layer++) {
        for (let row = -8; row <= 6; row += 2) {
            for (let col = -5; col <= 5; col += 2) {
                if (n >= 624) break outer;
                cells.push({ layer, row, col, type: n % 5 === 0 ? 'dark' : 'normal' });
                n++;
            }
        }
    }
    const layers = buildBlankLayers(cells);
    doc.mergeEditableFromLayers(layers);
    const ids1 = doc.exportJson().tiles.map((t) => t.id);
    for (let i = 0; i < 3; i++) doc.mergeEditableFromLayers(layers);
    const st = doc.getStats();
    const ids2 = doc.exportJson().tiles.map((t) => t.id);
    ok(st.totalTiles === 624, `624 layout stats totalTiles=${st.totalTiles}`);
    ok(st.layerCount === 13, `624 layout layerCount=${st.layerCount}`);
    ok(st.darkCount > 0, `624 layout darkCount=${st.darkCount}`);
    ok(JSON.stringify(ids1) === JSON.stringify(ids2), '624 layout ids stable across merges');
}

console.log('\n=== Node: delete added tile ===');
{
    const doc = LevelDocument.fromJson({
        levelId: 91003, totalPairs: 0, tiles: [], specialTiles: [], discs: [], rotation: null,
    });
    let layers = buildBlankLayers([
        { layer: 0, row: 0, col: -1 },
        { layer: 0, row: 0, col: 1 },
        { layer: 0, row: 0, col: 3 },
    ]);
    doc.mergeEditableFromLayers(layers);
    ok(doc.exportJson().tiles.length === 3, 'start 3 tiles');

    layers = buildBlankLayers([
        { layer: 0, row: 0, col: -1, docId: doc.addedTiles[0].id },
        { layer: 0, row: 0, col: 1, docId: doc.addedTiles[1].id },
    ]);
    doc.mergeEditableFromLayers(layers);
    ok(doc.addedTiles.length === 2, 'delete one from addedTiles');
    ok(doc.exportJson().tiles.length === 2, 'export 2 after delete');
    ok(doc.getStats().totalTiles === 2, 'stats 2 after delete');
}

async function runBrowserTests() {
    console.log('\n=== Browser: generate + repeat merge/stats + export roundtrip ===');
    const srv = createStaticServer();
    await new Promise((r) => srv.listen(PORT, r));
    const base = `http://127.0.0.1:${PORT}`;

    const { mod: pw } = resolvePlaywrightModule();
    const { browser } = await launchChromeBrowser(pw, { headless: true });
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('PAGEERR', e.message));

    await page.goto(`${base}/daily-editor/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof loadFromEditorJSON === 'function');

    const flow = await page.evaluate(() => {
        localStorage.removeItem('mjDailyEditor.v1');
        loadFromEditorJSON({
            levelId: 91010, totalPairs: 0, tiles: [], specialTiles: [], discs: [], rotation: null,
        });
        state.symmetric = false;
        state.snapToSupport = false;
        state.brush = 'dark';
        state.paintMode = 'add';
        paintAt(-3, 0);
        state.brush = 'normal';
        paintAt(-1, 0);
        paintAt(1, 0);
        paintAt(3, 0);

        window.__runGenerateSolvable();

        const doc = window.__getLevelDocument();
        const statsRuns = [];
        for (let i = 0; i < 3; i++) {
            doc.mergeEditableFromLayers(state.layers);
            statsRuns.push(doc.getStats());
        }

        const export1 = doc.exportJson();
        const ids = export1.tiles.map((t) => t.id).sort((a, b) => a - b);
        const uniqueIds = new Set(ids).size;

        loadFromEditorJSON(export1);
        const export2 = window.__getLevelDocument().exportJson();

        const key = Object.keys(state.layers[0].tiles)[0];
        delete state.layers[0].tiles[key];
        doc.mergeEditableFromLayers(state.layers);
        const afterDel = doc.getStats();
        const export3 = doc.exportJson();

        return {
            statsRuns,
            ids,
            uniqueIds,
            export1N: export1.tiles.length,
            export2N: export2.tiles.length,
            afterDelTiles: afterDel.totalTiles,
            export3N: export3.tiles.length,
            darkCount: statsRuns[0].darkCount,
        };
    });

    ok(flow.statsRuns.every((s) => s.totalTiles === 4), '3x merge/stats each show 4 tiles');
    ok(flow.statsRuns.every((s) => s.totalPairs === 2), '3x merge/stats each show 2 pairs');
    ok(flow.statsRuns.every((s) => s.layerCount === 1), 'layer count 1');
    ok(flow.darkCount === 1, `dark count 1 (${flow.darkCount})`);
    ok(flow.uniqueIds === 4, `4 unique ids (${flow.uniqueIds})`);
    ok(flow.export1N === 4, `export 4 tiles (${flow.export1N})`);
    ok(flow.export2N === 4, `reimport export 4 tiles (${flow.export2N})`);
    ok(flow.afterDelTiles === 3, `after delete stats 3 (${flow.afterDelTiles})`);
    ok(flow.export3N === 3, `after delete export 3 (${flow.export3N})`);

    await browser.close();
    srv.close();
}

(async () => {
    try {
        await runBrowserTests();
    } catch (e) {
        failed++;
        console.error('  FAIL  browser tests:', e.message);
    }
    console.log(`\n=== ${passed} passed, ${failed} failed ===`);
    process.exit(failed ? 1 : 0);
})();
