// 麻将消一消 本地静态服务器(Node.js,跨平台)
// 用法:node serve.js [port]
// 默认端口 9002
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname; // 脚本所在目录 = 仓库根目录
const port = parseInt(process.argv[2] || process.env.PORT || '9002', 10);
const { validateLevel } = require('./daily-editor/lib/validation.cjs');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

http.createServer(async (req, res) => {
  let u;
  try { u = decodeURIComponent(req.url.split('?')[0]); } catch (_) { res.writeHead(400); res.end('400'); return; }

  if (u === '/daily-editor/api/validate' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const result = validateLevel(body.level, true);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
    }
    return;
  }

  if (u === '/') { u = '/index.html'; }
  const fp = path.join(root, u);
  // 防穿越:必须落在仓库根目录内
  if (!fp.startsWith(root)) { res.writeHead(403); res.end('403'); return; }
  fs.readFile(fp, (e, d) => {
    if (e) {
      // 兜底:如果请求的是目录,试 index.html
      if (e.code === 'EISDIR') {
        fs.readFile(path.join(fp, 'index.html'), (e2, d2) => {
          if (e2) { res.writeHead(404); res.end('404'); return; }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(d2);
        });
        return;
      }
      res.writeHead(404); res.end('404'); return;
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    res.end(d);
  });
}).listen(port, () => {
  console.log('');
  console.log('  🀄  麻将消一消 编辑器已启动');
  console.log('  ──────────────────────────────');
  console.log('  首页:      http://localhost:' + port + '/');
  console.log('  旧版编辑器: http://localhost:' + port + '/editor/');
  console.log('  每日编辑器: http://localhost:' + port + '/daily-editor/');
  console.log('  工作台:    http://localhost:' + port + '/workbench.html');
  console.log('  游戏 demo: http://localhost:' + port + '/demo/');
  console.log('');
  console.log('  按 Ctrl+C 停止服务器');
  console.log('');
});
