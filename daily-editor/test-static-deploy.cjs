/**
 * Cloudflare Pages 静态部署检查
 * node daily-editor/test-static-deploy.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DAILY = path.join(__dirname);

let passed = 0;
let failed = 0;
function ok(c, m) {
    if (c) { passed++; console.log('  OK  ' + m); }
    else { failed++; console.error('  FAIL  ' + m); }
}

function walk(dir, out = []) {
    for (const name of fs.readdirSync(dir)) {
        const fp = path.join(dir, name);
        if (fs.statSync(fp).isDirectory()) {
            if (name === 'node_modules' || name === '.git') continue;
            walk(fp, out);
        } else {
            out.push(fp);
        }
    }
    return out;
}

console.log('\n=== 静态资源 ===');
ok(fs.existsSync(path.join(DAILY, 'index.html')), 'daily-editor/index.html');
ok(fs.existsSync(path.join(DAILY, 'lib/validation.js')), 'browser validation.js');
ok(fs.existsSync(path.join(DAILY, 'assets/tile-faces/01.png')), 'tile face 01.png');
ok(fs.existsSync(path.join(DAILY, 'assets/tile-faces/31.png')), 'tile face 31.png');

const dailyHtml = fs.readFileSync(path.join(DAILY, 'index.html'), 'utf8');
ok(dailyHtml.includes('validation.js'), 'index loads validation.js');
ok(!dailyHtml.includes('/daily-editor/api/validate'), 'index no api/validate ref');

const patch = fs.readFileSync(path.join(DAILY, 'lib/daily-editor-patch.js'), 'utf8');
ok(!patch.includes('/daily-editor/api/validate'), 'patch no api/validate fetch');
ok(patch.includes('DailyValidation.validateLevel'), 'patch uses browser validation');

console.log('\n=== 无本机路径 / 秘密 ===');
const secretPattern = /(?:password\s*=\s*['"][^'"]+['"]|api[_-]?key|secret[_-]?key|Bearer\s+[A-Za-z0-9]|ghp_[A-Za-z0-9]|sk-[A-Za-z0-9])/i;
const absWin = /[A-Z]:\\Users\\|[A-Z]:\\workspace\\/i;
const files = walk(DAILY).filter((f) => /\.(html|js|css|json|md|cjs)$/.test(f));
let badPath = [];
let badSecret = [];
for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    if (absWin.test(text)) badPath.push(path.relative(DAILY, f));
    if (secretPattern.test(text) && !f.endsWith('index.html')) badSecret.push(path.relative(DAILY, f));
}
ok(badPath.length === 0, `no absolute paths (${badPath.join(', ') || 'none'})`);
ok(badSecret.length === 0, `no secrets in daily-editor (${badSecret.join(', ') || 'none'})`);

console.log('\n=== 首页入口 ===');
const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok(home.includes('href="editor/"'), 'homepage editor link');
ok(home.includes('href="daily-editor/"'), 'homepage daily link');
ok(home.includes('每日高难关卡编辑器'), 'homepage daily title');

console.log('\n=== Pages 配置 ===');
const netlify = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
ok(netlify.includes('publish = "."'), 'static publish root');

console.log(`\n=== Summary ===\npassed=${passed} failed=${failed}`);
if (failed) process.exitCode = 1;
