/**
 * 支撑规则（≥1 半格重叠）快速验收
 * node daily-editor/test-daily-support-quick.cjs
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { resolvePlaywrightModule, launchChromeBrowser } = require('./lib/playwright-chrome-launch.cjs');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.SUPPORT_TEST_PORT) || 9015;
const SHOTS = path.join(__dirname, 'screenshots-support');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
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

let passed = 0;
let failed = 0;

function ok(c, m) {
    if (c) { passed++; console.log('  OK  ' + m); }
    else { failed++; console.error('  FAIL  ' + m); }
}

async function main() {
    fs.mkdirSync(SHOTS, { recursive: true });
    const srv = createStaticServer();
    await new Promise((r) => srv.listen(PORT, r));
    const base = `http://127.0.0.1:${PORT}`;

    const { mod: pw } = resolvePlaywrightModule();
    const { browser } = await launchChromeBrowser(pw, { headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    await page.goto(`${base}/daily-editor/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof countSupportCoverageAtLayer === 'function');

    const r = await page.evaluate(() => {
        const blank = () => {
            loadFromEditorJSON({
                levelId: 92001, totalPairs: 0, tiles: [], specialTiles: [], discs: [], rotation: null,
            });
            state.symmetric = false;
        };
        const place = (layer, row, col) => {
            state.currentLayer = layer;
            state.brush = 'normal';
            state.paintMode = 'add';
            paintAt(col, row);
        };

        const cov = (layer, row, col) => countSupportCoverageAtLayer(layer, col, row);
        blank();
        window.__ensureLayers(1);
        place(0, 0, 0);
        const cov40 = cov(1, 0, 0);
        const cov21 = cov(1, 0, 1);
        const cov11 = cov(1, 1, 1);
        const cov02 = cov(1, 0, 2);

        blank();
        window.__ensureLayers(1);
        place(0, 0, 0);
        place(1, 0, 0);
        const l1Full = !!state.layers[1].tiles['0,0'];

        blank();
        window.__ensureLayers(1);
        place(0, 0, 0);
        place(1, 0, 1);
        const l1Half = !!state.layers[1].tiles['0,1'];

        blank();
        window.__ensureLayers(1);
        place(0, 0, 0);
        place(1, 1, 1);
        const l1Corner = !!state.layers[1].tiles['1,1'];

        blank();
        window.__ensureLayers(1);
        place(0, 0, 0);
        place(1, 0, 2);
        const l1Float = !state.layers[1].tiles['0,2'];

        blank();
        window.__ensureLayers(2);
        place(0, 0, 0);
        place(2, 0, 0);
        const l2Skip = !state.layers[2].tiles['0,0'];

        blank();
        window.__ensureLayers(1);
        place(0, 0, 0);
        place(1, 1, 1);
        state.layers[1].tiles['0,2'] = { type: 'normal' };
        state.showIssues = true;
        const issues = findSupportIssues();
        const hasCornerIssue = issues.has('1,1');
        const hasFloatIssue = issues.has('0,2');

        const snapHidden = document.getElementById('snapToggle').style.display === 'none';
        blank();
        window.__ensureLayers(2);
        place(0, 0, 0);
        state.currentLayer = 2;
        state.snapToSupport = false;
        const bypassBlocked = !hasSupportAt(0, 2);

        return {
            cov40, cov21, cov11, cov02,
            l1Full, l1Half, l1Corner, l1Float, l2Skip,
            hasCornerIssue, hasFloatIssue, snapHidden, bypassBlocked,
        };
    });

    ok(r.cov40 === 4, `L1@(0,0) covered=4 (${r.cov40})`);
    ok(r.l1Full, 'L1@(0,0) placed');
    ok(r.cov21 === 2, `L1@(0,1) covered=2 (${r.cov21})`);
    ok(r.l1Half, 'L1@(0,1) placed');
    ok(r.cov11 === 1, `L1@(1,1) covered=1 corner (${r.cov11})`);
    ok(r.l1Corner, 'L1@(1,1) corner placed');
    ok(r.cov02 === 0, `L1@(0,2) covered=0 (${r.cov02})`);
    ok(r.l1Float, 'L1@(0,2) blocked');
    ok(r.l2Skip, 'L2 skip empty L1 blocked');
    ok(!r.hasCornerIssue, 'corner tile no red issue frame');
    ok(r.hasFloatIssue, 'fully floating tile flagged');
    ok(r.snapHidden, 'support toggle hidden');
    ok(r.bypassBlocked, 'snapToSupport=false cannot bypass support');

    await page.evaluate(() => {
        loadFromEditorJSON({
            levelId: 92002, totalPairs: 0, tiles: [], specialTiles: [], discs: [], rotation: null,
        });
        window.__ensureLayers(1);
        state.symmetric = false;
        state.currentLayer = 0;
        state.brush = 'normal';
        state.paintMode = 'add';
        paintAt(0, 0);
        state.currentLayer = 1;
        paintAt(0, 0);
        paintAt(1, 1);
        state.showAll = true;
        state.showIssues = true;
        draw();
        window.__fitView();
    });
    await page.waitForTimeout(150);
    const shotPath = path.join(SHOTS, 'corner-support-L1.png');
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log('  SHOT ' + shotPath);

    await browser.close();
    srv.close();
    console.log(`\n=== ${passed} passed, ${failed} failed ===`);
    process.exit(failed ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
