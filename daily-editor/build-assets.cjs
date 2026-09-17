/**
 * 复制正式工程牌面 → daily-editor/assets/tile-faces/
 * node daily-editor/build-assets.cjs
 */
const fs = require('fs');
const path = require('path');

const FACES_SRC = path.join(__dirname, '../../mj-client/assets/resources/tiles/faces');
const BACK_SRC = path.join(__dirname, '../../mj-client/assets/resources/tiles/back.png');
const FACES_DST = path.join(__dirname, 'assets/tile-faces');

if (!fs.existsSync(FACES_SRC)) {
    console.error('缺少牌面源目录:', FACES_SRC);
    process.exit(1);
}

fs.mkdirSync(FACES_DST, { recursive: true });
for (let i = 1; i <= 31; i++) {
    const file = `${String(i).padStart(2, '0')}.png`;
    const src = path.join(FACES_SRC, file);
    if (!fs.existsSync(src) || fs.statSync(src).size < 100) {
        console.error('缺少或过小:', file);
        process.exit(1);
    }
    fs.copyFileSync(src, path.join(FACES_DST, file));
}
if (fs.existsSync(BACK_SRC)) {
    fs.copyFileSync(BACK_SRC, path.join(FACES_DST, 'back.png'));
}
console.log('牌面复制完成: 31 张 + back.png →', FACES_DST);
