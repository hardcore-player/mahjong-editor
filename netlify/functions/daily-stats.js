/**
 * Netlify 回退：每日挑战统计（与 Cloudflare functions/daily-stats 同语义的精简版）
 * 路径：/.netlify/functions/daily-stats
 * 生产请优先用 Cloudflare Pages + KV。
 *
 * Netlify 无 KV 绑定时，使用内存 Map（冷启动会丢，仅本地/临时）。
 */
const ACTIVE_MS = 3 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const mem = globalThis.__mjDailyStatsMem || (globalThis.__mjDailyStatsMem = new Map());

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'Content-Type, X-Workbench-Pass, X-Daily-Stats-Pass, X-Daily-Stats-Key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
  };
}
function json(status, body) {
  return {
    statusCode: status,
    headers: { ...cors(), 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}
function beijingDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
function checkAdmin(headers, env) {
  const expected = env.DAILY_STATS_PASSWORD || env.WORKBENCH_PASSWORD;
  if (!expected) return { ok: false, msg: '未配置口令' };
  const got =
    headers['x-daily-stats-pass'] ||
    headers['X-Daily-Stats-Pass'] ||
    headers['x-workbench-pass'] ||
    headers['X-Workbench-Pass'];
  if (!got || got !== expected) return { ok: false, msg: '口令错误' };
  return { ok: true };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors(), body: '' };
  }
  const env = process.env;
  const qs = event.queryStringParameters || {};
  const path = (event.path || '').toLowerCase();

  if (event.httpMethod === 'POST') {
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch (_) {}
    const deviceId = String(body.deviceId || '').trim().slice(0, 80);
    const ev = String(body.event || '').toLowerCase();
    const date = (DATE_RE.test(String(body.date || '')) ? body.date : beijingDate());
    if (!deviceId || !['start', 'heartbeat', 'pass', 'leave'].includes(ev)) {
      return json(400, { ok: false, error: 'bad event/deviceId' });
    }
    const key = `ds:day:${date}:dev:${deviceId}`;
    const now = Date.now();
    const rec = mem.get(key) || {
      deviceId, date, firstStartAt: null, lastSeenAt: null,
      passedAt: null, leftAt: null, levelId: null, status: 'unknown',
    };
    rec.lastSeenAt = now;
    if (body.levelId != null) rec.levelId = Math.floor(Number(body.levelId)) || rec.levelId;
    if (ev === 'start' || ev === 'heartbeat') {
      if (!rec.firstStartAt) rec.firstStartAt = now;
      if (!rec.passedAt) { rec.status = 'playing'; rec.leftAt = null; }
    } else if (ev === 'pass') {
      if (!rec.firstStartAt) rec.firstStartAt = now;
      if (!rec.passedAt) rec.passedAt = now;
      rec.status = 'passed';
    } else if (ev === 'leave' && !rec.passedAt) {
      rec.status = 'left';
      rec.leftAt = now;
    }
    mem.set(key, rec);
    return json(200, { ok: true, date, event: ev, status: rec.status, backend: 'netlify-memory' });
  }

  if (event.httpMethod === 'GET') {
    const gate = checkAdmin(event.headers || {}, env);
    if (!gate.ok) return json(401, { ok: false, error: gate.msg });
    const date = DATE_RE.test(String(qs.date || '')) ? qs.date : beijingDate();
    const prefix = `ds:day:${date}:dev:`;
    const now = Date.now();
    let played = 0, passed = 0, playingNow = 0;
    for (const [k, r] of mem.entries()) {
      if (!k.startsWith(prefix) || !r.firstStartAt) continue;
      played++;
      if (r.passedAt) passed++;
      if (r.status === 'playing' && !r.passedAt && r.lastSeenAt && now - r.lastSeenAt <= ACTIVE_MS) {
        playingNow++;
      }
    }
    const passRate = played > 0 ? Math.round((passed / played) * 1000) / 10 : 0;
    return json(200, {
      ok: true, date, played, playingNow, passed, passRate,
      note: 'Netlify 内存版（冷启动会丢）；生产请用 Cloudflare KV',
      updatedAt: new Date().toISOString(),
    });
  }

  return json(404, { ok: false, error: 'not found', path });
};
