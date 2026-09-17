/**
 * Playwright 启动系统 Chrome（不下载 Playwright 自带 Chromium）
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CHROME_CANDIDATES = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

function resolvePlaywrightModule() {
    const candidates = [
        path.join(__dirname, '../../../mj-client/node_modules/playwright'),
        path.join(__dirname, '../../node_modules/playwright'),
        path.join(__dirname, '../node_modules/playwright'),
        'playwright',
    ];
    for (const c of candidates) {
        try {
            const mod = require(c);
            return { mod, resolvedFrom: c };
        } catch (_) {
            /* try next */
        }
    }
    throw new Error(
        'Playwright npm 包未安装。请在 mj-client 目录执行 npm install playwright（无需 npx playwright install chromium）',
    );
}

function findChromeExecutable() {
    for (const p of CHROME_CANDIDATES) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

function readChromeVersion(exePath) {
    if (!exePath || !fs.existsSync(exePath)) return null;
    try {
        const out = execFileSync(exePath, ['--version'], { encoding: 'utf8', windowsHide: true }).trim();
        if (out && !/[\u4e00-\u9fff]/.test(out) && out.length < 80) return out;
    } catch {
        /* fall through */
    }
    try {
        const ps = `(Get-Item '${exePath.replace(/'/g, "''")}').VersionInfo.ProductVersion`;
        return execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true }).trim();
    } catch {
        return null;
    }
}

async function launchChromeBrowser(playwright, launchOpts = {}) {
    const opts = { headless: true, ...launchOpts };
    delete opts.label;

    let browser;
    let mode;
    let chromePath = findChromeExecutable();

    try {
        browser = await playwright.chromium.launch({ ...opts, channel: 'chrome' });
        mode = 'channel:chrome';
    } catch (channelErr) {
        if (!chromePath) {
            throw new Error(
                `无法启动 Chrome：channel 失败 (${channelErr.message})，且未在以下路径找到 chrome.exe：\n`
                + CHROME_CANDIDATES.join('\n'),
            );
        }
        browser = await playwright.chromium.launch({ ...opts, executablePath: chromePath });
        mode = 'executablePath';
    }

    if (!chromePath) chromePath = findChromeExecutable();
    let version = null;
    if (typeof browser.version === 'function') {
        try { version = browser.version(); } catch (_) { /* ignore */ }
    }
    if (!version) version = readChromeVersion(chromePath);
    if (!version) version = 'unknown';

    console.log(`  Chrome 启动方式: ${mode}`);
    console.log(`  Chrome 路径: ${chromePath || '(channel: chrome, 路径未解析)'}`);
    console.log(`  Chrome 版本: ${version}`);

    return { browser, mode, chromePath, version };
}

module.exports = {
    CHROME_CANDIDATES,
    resolvePlaywrightModule,
    findChromeExecutable,
    readChromeVersion,
    launchChromeBrowser,
};
