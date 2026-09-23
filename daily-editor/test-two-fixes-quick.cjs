/**
 * 快速验收：布局签名误报 + L6+ 层级色
 * node daily-editor/test-two-fixes-quick.cjs
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { resolvePlaywrightModule, launchChromeBrowser } = require('./lib/playwright-chrome-launch.cjs');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.FIX_TEST_PORT) || 9013;
const SHOTS = path.join(__dirname, 'screenshots-two-fixes');

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

async function main() {
    fs.mkdirSync(SHOTS, { recursive: true });
    const srv = createStaticServer();
    await new Promise((r) => srv.listen(PORT, r));
    const base = `http://127.0.0.1:${PORT}`;

    const { mod: pw } = resolvePlaywrightModule();
    const { browser } = await launchChromeBrowser(pw, { headless: true });
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('PAGEERR', e.message));

    let passed = 0;
    let failed = 0;
    const ok = async (c, m) => {
        if (c) { passed++; console.log('  OK  ' + m); }
        else { failed++; console.error('  FAIL  ' + m); }
    };

    await page.goto(`${base}/daily-editor/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof loadFromEditorJSON === 'function' && typeof window.__runGenerateSolvable === 'function');
    await page.evaluate(() => localStorage.removeItem('mjDailyEditor.v1'));

    // Fix 1: blank editor, paint even tiles without _docId, generate succeeds
    const genBlank = await page.evaluate(() => {
        loadFromEditorJSON({
            levelId: 90301, totalPairs: 0, tiles: [], specialTiles: [], discs: [], rotation: null,
        });
        state.symmetric = false;
        state.snapToSupport = false;
        state.brush = 'normal';
        state.paintMode = 'add';
        paintAt(-3, 0);
        paintAt(-1, 0);
        paintAt(1, 0);
        paintAt(3, 0);
        const hasNullDocId = state.layers[0].tiles && Object.values(state.layers[0].tiles).some((c) => c._docId == null);
        const layoutSig = (sig) => JSON.stringify(JSON.parse(sig).map(({ layer, row, col, isDark }) => ({ layer, row, col, isDark })));
        const countPre = window.__countBoardTiles();
        window.__runGenerateSolvable();
        const status = window.__getSolvableState().status;
        const geoPost = window.__captureGeometrySignature();
        const countPost = window.__countBoardTiles();
        const parsed = JSON.parse(geoPost);
        const layoutPost = layoutSig(geoPost);
        const layoutExpect = layoutSig(JSON.stringify([
            { layer: 0, row: 0, col: -3, isDark: false },
            { layer: 0, row: 0, col: -1, isDark: false },
            { layer: 0, row: 0, col: 1, isDark: false },
            { layer: 0, row: 0, col: 3, isDark: false },
        ]));
        return {
            hasNullDocId,
            countPre,
            countPost,
            status,
            layoutMatch: layoutPost === layoutExpect,
            idsAssigned: parsed.every((t) => t.id != null),
            geomStable: parsed.every((t) => t.layer === 0 && typeof t.row === 'number'),
        };
    });
    await ok(genBlank.hasNullDocId, 'new tiles have null _docId before generate');
    await ok(genBlank.countPre === 4 && genBlank.countPost === 4, 'tile count 4 before/after generate');
    await ok(genBlank.status === 'verified', `generate verified (${genBlank.status})`);
    await ok(genBlank.layoutMatch, 'layout layer/row/col/isDark unchanged (no false rollback)');
    await ok(genBlank.idsAssigned, 'doc ids assigned after generate');
    await ok(genBlank.geomStable, 'layer/row/col preserved');

    // Fix 2: layer colors L4-L8 distinct + L10/L20/L30 vs neighbors
    const colors = await page.evaluate(() => {
        const pick = (i) => getLayerColor(i);
        const uniq = (arr) => new Set(arr.map((c) => c.base)).size;
        const layers = [4, 5, 6, 7, 8, 10, 20, 30];
        const bases = layers.map((i) => ({ i, ...pick(i) }));
        const adjDistinct = (a, b) => pick(a).base !== pick(b).base;
        return {
            bases,
            l4l8uniq: uniq(bases.filter((b) => b.i >= 4 && b.i <= 8)),
            l9l10: adjDistinct(9, 10),
            l19l20: adjDistinct(19, 20),
            l29l30: adjDistinct(29, 30),
            legendMatch: pick(6).base === getLayerColor(6).base,
        };
    });
    await ok(colors.l4l8uniq === 5, `L4-L8 all different (${colors.l4l8uniq}/5)`);
    await ok(colors.l9l10, 'L9 vs L10 distinct');
    await ok(colors.l19l20, 'L19 vs L20 distinct');
    await ok(colors.l29l30, 'L29 vs L30 distinct');
    await ok(colors.legendMatch, 'getLayerColor stable');

    // Screenshot L4-L8
    await page.evaluate(() => {
        loadFromEditorJSON({
            levelId: 90302, totalPairs: 0, tiles: [], specialTiles: [], discs: [], rotation: null,
        });
        window.__ensureLayers(8);
        state.showAll = true;
        state.symmetric = false;
        state.snapToSupport = false;
        state.brush = 'normal';
        state.paintMode = 'add';
        for (let layer = 4; layer <= 8; layer++) {
            state.currentLayer = layer;
            const col = -2 + (layer - 4) * 2;
            paintAt(col, 0);
            paintAt(col + 1, 0);
        }
        state.currentLayer = 6;
        updateUI();
        updateLegend();
        draw();
        window.__fitView();
    });
    await page.waitForTimeout(200);
    const shotPath = path.join(SHOTS, 'layers-L4-L8.png');
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log('  SHOT ' + shotPath);

    const legendSwatch = await page.evaluate(() => {
        const items = document.querySelectorAll('#layerLegend .layer-legend-item');
        const sw6 = items[6]?.querySelector('.layer-swatch');
        if (!sw6) return false;
        const expected = getLayerColor(6).base;
        const bg = sw6.style.background || sw6.style.backgroundColor;
        if (bg === expected) return true;
        const probe = document.createElement('div');
        probe.style.background = expected;
        document.body.appendChild(probe);
        const norm = getComputedStyle(probe).backgroundColor;
        document.body.removeChild(probe);
        return getComputedStyle(sw6).backgroundColor === norm;
    });
    await ok(legendSwatch, 'legend L6 swatch matches getLayerColor(6)');

    await browser.close();
    srv.close();

    console.log(`\n=== ${passed} passed, ${failed} failed ===`);
    process.exit(failed ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
