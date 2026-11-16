/**
 * 每日挑战通过率统计（Cloudflare Pages Function）
 *
 * 路由：
 *   POST /api/daily-stats/event
 *   GET  /api/daily-stats/summary?date=YYYY-MM-DD&pass=...
 *
 * 存储优先级：
 *   1) KV 绑定 DAILY_STATS 或 LEVELS
 *   2) 回退 GitHub（复用工作台 GITHUB_TOKEN / GITHUB_REPO）
 *        文件：data/daily-stats/YYYY-MM-DD.json
 *
 * 口令：DAILY_STATS_PASSWORD 或 WORKBENCH_PASSWORD
 */

const ACTIVE_MS = 3 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GH_API = 'https://api.github.com';
const GH_DIR = 'data/daily-stats';

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

function beijingDate(d = new Date()) {
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

function sanitizeDeviceId(v) {
  const s = String(v || '').trim().slice(0, 80);
  if (!s || !/^[A-Za-z0-9._:-]+$/.test(s)) return null;
  return s;
}

function sanitizeDate(v) {
  const s = String(v || '').trim();
  return DATE_RE.test(s) ? s : null;
}

function kvBinding(env) {
  return (env && (env.DAILY_STATS || env.LEVELS)) || null;
}

function canGitHub(env) {
  return !!(env && env.GITHUB_TOKEN && env.GITHUB_REPO);
}

async function ghRequest(env, path, opts) {
  opts = opts || {};
  const url = `${GH_API}/repos/${env.GITHUB_REPO}${path}`;
  const r = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      Authorization: 'Bearer ' + env.GITHUB_TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'mahjong-daily-stats',
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    data = text;
  }
  if (!r.ok) {
    const err = new Error((data && data.message) || 'HTTP ' + r.status);
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}

function dayFilePath(date) {
  return `${GH_DIR}/${date}.json`;
}

async function readDayFile(env, date) {
  const branch = env.GITHUB_BRANCH || 'main';
  const path = dayFilePath(date);
  try {
    const data = await ghRequest(
      env,
      `/contents/${path}?ref=${encodeURIComponent(branch)}`,
    );
    let text = '{}';
    try {
      const bin = atob(String(data.content || '').replace(/\n/g, ''));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      text = new TextDecoder('utf-8').decode(bytes);
    } catch (_) {
      text = '{}';
    }
    const parsed = JSON.parse(text || '{}');
    return {
      sha: data.sha,
      doc: {
        date,
        devices:
          parsed && parsed.devices && typeof parsed.devices === 'object'
            ? parsed.devices
            : {},
      },
    };
  } catch (e) {
    if (e && e.status === 404) {
      return { sha: null, doc: { date, devices: {} } };
    }
    throw e;
  }
}

async function writeDayFile(env, date, doc, sha) {
  const branch = env.GITHUB_BRANCH || 'main';
  const path = dayFilePath(date);
  const text = JSON.stringify(doc, null, 2);
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const body = {
    message: `daily-stats: update ${date}`,
    content: btoa(binary),
    branch,
  };
  if (sha) body.sha = sha;
  await ghRequest(env, `/contents/${path}`, { method: 'PUT', body });
}

function deviceKey(date, deviceId) {
  return `ds:day:${date}:dev:${deviceId}`;
}

async function loadDevice(env, date, deviceId) {
  const kv = kvBinding(env);
  if (kv) {
    const raw = await kv.get(deviceKey(date, deviceId));
    if (!raw) return { mode: 'kv', rec: null };
    try {
      return { mode: 'kv', rec: JSON.parse(raw) };
    } catch (_) {
      return { mode: 'kv', rec: null };
    }
  }
  if (canGitHub(env)) {
    const { sha, doc } = await readDayFile(env, date);
    return { mode: 'github', sha, doc, rec: doc.devices[deviceId] || null };
  }
  return { mode: 'none' };
}

async function saveDevice(env, date, deviceId, rec, ctx) {
  if (ctx.mode === 'kv') {
    await kvBinding(env).put(deviceKey(date, deviceId), JSON.stringify(rec));
    return;
  }
  if (ctx.mode === 'github') {
    const doc = ctx.doc || { date, devices: {} };
    doc.date = date;
    doc.devices = doc.devices || {};
    doc.devices[deviceId] = rec;
    // 简单重试，缓解并发写冲突
    let sha = ctx.sha;
    for (let i = 0; i < 3; i++) {
      try {
        await writeDayFile(env, date, doc, sha);
        return;
      } catch (e) {
        if (e && e.status === 409) {
          const latest = await readDayFile(env, date);
          sha = latest.sha;
          latest.doc.devices = latest.doc.devices || {};
          latest.doc.devices[deviceId] = rec;
          doc.devices = latest.doc.devices;
          continue;
        }
        throw e;
      }
    }
    return;
  }
  throw new Error('无可用存储：请绑定 KV，或配置 GITHUB_TOKEN + GITHUB_REPO');
}

async function listDevices(env, date) {
  const kv = kvBinding(env);
  if (kv) {
    const prefix = `ds:day:${date}:dev:`;
    const out = [];
    let cursor;
    do {
      const page = await kv.list({ prefix, cursor, limit: 1000 });
      for (const key of page.keys || []) {
        const raw = await kv.get(key.name);
        if (!raw) continue;
        try {
          out.push(JSON.parse(raw));
        } catch (_) {}
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return { records: out, backend: 'kv' };
  }
  if (canGitHub(env)) {
    const { doc } = await readDayFile(env, date);
    return {
      records: Object.keys(doc.devices || {}).map((k) => doc.devices[k]),
      backend: 'github',
    };
  }
  throw new Error('无可用存储：请绑定 KV，或配置 GITHUB_TOKEN + GITHUB_REPO');
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

async function handleEvent(request, env) {
  const gate = checkIngest(request.headers, env);
  if (!gate.ok) return json(401, { ok: false, error: gate.msg });

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

  let ctx;
  try {
    ctx = await loadDevice(env, date, deviceId);
  } catch (e) {
    return json(503, { ok: false, error: e.message || String(e) });
  }
  if (ctx.mode === 'none') {
    return json(503, {
      ok: false,
      error: '无可用存储：请绑定 KV，或配置 GITHUB_TOKEN + GITHUB_REPO',
    });
  }

  let rec = ctx.rec || {
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

  try {
    await saveDevice(env, date, deviceId, rec, ctx);
  } catch (e) {
    return json(503, { ok: false, error: e.message || String(e) });
  }
  return json(200, { ok: true, date, event, status: rec.status, backend: ctx.mode });
}

async function handleSummary(request, env, dateParam) {
  const gate = checkAdmin(request, env);
  if (!gate.ok) return json(401, { ok: false, error: gate.msg });

  const date = sanitizeDate(dateParam) || beijingDate();
  let listed;
  try {
    listed = await listDevices(env, date);
  } catch (e) {
    return json(503, { ok: false, error: e.message || String(e) });
  }
  const s = summarize(listed.records);
  return json(200, {
    ok: true,
    date,
    played: s.played,
    playingNow: s.playingNow,
    passed: s.passed,
    passRate: s.passRate,
    activeWindowSec: ACTIVE_MS / 1000,
    backend: listed.backend,
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
