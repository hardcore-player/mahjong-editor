/**
 * 纯静态服务器 + 资源 MIME + 放牌交互验收
 * node daily-editor/test-daily-static-prod.cjs
 * CLOUDFLARE_URL=https://xxx.pages.dev node daily-editor/test-daily-static-prod.cjs
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const PORT = 9010;
const CLOUDFLARE_URL = process.env.CLOUDFLARE_URL || '';

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

async function runPlaywrightPaint(base, label) {
    let passed = 0;
    let failed = 0;
    const ok = (c, m) => (c ? (passed++, console.log(`  OK  [${label}] ${m}`)) : (failed++, console.error(`  FAIL  [${label}] ${m}`)));

    let playwright;
    try {
        playwright = require(path.join(__dirname, '../../mj-client/node_modules/playwright'));
    } catch (_) {
        console.log(`  SKIP  [${label}] Playwright not installed`);
        return { passed, failed };
    }

    const errors = [];
    let browser;
    try {
        browser = await playwright.chromium.launch({ headless: true });
    } catch (e) {
        console.log(`  SKIP  [${label}] Playwright browser: ${e.message}`);
        return { passed, failed };
    }
    const page = await browser.newPage();
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
    });

    await page.evaluate(() => {
        state.brush = 'normal';
        state.paintMode = 'add';
        paintAt(0, 0);
        paintAt(2, 0);
        paintAt(4, 0);
    });
    ok(await page.evaluate(() => Object.keys(state.layers[0].tiles).length >= 3), 'normal paint 3 tiles');

    await page.evaluate(() => {
        state.brush = 'dark';
        state.paintMode = 'add';
        paintAt(0, 2);
    });
    ok(await page.evaluate(() => state.layers[0].tiles['2,0']?.type === 'dark'), 'dark paint');

    await page.evaluate(() => {
        state.brush = 'eraser';
        paintAt(4, 0);
    });
    ok(await page.evaluate(() => !state.layers[0].tiles['0,4']), 'eraser delete');

    await page.evaluate(() => {
        const before = serializeState();
        state.brush = 'normal';
        state.paintMode = 'add';
        paintAt(6, 0);
        pushHistory(before);
    });
    await page.evaluate(() => undo());
    ok(await page.evaluate(() => !state.layers[0].tiles['0,6']), 'undo works');
    await page.evaluate(() => redo());
    ok(await page.evaluate(() => !!state.layers[0].tiles['0,6']), 'redo works');

    const exported = await page.evaluate(() => {
        window.__getLevelDocument().mergeEditableFromLayers(state.layers);
        return window.__getLevelDocument().exportJson();
    });
    ok((exported.tiles || []).length > 0, 'export has tiles');
    ok(exported.tiles.every((t) => t.typeId >= 1 && t.typeId <= 31), 'export typeId valid');

    ok(errors.length === 0, `console clean (${errors.length} errors: ${errors.join('; ')})`);
    await browser.close();
    return { passed, failed };
}

(async () => {
    let totalPassed = 0;
    let totalFailed = 0;

    const server = createStaticServer();
    await new Promise((resolve) => server.listen(PORT, resolve));
    const localBase = `http://127.0.0.1:${PORT}`;

    console.log('\n=== Pure static server (no SPA fallback) ===');
    const a1 = await checkAssets(localBase, 'static');
    const p1 = await runPlaywrightPaint(localBase, 'static');
    totalPassed += a1.passed + p1.passed;
    totalFailed += a1.failed + p1.failed;

    if (CLOUDFLARE_URL) {
        console.log('\n=== Cloudflare production URL ===');
        const base = CLOUDFLARE_URL.replace(/\/$/, '');
        const a2 = await checkAssets(base, 'cloudflare');
        const p2 = await runPlaywrightPaint(base, 'cloudflare');
        totalPassed += a2.passed + p2.passed;
        totalFailed += a2.failed + p2.failed;
    } else {
        console.log('\n  SKIP  Cloudflare URL (set CLOUDFLARE_URL env to test production)');
    }

    server.close();
    console.log(`\n=== Summary ===\npassed=${totalPassed} failed=${totalFailed}`);
    if (totalFailed) process.exitCode = 1;
})();
