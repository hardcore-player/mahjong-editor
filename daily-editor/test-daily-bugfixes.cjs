/**
 * Bug 1（生成可解花色不清布局）+ Bug 2（指示框/落牌对齐）Playwright 验收
 * node daily-editor/test-daily-bugfixes.cjs
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { resolvePlaywrightModule, launchChromeBrowser } = require('./lib/playwright-chrome-launch.cjs');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.BUGFIX_TEST_PORT) || 9012;
const SHOTS = path.join(__dirname, 'screenshots-bugfix');

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

/** 20 张牌 L0～L5（6 层），含暗牌 */
function buildLayout20() {
    const tiles = [];
    const specialTiles = [];
    let id = 1;
    const cols = [-3, -1, 1, 3];
    const layerCounts = [4, 4, 4, 4, 3, 1];
    for (let layer = 0; layer <= 5; layer++) {
        for (let i = 0; i < layerCounts[layer]; i++) {
            const col = cols[i];
            const row = 0;
            const isDark = layer >= 2 && i < 2;
            tiles.push({ id, layer, row, col, typeId: null, isDark });
            if (isDark) specialTiles.push({ type: 'dark', id, layer, row, col });
            id++;
        }
    }
    return {
        levelId: 90100,
        totalPairs: 10,
        tiles,
        specialTiles,
        discs: [],
        rotation: null,
    };
}

/** 移动鼠标到半格放置坐标 (row,col) 的子格中心（非 2×2 视觉中心） */
async function moveMouseToGridCell(page, row, col, layerIdx) {
    await page.evaluate(({ row, col, layerIdx }) => {
        const c = window.__getGridCellScreenPoint(row, col, layerIdx);
        const s = window.__worldToScreen(c.wx, c.wy);
        const canvas = document.getElementById('canvas');
        const rect = canvas.getBoundingClientRect();
        canvas.dispatchEvent(new MouseEvent('mousemove', {
            clientX: rect.left + s.x,
            clientY: rect.top + s.y,
            bubbles: true,
        }));
    }, { row, col, layerIdx });
    await page.waitForTimeout(20);
}

async function runBug1Tests(page, ok) {
    const layout = buildLayout20();

    await page.evaluate(() => {
        localStorage.removeItem('mjDailyEditor.v1');
        window.__setGenerateTestHook(null);
    });
    await page.evaluate((l) => loadFromEditorJSON(l), layout);

    const before = await page.evaluate(() => ({
        geo: window.__captureGeometrySignature(),
        count: window.__countBoardTiles(),
        types: window.__captureTypeIdMap(),
        darkCount: JSON.parse(window.__captureGeometrySignature()).filter((t) => t.isDark).length,
    }));

    await ok(before.count === 20, `Bug1: 20 tiles placed (${before.count})`);
    await ok(before.darkCount >= 4, `Bug1: dark tiles preserved (${before.darkCount})`);

    const gen = await page.evaluate(() => {
        const geoBefore = window.__captureGeometrySignature();
        const typeBefore = window.__captureTypeIdMap();
        window.__runGenerateSolvable();
        const geoAfter = window.__captureGeometrySignature();
        const typeAfter = window.__captureTypeIdMap();
        const status = window.__getSolvableState().status;
        const idsSame = Object.keys(typeBefore).every((id) => {
            const tiles = JSON.parse(geoAfter);
            return tiles.some((t) => String(t.id) === id);
        });
        const typeChanged = Object.keys(typeAfter).some((id) => typeAfter[id] !== typeBefore[id]);
        return { geoBefore, geoAfter, status, idsSame, typeChanged, count: window.__countBoardTiles() };
    });

    await ok(gen.geoBefore === gen.geoAfter, 'Bug1: geometry unchanged after generate');
    await ok(gen.count === 20, `Bug1: tile count still 20 (${gen.count})`);
    await ok(gen.status === 'verified', `Bug1: solvable verified (${gen.status})`);
    await ok(gen.idsSame, 'Bug1: all tile ids preserved');
    await ok(gen.typeChanged, 'Bug1: typeIds changed');

    const undoRedo = await page.evaluate(() => {
        const geo0 = window.__captureGeometrySignature();
        const typesAfterGen = window.__captureTypeIdMap();
        undo();
        const geo1 = window.__captureGeometrySignature();
        const typesUndone = window.__captureTypeIdMap();
        redo();
        const geo2 = window.__captureGeometrySignature();
        const typesRedone = window.__captureTypeIdMap();
        const geoOk = geo0 === geo1 && geo1 === geo2;
        const typeUndoDiff = Object.keys(typesAfterGen).some((id) => typesUndone[id] !== typesAfterGen[id]);
        const typeRedoMatch = Object.keys(typesAfterGen).every((id) => typesRedone[id] === typesAfterGen[id]);
        return { geoOk, typeUndoDiff, typeRedoMatch };
    });

    await ok(undoRedo.geoOk, 'Bug1: undo/redo geometry unchanged');
    await ok(undoRedo.typeUndoDiff, 'Bug1: undo restores old typeIds');
    await ok(undoRedo.typeRedoMatch, 'Bug1: redo restores new typeIds');

    const rollbackThrow = await page.evaluate(() => {
        const geoBefore = window.__captureGeometrySignature();
        const countBefore = window.__countBoardTiles();
        const orig = DailySolvableFill.planTypeAssignments;
        DailySolvableFill.planTypeAssignments = () => { throw new Error('simulated failure'); };
        window.__runGenerateSolvable();
        DailySolvableFill.planTypeAssignments = orig;
        return {
            geoRestored: window.__captureGeometrySignature() === geoBefore,
            countRestored: window.__countBoardTiles() === countBefore,
        };
    });
    await ok(rollbackThrow.geoRestored, 'Bug1: exception rollback restores geometry');
    await ok(rollbackThrow.countRestored, 'Bug1: exception rollback restores count');

    const rollbackCorrupt = await page.evaluate(() => {
        const geoBefore = window.__captureGeometrySignature();
        window.__setGenerateTestHook(() => {
            delete state.layers[0].tiles[Object.keys(state.layers[0].tiles)[0]];
        });
        window.__runGenerateSolvable();
        window.__setGenerateTestHook(null);
        return {
            geoRestored: window.__captureGeometrySignature() === geoBefore,
            count: window.__countBoardTiles(),
        };
    });
    await ok(rollbackCorrupt.geoRestored, 'Bug1: corrupt hook rollback restores geometry');
    await ok(rollbackCorrupt.count === 20, `Bug1: corrupt hook count restored (${rollbackCorrupt.count})`);
}

async function testAlignmentAtLayer(page, ok, layerIdx, opts = {}) {
    const { scale = 1, panDelta = null, showAll = true, brush = 'normal' } = opts;
    const row = 0;
    const col = -3;

    await page.evaluate(({ layerIdx, scale, panDelta, showAll, brush, row, col }) => {
        localStorage.removeItem('mjDailyEditor.v1');
        loadFromEditorJSON({
            levelId: 90200 + layerIdx,
            totalPairs: 0,
            tiles: [],
            specialTiles: [],
            discs: [],
            rotation: null,
        });
        window.__ensureLayers(layerIdx);
        window.__setShowAll(showAll);
        state.symmetric = false;
        state.snapToSupport = false;
        state.paintMode = 'add';
        for (let l = 0; l < layerIdx; l++) {
            window.__setCurrentLayer(l);
            state.brush = 'normal';
            paintAt(col, row);
        }
        window.__setCurrentLayer(layerIdx);
        state.brush = brush;
        window.__centerViewOnCell(row, col, layerIdx, scale);
        if (panDelta) {
            const v = window.__getView();
            window.__setView(v.scale, v.ox + panDelta.dx, v.oy + panDelta.dy);
        }
    }, { layerIdx, scale, panDelta, showAll, brush, row, col });

    await moveMouseToGridCell(page, row, col, layerIdx);

    const hoverCheck = await page.evaluate(({ row, col, layerIdx }) => {
        const tileC = window.__getTileScreenCenter(row, col, layerIdx);
        const hoverC = window.__getHoverScreenCenter();
        if (!hoverC) return { ok: false, reason: 'no hover' };
        const dx = Math.abs(tileC.wx - hoverC.wx);
        const dy = Math.abs(tileC.wy - hoverC.wy);
        return { ok: dx <= 1 && dy <= 1, dx, dy, hoverRow: state.hoverCell?.row, hoverCol: state.hoverCell?.col };
    }, { row, col, layerIdx });

    await ok(
        hoverCheck.ok,
        `Bug2 L${layerIdx} hover align scale=${scale} brush=${brush} (dx=${hoverCheck.dx?.toFixed(2)}, dy=${hoverCheck.dy?.toFixed(2)})`,
    );
    await ok(hoverCheck.hoverRow === row && hoverCheck.hoverCol === col,
        `Bug2 L${layerIdx} hover cell (${hoverCheck.hoverRow},${hoverCheck.hoverCol}) vs (${row},${col})`);

    if (brush !== 'eraser') {
        await page.evaluate(() => {
            const h = window.__getHoverScreenCenter();
            if (!h) return;
            const s = window.__worldToScreen(h.wx, h.wy);
            const canvas = document.getElementById('canvas');
            const rect = canvas.getBoundingClientRect();
            canvas.dispatchEvent(new MouseEvent('mousedown', {
                clientX: rect.left + s.x,
                clientY: rect.top + s.y,
                button: 0,
                bubbles: true,
            }));
            window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
        });
        await page.waitForTimeout(50);

        const placeCheck = await page.evaluate(({ row, col, layerIdx, brush }) => {
            const key = window.__getTileKeyAt(layerIdx, row, col);
            const tileC = window.__getTileScreenCenter(row, col, layerIdx);
            const hoverC = window.__getHoverScreenCenter();
            const dx = hoverC ? Math.abs(tileC.wx - hoverC.wx) : 99;
            const dy = hoverC ? Math.abs(tileC.wy - hoverC.wy) : 99;
            const cell = state.layers[layerIdx]?.tiles?.[`${row},${col}`];
            const typeOk = brush === 'dark' ? cell?.type === 'dark' : cell?.type === 'normal';
            return { placed: !!key, dx, dy, typeOk, exportTile: window.__getEditorExportJson()?.tiles?.find((t) => t.layer === layerIdx && t.row === row && t.col === col) };
        }, { row, col, layerIdx, brush });

        await ok(placeCheck.placed, `Bug2 L${layerIdx} tile placed`);
        await ok(placeCheck.dx <= 1 && placeCheck.dy <= 1, `Bug2 L${layerIdx} tile/hover center (dx=${placeCheck.dx?.toFixed(2)}, dy=${placeCheck.dy?.toFixed(2)})`);
        await ok(placeCheck.typeOk, `Bug2 L${layerIdx} brush type ${brush}`);
        if (placeCheck.exportTile) {
            await ok(placeCheck.exportTile.row === row && placeCheck.exportTile.col === col,
                `Bug2 L${layerIdx} export JSON row/col`);
        }
    }
}

async function testHalfCellSequence(page, ok, layerIdx, scale, panDelta, brush) {
    const points = [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]];
    const label = `HalfCell L${layerIdx} scale=${scale} brush=${brush}`;

    await page.evaluate(({ layerIdx, scale, panDelta, brush }) => {
        localStorage.removeItem('mjDailyEditor.v1');
        loadFromEditorJSON({
            levelId: 90500 + layerIdx,
            totalPairs: 0,
            tiles: [],
            specialTiles: [],
            discs: [],
            rotation: null,
        });
        window.__ensureLayers(layerIdx);
        state.symmetric = false;
        state.snapToSupport = false;
        state.paintMode = 'add';
        window.__setShowAll(true);
        for (let l = 0; l < layerIdx; l++) {
            window.__setCurrentLayer(l);
            state.brush = 'normal';
            paintAt(0, 0);
        }
        window.__setCurrentLayer(layerIdx);
        state.brush = brush;
        window.__centerViewOnCell(0, 0, layerIdx, scale);
        if (panDelta) {
            const v = window.__getView();
            window.__setView(v.scale, v.ox + panDelta.dx, v.oy + panDelta.dy);
        }
    }, { layerIdx, scale, panDelta, brush });

    const hoverResults = [];
    for (const [row, col] of points) {
        await moveMouseToGridCell(page, row, col, layerIdx);
        const step = await page.evaluate(({ row, col, layerIdx }) => {
            const hover = state.hoverCell;
            const hoverC = window.__getHoverScreenCenter();
            const gridP = window.__getGridCellScreenPoint(row, col, layerIdx);
            const s = window.__worldToScreen(gridP.wx, gridP.wy);
            const back = window.__screenToGridCell(s.x, s.y);
            return {
                expected: { row, col },
                hover: hover ? { row: hover.row, col: hover.col } : null,
                roundTrip: back,
                hoverCenter: hoverC ? { wx: hoverC.wx, wy: hoverC.wy } : null,
            };
        }, { row, col, layerIdx });
        hoverResults.push(step);
    }

    await moveMouseToGridCell(page, 0, 1, layerIdx);
    const h01center = await page.evaluate(() => {
        const h = window.__getHoverScreenCenter();
        return h ? { wx: h.wx, wy: h.wy } : null;
    });
    await moveMouseToGridCell(page, 1, 0, layerIdx);
    const h10center = await page.evaluate(() => {
        const h = window.__getHoverScreenCenter();
        return h ? { wx: h.wx, wy: h.wy } : null;
    });
    const spacingCheck = {
        dx01: h01center ? Math.abs(h01center.wx - hoverResults[0].hoverCenter.wx) : 99,
        dy10: h10center ? Math.abs(h10center.wy - hoverResults[0].hoverCenter.wy) : 99,
        CELL: 40,
    };

    await ok(Math.abs(spacingCheck.dx01 - spacingCheck.CELL) <= 1,
        `${label} hover col spacing ${spacingCheck.dx01?.toFixed(1)}px (expect ${spacingCheck.CELL})`);
    await ok(Math.abs(spacingCheck.dy10 - spacingCheck.CELL) <= 1,
        `${label} hover row spacing ${spacingCheck.dy10?.toFixed(1)}px (expect ${spacingCheck.CELL})`);

    for (const step of hoverResults) {
        const { row, col } = step.expected;
        await ok(step.hover?.row === row && step.hover?.col === col,
            `${label} hover (${step.hover?.row},${step.hover?.col}) expect (${row},${col})`);
        await ok(step.roundTrip.row === row && step.roundTrip.col === col,
            `${label} roundTrip (${step.roundTrip.row},${step.roundTrip.col}) expect (${row},${col})`);
    }

    // 单独放置奇数坐标 (1,1)，验证导出保留半格精度
    const place = await page.evaluate(({ layerIdx, brush }) => {
        loadFromEditorJSON({
            levelId: 90599, totalPairs: 0, tiles: [], specialTiles: [], discs: [], rotation: null,
        });
        window.__ensureLayers(layerIdx);
        state.symmetric = false;
        state.snapToSupport = false;
        for (let l = 0; l < layerIdx; l++) {
            window.__setCurrentLayer(l);
            state.brush = 'normal';
            paintAt(0, 0);
        }
        window.__setCurrentLayer(layerIdx);
        state.brush = brush;
        paintAt(1, 1);
        const hoverC = window.__getHoverScreenCenter();
        const tileC = window.__getTileScreenCenter(1, 1, layerIdx);
        const exportTile = window.__getEditorExportJson()?.tiles?.find((t) => t.layer === layerIdx);
        return {
            placed: !!state.layers[layerIdx]?.tiles['1,1'],
            exportRow: exportTile?.row,
            exportCol: exportTile?.col,
            hoverDx: hoverC ? Math.abs(tileC.wx - hoverC.wx) : 99,
            hoverDy: hoverC ? Math.abs(tileC.wy - hoverC.wy) : 99,
            typeOk: brush === 'dark'
                ? state.layers[layerIdx]?.tiles?.['1,1']?.type === 'dark'
                : state.layers[layerIdx]?.tiles?.['1,1']?.type === 'normal',
        };
    }, { layerIdx, brush });

    await ok(place.placed, `${label} place (1,1)`);
    await ok(place.exportRow === 1 && place.exportCol === 1,
        `${label} export (${place.exportRow},${place.exportCol}) expect (1,1)`);
    await ok(place.exportRow === 1 && place.exportCol === 1,
        `${label} JSON keeps odd coords (1,1) not snapped to even`);
    await ok(place.typeOk, `${label} type at (1,1)`);
}

async function testEraserOverlap(page, ok) {
    const r = await page.evaluate(() => {
        localStorage.removeItem('mjDailyEditor.v1');
        loadFromEditorJSON({
            levelId: 90600, totalPairs: 0, tiles: [], specialTiles: [], discs: [], rotation: null,
        });
        state.symmetric = false;
        state.snapToSupport = false;
        window.__setCurrentLayer(0);
        state.layers[0].tiles['0,0'] = { type: 'normal' };
        state.layers[0].tiles['0,1'] = { type: 'normal' };
        const cover = window.__findTileCoveringCell(1, 1, 0);
        state.brush = 'eraser';
        paintAt(1, 1);
        return {
            coverKey: cover?.key,
            has00: !!state.layers[0].tiles['0,0'],
            has01: !!state.layers[0].tiles['0,1'],
        };
    });
    await ok(r.coverKey === '0,1', `Eraser overlap hit ${r.coverKey} (expect 0,1)`);
    await ok(r.has00 && !r.has01, 'Eraser removed later tile at overlap sub-cell, kept first');
}

async function runHalfCellTests(page, ok) {
    console.log('\n=== Half-cell placement ===');
    for (const layerIdx of [0, 10, 30]) {
        for (const scale of [0.5, 1, 2]) {
            await testHalfCellSequence(page, ok, layerIdx, scale, null, 'normal');
        }
        await testHalfCellSequence(page, ok, layerIdx, 1, { dx: 60, dy: 40 }, 'normal');
        if (layerIdx <= 10) {
            await testHalfCellSequence(page, ok, layerIdx, 1, null, 'dark');
        }
    }
    await testEraserOverlap(page, ok);
}

async function runBug2Tests(page, ok, screenshot) {
    const layers = [0, 1, 5, 10, 20, 30];
    const scales = [0.5, 1, 2];

    for (const layerIdx of layers) {
        for (const scale of scales) {
            await testAlignmentAtLayer(page, ok, layerIdx, { scale, showAll: true, brush: 'normal' });
        }
        await testAlignmentAtLayer(page, ok, layerIdx, { scale: 1, showAll: false, brush: 'normal' });
        await testAlignmentAtLayer(page, ok, layerIdx, { scale: 1, panDelta: { dx: 60, dy: 40 }, brush: 'normal' });
        if (layerIdx <= 5) {
            await testAlignmentAtLayer(page, ok, layerIdx, { scale: 1, brush: 'dark' });
        }
    }

    // 橡皮：先放牌再擦
    await page.evaluate(() => {
        loadFromEditorJSON({ levelId: 90300, totalPairs: 0, tiles: [], specialTiles: [], discs: [], rotation: null });
        state.symmetric = false;
        state.snapToSupport = false;
        window.__ensureLayers(3);
        for (let l = 0; l <= 3; l++) {
            window.__setCurrentLayer(l);
            state.brush = 'normal';
            paintAt(0, -2);
        }
        window.__setCurrentLayer(3);
        state.brush = 'eraser';
    });
    const erased = await page.evaluate(() => {
        state.brush = 'eraser';
        paintAt(0, -2);
        return !window.__getTileKeyAt(3, -2, 0);
    });
    await ok(erased, 'Bug2: eraser removes tile at anchor cell');

    // 对齐截图 L1 / L10 / L30
    for (const layerIdx of [1, 10, 30]) {
        await page.evaluate(({ layerIdx }) => {
            loadFromEditorJSON({ levelId: 90400 + layerIdx, totalPairs: 0, tiles: [], specialTiles: [], discs: [], rotation: null });
            window.__ensureLayers(layerIdx);
            state.symmetric = false;
            state.snapToSupport = false;
            window.__setShowAll(true);
            window.__setCurrentLayer(layerIdx);
            window.__fitView();
            for (let l = 0; l < layerIdx; l++) {
                window.__setCurrentLayer(l);
                state.brush = 'normal';
                paintAt(-1, 0);
                paintAt(1, 0);
            }
            window.__setCurrentLayer(layerIdx);
            state.brush = 'normal';
            paintAt(-1, 0);
            paintAt(1, 0);
        }, { layerIdx });

        await moveMouseToGridCell(page, 0, -1, layerIdx);
        const shotPath = path.join(SHOTS, `align-L${layerIdx}-hover.png`);
        await page.screenshot({ path: shotPath, fullPage: false });
        screenshot(`L${layerIdx} alignment screenshot`, shotPath);
        await ok(fs.existsSync(shotPath), `Bug2: screenshot saved L${layerIdx}`);
    }
}

async function main() {
    fs.mkdirSync(SHOTS, { recursive: true });
    let passed = 0;
    let failed = 0;
    const screenshots = [];

    const ok = async (cond, msg) => {
        if (cond) {
            passed++;
            console.log(`  OK  ${msg}`);
        } else {
            failed++;
            console.error(`  FAIL  ${msg}`);
        }
    };
    const screenshot = (label, p) => {
        screenshots.push({ label, path: p });
        console.log(`  SHOT  ${label}: ${p}`);
    };

    const server = createStaticServer();
    await new Promise((resolve) => server.listen(PORT, resolve));
    const base = `http://127.0.0.1:${PORT}`;

    const { mod: playwright } = resolvePlaywrightModule();
    const { browser } = await launchChromeBrowser(playwright, { headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));

    await page.goto(`${base}/daily-editor/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof window.__runGenerateSolvable === 'function');

    console.log('\n=== Bug 1: generate solvable preserves layout ===');
    await runBug1Tests(page, ok);

    console.log('\n=== Bug 2: hover / paint alignment ===');
    await runHalfCellTests(page, ok);
    await runBug2Tests(page, ok, screenshot);

    await ok(errors.length === 0, `console clean (${errors.length} errors)`);

    await browser.close();
    server.close();

    console.log(`\n=== Bugfix Summary ===\npassed=${passed} failed=${failed}`);
    if (screenshots.length) {
        console.log('Screenshots:');
        for (const s of screenshots) console.log(`  ${s.label}: ${s.path}`);
    }
    if (failed) process.exitCode = 1;
}

main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
