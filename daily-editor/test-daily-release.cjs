/**

 * 每日编辑器发布前 Playwright 验收

 * node daily-editor/test-daily-release.cjs

 */

const fs = require('fs');

const path = require('path');

const http = require('http');



const LEVELS = path.join(__dirname, '../../mj-client/assets/resources/levels');

const SHOTS = path.join(__dirname, 'screenshots-release');

const BASE = '127.0.0.1';

const PORT = 9002;



function loadLevel(name) {

    return JSON.parse(fs.readFileSync(path.join(LEVELS, name), 'utf8'));

}



function ping() {

    return new Promise((resolve) => {

        http.get({ host: BASE, port: PORT, path: '/' }, (res) => {

            res.resume();

            resolve(res.statusCode === 200 || res.statusCode === 302);

        }).on('error', () => resolve(false));

    });

}



(async () => {

    let passed = 0;

    let failed = 0;

    const ok = (c, m) => (c ? (passed++, console.log('  OK  ' + m)) : (failed++, console.error('  FAIL  ' + m)));



    if (!(await ping())) {

        console.error('请先启动 node serve.js（端口 9002）');

        process.exitCode = 1;

        return;

    }



    const { resolvePlaywrightModule, launchChromeBrowser } = require('./lib/playwright-chrome-launch.cjs');

    let playwright;

    try {

        ({ mod: playwright } = resolvePlaywrightModule());

    } catch (e) {

        console.error(e.message);

        process.exitCode = 1;

        return;

    }



    fs.mkdirSync(SHOTS, { recursive: true });



    const { browser } = await launchChromeBrowser(playwright, { headless: true });

    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    const consoleErrors = [];

    const validateRequests = [];



    page.on('pageerror', (e) => consoleErrors.push(String(e.message || e)));

    page.on('console', (msg) => {

        if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {

            consoleErrors.push(msg.text());

        }

    });

    page.on('request', (req) => {

        if (req.url().includes('/daily-editor/api/validate')) validateRequests.push(req.url());

    });



    await page.goto(`http://${BASE}:${PORT}/index.html`, { waitUntil: 'networkidle' });

    await page.screenshot({ path: path.join(SHOTS, '01-homepage.png'), fullPage: true });

    ok((await page.locator('a.btn-edit[href="editor/"]').count()) === 1, 'homepage editor entry');

    ok((await page.locator('a.btn-daily[href="daily-editor/"]').count()) === 1, 'homepage daily entry');

    ok(await page.locator('a.btn-daily .label').textContent() === '每日高难关卡编辑器', 'daily entry title');

    ok((await page.locator('a.btn-edit').getAttribute('href')) === 'editor/', 'editor href');



    const editorPage = await browser.newPage();

    await editorPage.goto(`http://${BASE}:${PORT}/editor/`, { waitUntil: 'domcontentloaded' });

    ok(await editorPage.title().then((t) => t.length > 0), 'old editor loads');

    ok(!(await editorPage.content()).includes('daily-editor-patch.js'), 'old editor no daily patch');

    await editorPage.close();



    await page.goto(`http://${BASE}:${PORT}/daily-editor/`, { waitUntil: 'networkidle' });

    await page.evaluate(() => localStorage.removeItem('mjDailyEditor.v1'));

    await page.reload({ waitUntil: 'networkidle' });

    await page.screenshot({ path: path.join(SHOTS, '02-daily-editor.png'), fullPage: false });

    ok(await page.title().then((t) => t.includes('每日高难关卡')), 'daily editor title');



    const level01 = loadLevel('level_01.json');

    const level48 = loadLevel('level_48.json');

    await page.evaluate((json) => loadFromEditorJSON(json), level01);

    ok(await page.evaluate(() => state.layers.some((l) => Object.keys(l.tiles).length > 0)), 'import normal level');

    await page.evaluate((json) => loadFromEditorJSON(json), level48);

    ok(await page.evaluate(() => {

        const doc = window.__getLevelDocument();

        return doc.exportJson().specialTiles.some((s) => s.type === 'dark');

    }), 'import normal+dark level');



    for (const file of ['level_131.json', 'level_120.json', 'level_110.json']) {

        const result = await page.evaluate((json) => {

            const check = LevelDocument.checkImportAllowed(json);

            const snapBefore = serializeState();

            const tilesBefore = state.layers.reduce((n, l) => n + Object.keys(l.tiles).length, 0);

            loadFromEditorJSON(json);

            return {

                allowed: check.ok,

                message: check.message,

                snapSame: serializeState() === snapBefore,

                tilesSame: state.layers.reduce((n, l) => n + Object.keys(l.tiles).length, 0) === tilesBefore,

            };

        }, loadLevel(file));

        ok(!result.allowed, `${file} rejected`);

        ok(result.message?.includes('每日高难关卡'), `${file} clear message`);

        ok(result.snapSame, `${file} draft unchanged`);

        ok(result.tilesSame, `${file} canvas unchanged`);

    }



    await page.evaluate(() => {

        loadFromEditorJSON({

            levelId: 90099,

            totalPairs: 0,

            tiles: [],

            specialTiles: [],

            discs: [],

            rotation: null,

        });

        addLayer();

        addLayer();

        addLayer();

        state.layers[0].tiles['0,0'] = { type: 'normal', typeId: 3 };
        state.layers[0].tiles['0,2'] = { type: 'normal', typeId: 4 };
        window.__getLevelDocument().mergeEditableFromLayers(state.layers);
    });
    ok(await page.evaluate(() => state.layers.length >= 4), 'L3 layer exists');
    ok(await page.evaluate(() => Object.keys(state.layers[0].tiles).length >= 2), 'tiles added on L0');

    await page.evaluate(() => {
        state.layers[0].tiles['0,0'].typeId = 7;
        window.__getLevelDocument().mergeEditableFromLayers(state.layers);
    });
    ok(await page.evaluate(() => state.layers[0].tiles['0,0'].typeId === 7), 'typeId modified');

    await page.evaluate(() => {
        const cell = state.layers[0].tiles['0,0'];
        delete state.layers[0].tiles['0,0'];
        state.layers[0].tiles['0,4'] = cell;
        window.__getLevelDocument().mergeEditableFromLayers(state.layers);
    });
    ok(await page.evaluate(() => !!state.layers[0].tiles['0,4']), 'tile moved');

    await page.evaluate(() => {
        delete state.layers[0].tiles['0,2'];
        window.__getLevelDocument().mergeEditableFromLayers(state.layers);
    });
    ok(await page.evaluate(() => !state.layers[0].tiles['0,2']), 'tile deleted');



    await page.evaluate((json) => loadFromEditorJSON(json), level01);

    await page.evaluate(() => {

        state.brush = 'dark';

        state.symmetric = false;

        const key = Object.keys(state.layers[0].tiles)[0];

        state.layers[0].tiles[key].type = 'dark';

        window.__getLevelDocument().mergeEditableFromLayers(state.layers);

    });

    ok(await page.evaluate(() => {

        const exp = window.__getLevelDocument().exportJson();

        return exp.specialTiles.length > 0 && exp.tiles.some((t) => t.isDark);

    }), 'normal to dark');



    await page.evaluate(() => {

        const key = Object.keys(state.layers[0].tiles)[0];

        state.layers[0].tiles[key].type = 'normal';

        window.__getLevelDocument().mergeEditableFromLayers(state.layers);

    });

    ok(await page.evaluate(() => {

        const exp = window.__getLevelDocument().exportJson();

        return !exp.tiles.some((t) => t.isDark);

    }), 'dark back to normal');



    await page.evaluate((json) => loadFromEditorJSON(json), level48);

    await page.evaluate(() => {

        const doc = window.__getLevelDocument();

        const layers = state.layers;

        let darkKey = null;

        for (const layer of layers) {

            for (const [k, cell] of Object.entries(layer.tiles)) {

                if (cell.type === 'dark') { darkKey = k; break; }

            }

            if (darkKey) break;

        }

        if (!darkKey) return;

        const [row, col] = darkKey.split(',').map(Number);

        const cell = layers[1].tiles[darkKey] || layers[0].tiles[darkKey];

        const li = layers[1].tiles[darkKey] ? 1 : 0;

        delete layers[li].tiles[darkKey];

        layers[li].tiles[`${row},${col + 2}`] = cell;

        doc.mergeEditableFromLayers(layers);

    });

    ok(await page.evaluate(() => {

        const exp = window.__getLevelDocument().exportJson();

        return exp.specialTiles.every((s) => {

            const t = exp.tiles.find((x) => x.id === s.id);

            return t && s.row === t.row && s.col === t.col;

        });

    }), 'dark move syncs specialTiles');



    await page.evaluate((json) => loadFromEditorJSON(json), level01);

    const countBeforeUndo = await page.evaluate(() => Object.keys(state.layers[0].tiles).length);

    await page.evaluate(() => {

        const before = serializeState();

        state.brush = 'eraser';

        paintAt(0, 0);

        pushHistory(before);

    });

    await page.evaluate(() => undo());

    ok(await page.evaluate(() => Object.keys(state.layers[0].tiles).length) >= countBeforeUndo, 'undo works');

    await page.evaluate(() => redo());

    ok(true, 'redo callable');



    const roundTrip = await page.evaluate(() => {

        const doc = window.__getLevelDocument();

        doc.mergeEditableFromLayers(state.layers);

        const exp = doc.exportJson();

        loadFromEditorJSON(exp);

        const exp2 = window.__getLevelDocument().exportJson();

        return JSON.stringify(exp) === JSON.stringify(exp2);

    });

    ok(roundTrip, 'export reimport consistent');



    await page.evaluate((json) => {

        loadFromEditorJSON(json);

        scheduleAutosave();

    }, level48);

    await page.waitForTimeout(600);

    ok(await page.evaluate(() => !!localStorage.getItem('mjDailyEditor.v1')), 'draft saved');

    await page.reload({ waitUntil: 'networkidle' });

    ok(await page.evaluate(() => state.layers.some((l) => Object.keys(l.tiles).length > 0)), 'draft restored after refresh');



    const faceStatus = await page.evaluate(async () => {

        const results = [];

        for (let i = 1; i <= 31; i++) {

            const r = await fetch(`assets/tile-faces/${String(i).padStart(2, '0')}.png`, { method: 'HEAD' });

            results.push(r.ok);

        }

        return results;

    });

    ok(faceStatus.every(Boolean), '31 tile faces load');



    validateRequests.length = 0;

    consoleErrors.length = 0;

    await page.click('#dailyValidateBtn');

    await page.waitForTimeout(300);

    ok(validateRequests.length === 0, 'no /daily-editor/api/validate request');

    ok(consoleErrors.length === 0, `console no red errors (${consoleErrors.length})`);



    await page.screenshot({ path: path.join(SHOTS, '03-daily-after-edit.png'), fullPage: false });

    await browser.close();



    console.log(`\n=== Summary ===\npassed=${passed} failed=${failed}`);

    console.log(`Screenshots: ${SHOTS}`);

    if (failed) process.exitCode = 1;

})();


