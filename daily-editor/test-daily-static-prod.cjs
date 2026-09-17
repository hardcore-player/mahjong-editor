/**
 * 纯静态服务器 + 资源 MIME + 放牌交互验收
 * node daily-editor/test-daily-static-prod.cjs
 * CLOUDFLARE_URL=https://xxx.pages.dev node daily-editor/test-daily-static-prod.cjs
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { resolvePlaywrightModule, launchChromeBrowser } = require('./lib/playwright-chrome-launch.cjs');

const ROOT = path.join(__dirname, '..');
const PORT = 9010;
const CLOUDFLARE_URL = process.env.CLOUDFLARE_URL || '';
const SHOTS = path.join(__dirname, 'screenshots-static-prod');

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

function extractAssets(html, base) {
    const assets = new Set();
    for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
        assets.add(new URL(m[1], base).pathname);
    }
    for (const m of html.matchAll(/<link[^>]+href=["']([^"']+)["']/gi)) {
        assets.add(new URL(m[1], base).pathname);
    }
    for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
        assets.add(new URL(m[1], base).pathname);
    }
    return [...assets];
}

function fetchUrl(base, urlPath) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlPath, base);
        const mod = url.protocol === 'https:' ? require('https') : http;
        mod.get(url, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve({
                status: res.statusCode,
                type: res.headers['content-type'] || '',
                body: Buffer.concat(chunks),
            }));
        }).on('error', reject);
    });
}

async function checkAssets(base, label) {
    let passed = 0;
    let failed = 0;
    const ok = (c, m) => (c ? (passed++, console.log(`  OK  [${label}] ${m}`)) : (failed++, console.error(`  FAIL  [${label}] ${m}`)));

    const idx = await fetchUrl(base, '/daily-editor/');
    ok(idx.status === 200, 'daily-editor index 200');
    ok(!/<script[^>]+src=["']generator\.js/i.test(idx.body.toString('utf8')), 'no generator.js script tag');
    ok(idx.body.toString('utf8').includes('solvable-fill.js'), 'includes solvable-fill.js');
    ok(!idx.body.toString('utf8').includes('dailyFaceGrid') || idx.body.toString('utf8').includes('dailyDevDebugPanel'), 'face grid in dev panel');

    const assets = extractAssets(idx.body.toString('utf8'), base + '/daily-editor/');
    ok(assets.length > 0, `found ${assets.length} assets`);

    for (const asset of assets) {
        const r = await fetchUrl(base, asset);
        const text = r.body.slice(0, 32).toString('utf8').toLowerCase();
        ok(r.status === 200, `${asset} status 200`);
        if (asset.endsWith('.js')) {
            ok((r.type || '').includes('javascript') || (r.type || '').includes('text/javascript'), `${asset} JS mime (${r.type})`);
            ok(!text.startsWith('<!doctype') && !text.startsWith('<html'), `${asset} not HTML`);
        }
    }

    const missingGen = await fetchUrl(base, '/daily-editor/generator.js');
    ok(missingGen.status === 404, 'generator.js returns 404 not HTML fallback');
    if (missingGen.status === 200) {
        ok(missingGen.body.toString('utf8', 0, 5) !== '<!DOC', 'generator.js 200 must not be HTML');
    }

    return { passed, failed, assets };
}

async function runPlaywrightSolvableWorkflow(base, label) {
    let passed = 0;
    let failed = 0;
    let failShotIdx = 0;
    fs.mkdirSync(SHOTS, { recursive: true });

    const { mod: playwright, resolvedFrom } = resolvePlaywrightModule();
    console.log(`  Playwright 包: ${resolvedFrom}`);

    const errors = [];
    let browser;
    let page;
    const ok = async (c, m) => {
        if (c) {
            passed++;
            console.log(`  OK  [${label}] ${m}`);
            return;
        }
        failed++;
        console.error(`  FAIL  [${label}] ${m}`);
        if (page) {
            const safe = m.replace(/[^\w\u4e00-\u9fff-]+/g, '-').slice(0, 48);
            const shotPath = path.join(SHOTS, `${label}-${++failShotIdx}-${safe}.png`);
            try {
                await page.screenshot({ path: shotPath, fullPage: true });
                console.error(`  screenshot: ${shotPath}`);
            } catch (shotErr) {
                console.error(`  screenshot failed: ${shotErr.message}`);
            }
        }
    };

    console.log(`  [${label}] 启动系统 Chrome…`);
    ({ browser } = await launchChromeBrowser(playwright, { headless: true }));
    page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    page.on('console', (msg) => {
        if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) errors.push(msg.text());
    });

    await page.goto(`${base}/daily-editor/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
        localStorage.removeItem('mjDailyEditor.v1');
        loadFromEditorJSON({
            levelId: 90099, totalPairs: 0, tiles: [], specialTiles: [], discs: [], rotation: null,
        });
        state.symmetric = false;
        state.snapToSupport = false;
        window.__syncDoc = () => {
            window.__getLevelDocument().mergeEditableFromLayers(state.layers);
            state.layers = window.__getLevelDocument().buildEditableLayers();
        };
    });

    // 1. 正式界面看不到花色网格
    await ok(await page.evaluate(() => {
        const dev = document.getElementById('dailyDevDebugPanel');
        const grid = document.getElementById('dailyFaceGrid');
        return dev && grid && dev.style.display === 'none';
    }), 'face grid hidden in prod UI');

    // 2. 新建牌不需要 typeId
    await page.evaluate(() => {
        loadFromEditorJSON({
            levelId: 90097, totalPairs: 0, tiles: [], specialTiles: [], discs: [], rotation: null,
        });
        state.brush = 'normal';
        state.paintMode = 'add';
        paintAt(-3, 0);
    });
    await ok(await page.evaluate(() => {
        const t = state.layers[0].tiles['0,-3'];
        return t && t.typeId == null;
    }), 'new tile has null typeId');

    const layout4 = {
        levelId: 90099,
        totalPairs: 2,
        tiles: [
            { id: 1, layer: 0, row: 0, col: -3, typeId: null, isDark: false },
            { id: 2, layer: 0, row: 0, col: -1, typeId: null, isDark: false },
            { id: 3, layer: 0, row: 0, col: 1, typeId: null, isDark: false },
            { id: 4, layer: 0, row: 0, col: 3, typeId: null, isDark: false },
        ],
        specialTiles: [],
        discs: [],
        rotation: null,
    };

    // 3–6. 偶数张牌生成 + 布局不变 + 偶数花色 + replay
    await page.evaluate((layout) => { loadFromEditorJSON(layout); }, layout4);
    const gen = await page.evaluate(() => {
        const fpBefore = DailySolvableFill.computeLayoutFingerprint(window.__getEditorExportJson());
        window.__runGenerateSolvable();
        const json = window.__getEditorExportJson();
        const fpAfter = DailySolvableFill.computeLayoutFingerprint(json);
        const st = window.__getSolvableState();
        const tiles = DailySolvableFill.getDailyTiles(json);
        const counts = {};
        for (const t of tiles) counts[t.typeId] = (counts[t.typeId] || 0) + 1;
        const evenTypes = Object.keys(counts).length > 0 && Object.values(counts).every((n) => n % 2 === 0);
        const replay = st.solution?.length ? DailySolvableFill.replaySolution(tiles, st.solution) : { ok: false };
        return { fpBefore, fpAfter, status: st.status, evenTypes, replayOk: replay.ok, tileCount: tiles.length, lastError: st.lastError };
    });
    await ok(gen.tileCount === 4, 'four tiles placed');
    await ok(gen.status === 'verified', `status verified after generate (${gen.lastError || ''})`);
    await ok(gen.fpBefore === gen.fpAfter, 'layout unchanged after generate');
    await ok(gen.evenTypes, 'all typeId counts even');
    await ok(gen.replayOk, 'saved solution replay passes');

    // 7. 暗牌参与生成
    const layoutDark = {
        levelId: 90098,
        totalPairs: 2,
        tiles: [
            { id: 10, layer: 0, row: 2, col: -3, typeId: null, isDark: true },
            { id: 11, layer: 0, row: 2, col: -1, typeId: null, isDark: true },
            { id: 12, layer: 0, row: 2, col: 1, typeId: null, isDark: false },
            { id: 13, layer: 0, row: 2, col: 3, typeId: null, isDark: false },
        ],
        specialTiles: [
            { type: 'dark', id: 10, layer: 0, row: 2, col: -3 },
            { type: 'dark', id: 11, layer: 0, row: 2, col: -1 },
        ],
        discs: [],
        rotation: null,
    };
    await page.evaluate((layout) => {
        loadFromEditorJSON(layout);
        window.__runGenerateSolvable();
    }, layoutDark);
    await ok(await page.evaluate(() => window.__getSolvableState().status === 'verified'), 'dark tiles solvable');

    // 8–10. 布局修改失效 → 禁止导出 → 补第二张后重新生成可导出
    await page.evaluate((layout) => {
        loadFromEditorJSON(layout);
        window.__runGenerateSolvable();
    }, layout4);
    await page.evaluate(() => {
        state.brush = 'normal';
        state.paintMode = 'add';
        paintAt(-3, 4);
        window.__getLevelDocument().mergeEditableFromLayers(state.layers);
    });
    await ok(await page.evaluate(() => window.__getSolvableState().status === 'layout_stale'), 'layout edit marks stale');
    await ok(await page.evaluate(() => !window.__canExportFormal().ok), 'unverified export blocked');
    const exportGate = await page.evaluate(() => {
        paintAt(-1, 4);
        window.__getLevelDocument().mergeEditableFromLayers(state.layers);
        state.layers = window.__getLevelDocument().buildEditableLayers();
        window.__runGenerateSolvable();
        const gate = window.__canExportFormal();
        return { ok: gate.ok, message: gate.message, status: window.__getSolvableState().status, tileCount: window.__getEditorExportJson().tiles.length };
    });
    await ok(exportGate.ok, `verified export allowed (${exportGate.message || exportGate.status}, tiles=${exportGate.tileCount})`);

    // 11. 导入完整可解关保留花色
    let importCheck;
    try {
        importCheck = await page.evaluate(() => {
            const json = window.__getEditorExportJson();
            const savedTypes = json.tiles.map((t) => ({ id: t.id, typeId: t.typeId }));
            loadFromEditorJSON(json);
            const after = window.__getEditorExportJson();
            const same = savedTypes.every((s) => {
                const t = after.tiles.find((x) => x.id === s.id);
                return t && t.typeId === s.typeId;
            });
            return { same, status: window.__getSolvableState().status };
        });
    } catch (e) {
        importCheck = { same: false, status: 'error', error: String(e.message || e) };
    }
    await ok(importCheck.same, `import preserves typeIds (${importCheck.error || ''})`);
    await ok(importCheck.status === 'verified', 'import re-verified');

    // eraser still works
    await page.evaluate((layout) => { loadFromEditorJSON(layout); }, layout4);
    await page.evaluate(() => {
        state.brush = 'eraser';
        paintAt(-3, 0);
    });
    await ok(await page.evaluate(() => !state.layers[0].tiles['0,-3']), 'eraser delete');

    // 12. 控制台无红错
    await ok(errors.length === 0, `console clean (${errors.length} errors: ${errors.join('; ')})`);
    await browser.close();
    return { passed, failed, screenshots: SHOTS };
}

(async () => {
    let totalPassed = 0;
    let totalFailed = 0;

    const server = createStaticServer();
    await new Promise((resolve) => server.listen(PORT, resolve));
    const localBase = `http://127.0.0.1:${PORT}`;

    console.log('\n=== Pure static server (no SPA fallback) ===');
    const a1 = await checkAssets(localBase, 'static');
    const p1 = await runPlaywrightSolvableWorkflow(localBase, 'static');
    totalPassed += a1.passed + p1.passed;
    totalFailed += a1.failed + p1.failed;

    if (CLOUDFLARE_URL) {
        console.log('\n=== Cloudflare production URL ===');
        const base = CLOUDFLARE_URL.replace(/\/$/, '');
        const a2 = await checkAssets(base, 'cloudflare');
        const p2 = await runPlaywrightSolvableWorkflow(base, 'cloudflare');
        totalPassed += a2.passed + p2.passed;
        totalFailed += a2.failed + p2.failed;
    } else {
        console.log('\n  SKIP  Cloudflare URL (set CLOUDFLARE_URL env to test production)');
    }

    server.close();
    console.log(`\n=== Summary ===\npassed=${totalPassed} failed=${totalFailed}`);
    if (totalFailed) process.exitCode = 1;
})();
