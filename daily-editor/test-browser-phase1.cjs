/**

 * 浏览器静态验收（HTTP + Playwright 冒烟）

 * node daily-editor/test-browser-phase1.cjs

 */

const http = require('http');

const fs = require('fs');

const path = require('path');



const BASE = '127.0.0.1';

const PORT = 9002;



function get(urlPath) {

    return new Promise((resolve, reject) => {

        http.get({ host: BASE, port: PORT, path: urlPath }, (res) => {

            const chunks = [];

            res.on('data', (c) => chunks.push(c));

            res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));

        }).on('error', reject);

    });

}



(async () => {

    let passed = 0;

    let failed = 0;

    const ok = (c, m) => (c ? (passed++, console.log('  OK  ' + m)) : (failed++, console.error('  FAIL  ' + m)));



    const idx = await get('/daily-editor/');

    ok(idx.status === 200 && idx.body.includes('daily-editor-patch.js'), 'daily-editor index');

    ok(idx.body.includes('validation.js'), 'validation.js loaded');

    ok(idx.body.includes('dailyEditorBootstrap'), 'bootstrap wired');



    const home = await get('/index.html');

    ok(home.body.includes('daily-editor/'), 'homepage daily link');



    const old = await get('/editor/index.html');

    ok(old.status === 200 && !old.body.includes('daily-editor-patch.js'), 'old editor untouched');



    const face = await get('/daily-editor/assets/tile-faces/01.png');

    ok(face.status === 200 && face.body.length > 100, 'tile face 01.png');



    const DailyValidation = require('./lib/validation.js');

    const level = JSON.parse(fs.readFileSync(

        path.join(__dirname, '../../mj-client/assets/resources/levels/level_48.json'), 'utf8',

    ));

    for (const t of level.tiles) {

        if (t.typeId > 31) t.typeId = ((t.typeId - 1) % 31) + 1;

    }

    level.totalPairs = Math.floor(level.tiles.length / 2);

    const val = DailyValidation.validateLevel(level, true);

    ok(val.ok, 'browser validation module level_48');



    console.log(`\n=== Summary ===\npassed=${passed} failed=${failed}`);

    if (failed) process.exitCode = 1;

})();


