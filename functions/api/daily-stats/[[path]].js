/**
 * 每日挑战通过率统计（Cloudflare Pages Function）
 *
 * 路由（挂在 /api 下，避免和统计页 /stats、/daily-stats.html 抢路径）：
 *   POST /api/daily-stats/event
 *   GET  /api/daily-stats/summary?date=YYYY-MM-DD
 *   GET  /api/daily-stats/
 *
 * 环境变量：
 *   WORKBENCH_PASSWORD 或 DAILY_STATS_PASSWORD — 管理读取口令
 *   DAILY_STATS_INGEST_KEY（可选）— 若配置，上报需带 Header X-Daily-Stats-Key
 *
 * KV：优先绑定 DAILY_STATS；否则复用 LEVELS（key 前缀隔离）
 */

const ACTIVE_MS = 3 * 60 * 1000; // 3 分钟内有心跳/开局 ⇒ 正在玩
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function kv(env) {
  return (env && (env.DAILY_STATS || env.LEVELS)) || null;
}

function beijingDate(d = new Date()) {
  // en-CA → YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function checkAdmin(request, env) {
  const expected = env.DAILY_STATS_PASSWORD || env.WORKBENCH_PASSWORD;
  if (!expected) return { ok: false, msg: '未配置 DAILY_STATS_PASSWORD / WORKBENCH_PASSWORD' };
  const headers = request.headers;
  const url = new URL(request.url);
  const got =
    headers.get('x-daily-stats-pass') ||
    headers.get('X-Daily-Stats-Pass') ||
    headers.get('x-workbench-pass') ||
    headers.get('X-Workbench-Pass') ||
    url.searchParams.get('pass') ||
    '';
  // 也接受 Authorization: Bearer <口令>
  const auth = headers.get('authorization') || headers.get('Authorization') || '';
  const bearer = auth.toLowerCase().indexOf('bearer ') === 0 ? auth.slice(7).trim() : '';
  const pass = got || bearer;
  if (!pass || pass !== expected) return { ok: false, msg: '口令错误' };
  return { ok: true };
}

function checkIngest(headers, env) {
  const key = env.DAILY_STATS_INGEST_KEY;
  if (!key) return { ok: true };
  const got = headers.get('x-daily-stats-key') || headers.get('X-Daily-Stats-Key');
  if (!got || got !== key) return { ok: false, msg: '上报密钥错误' };
  return { ok: true };
}

function deviceKey(date, deviceId) {
  return `ds:day:${date}:dev:${deviceId}`;
}

function sanitizeDeviceId(v) {
  const s = String(v || '').trim().slice(0, 80);
  if (!s || !/^[A-Za-z0-9._:-]+$/.test(s)) return null;
  return s;
}

function sanitizeDate(v) {
  const s = String(v || '').trim();
  if (!DATE_RE.test(s)) return null;
  return s;
}

async function readDevice(store, date, deviceId) {
  const raw = await store.get(deviceKey(date, deviceId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

async function writeDevice(store, date, deviceId, rec) {
  await store.put(deviceKey(date, deviceId), JSON.stringify(rec));
}

async function handleEvent(request, env) {
  const gate = checkIngest(request.headers, env);
  if (!gate.ok) return json(401, { ok: false, error: gate.msg });

  const store = kv(env);
  if (!store) {
    return json(503, {
      ok: false,
      error: '未绑定 KV（请绑定 DAILY_STATS 或 LEVELS）',
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json(400, { ok: false, error: 'invalid json' });
  }

  const event = String(body.event || '').toLowerCase();
  if (!['start', 'heartbeat', 'pass', 'leave'].includes(event)) {
    return json(400, { ok: false, error: 'event must be start|heartbeat|pass|leave' });
  }

  const deviceId = sanitizeDeviceId(body.deviceId);
  if (!deviceId) return json(400, { ok: false, error: 'bad deviceId' });

  const date = sanitizeDate(body.date) || beijingDate();
  const now = Date.now();
  const levelId =
    body.levelId != null && Number.isFinite(Number(body.levelId))
      ? Math.floor(Number(body.levelId))
      : null;

  let rec = (await readDevice(store, date, deviceId)) || {
    deviceId,
    date,
    firstStartAt: null,
    lastSeenAt: null,
    passedAt: null,
    leftAt: null,
    levelId: null,
    status: 'unknown',
  };

  if (levelId != null) rec.levelId = levelId;
  rec.lastSeenAt = now;

  if (event === 'start') {
    if (!rec.firstStartAt) rec.firstStartAt = now;
    if (!rec.passedAt) {
      rec.status = 'playing';
      rec.leftAt = null;
    }
  } else if (event === 'heartbeat') {
    if (!rec.firstStartAt) rec.firstStartAt = now;
    if (!rec.passedAt && rec.status !== 'left') rec.status = 'playing';
  } else if (event === 'pass') {
    if (!rec.firstStartAt) rec.firstStartAt = now;
    if (!rec.passedAt) rec.passedAt = now;
    rec.status = 'passed';
  } else if (event === 'leave') {
    if (!rec.passedAt) {
      rec.status = 'left';
      rec.leftAt = now;
    }
  }

  await writeDevice(store, date, deviceId, rec);
  return json(200, { ok: true, date, event, status: rec.status });
}

async function listDayRecords(store, date) {
  const prefix = `ds:day:${date}:dev:`;
  const out = [];
  let cursor;
  do {
    const page = await store.list({ prefix, cursor, limit: 1000 });
    for (const key of page.keys || []) {
      const raw = await store.get(key.name);
      if (!raw) continue;
      try {
        out.push(JSON.parse(raw));
      } catch (_) {}
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

function summarize(records, now = Date.now()) {
  let played = 0;
  let passed = 0;
  let playingNow = 0;
  for (const r of records) {
    if (!r || !r.firstStartAt) continue;
    played++;
    if (r.passedAt) passed++;
    const recent = r.lastSeenAt && now - r.lastSeenAt <= ACTIVE_MS;
    if (recent && r.status === 'playing' && !r.passedAt) playingNow++;
  }
  const passRate = played > 0 ? Math.round((passed / played) * 1000) / 10 : 0;
  return { played, playingNow, passed, passRate };
}

async function handleSummary(request, env, dateParam) {
  const gate = checkAdmin(request, env);
  if (!gate.ok) return json(401, { ok: false, error: gate.msg });

  const store = kv(env);
  if (!store) {
    return json(503, {
      ok: false,
      error: '未绑定 KV（请绑定 DAILY_STATS 或 LEVELS）',
    });
  }

  const date = sanitizeDate(dateParam) || beijingDate();
  const records = await listDayRecords(store, date);
  const s = summarize(records);
  return json(200, {
    ok: true,
    date,
    played: s.played,
    playingNow: s.playingNow,
    passed: s.passed,
    passRate: s.passRate,
    activeWindowSec: ACTIVE_MS / 1000,
    note: '仅统计官方每日挑战；不含闯关/对弈',
    updatedAt: new Date().toISOString(),
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }

  const url = new URL(request.url);
  // /api/daily-stats[/event|/summary|/today]
  const parts = url.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  const action = (parts[2] || '').toLowerCase();

  try {
    if (request.method === 'POST' && (action === 'event' || action === '')) {
      return await handleEvent(request, env);
    }
    if (request.method === 'GET' && (action === 'summary' || action === '' || action === 'today')) {
      return await handleSummary(request, env, url.searchParams.get('date'));
    }
    return json(404, {
      ok: false,
      error: 'not found',
      hint: 'POST /api/daily-stats/event · GET /api/daily-stats/summary?date=',
    });
  } catch (e) {
    return json(500, { ok: false, error: e && e.message ? e.message : String(e) });
  }
}
