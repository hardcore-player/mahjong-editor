/**
 * 游戏统计（Cloudflare Pages Function）
 * 覆盖：每日挑战 + 闯关 + 道具（按关细分）。不含对弈。
 *
 * 路由：
 *   POST /api/daily-stats/event
 *   GET  /api/daily-stats/summary?date=YYYY-MM-DD&pass=...
 *
 * event: start|heartbeat|pass|leave|tool
 * mode:  daily|campaign
 * tool:  undo|hint|shuffle|magnet（仅 event=tool）
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

const TOOLS = ['undo', 'hint', 'shuffle', 'magnet'];
const MODES = ['daily', 'campaign'];

function emptyMode() {
  return {
    firstStartAt: null,
    lastSeenAt: null,
    passedAt: null,
    leftAt: null,
    levelId: null,
    status: 'unknown',
    levelsPlayed: {},
    levelsPassed: {},
  };
}

function emptyTools() {
  const o = {};
  for (const t of TOOLS) o[t] = { total: 0, byLevel: {} };
  return o;
}

/** 兼容旧版扁平字段 → modes.daily */
function normalizeRec(rec, deviceId, date) {
  const base = rec && typeof rec === 'object' ? rec : {};
  const out = {
    deviceId: base.deviceId || deviceId,
    date: base.date || date,
    modes: base.modes && typeof base.modes === 'object' ? base.modes : {},
    tools: base.tools && typeof base.tools === 'object' ? base.tools : emptyTools(),
  };
  if (!out.modes.daily && !out.modes.campaign && base.firstStartAt) {
    out.modes.daily = {
      firstStartAt: base.firstStartAt || null,
      lastSeenAt: base.lastSeenAt || null,
      passedAt: base.passedAt || null,
      leftAt: base.leftAt || null,
      levelId: base.levelId != null ? base.levelId : null,
      status: base.status || 'unknown',
      levelsPlayed: {},
      levelsPassed: {},
    };
  }
  for (const m of MODES) {
    if (!out.modes[m]) out.modes[m] = emptyMode();
    if (!out.modes[m].levelsPlayed) out.modes[m].levelsPlayed = {};
    if (!out.modes[m].levelsPassed) out.modes[m].levelsPassed = {};
  }
  for (const t of TOOLS) {
    if (!out.tools[t]) out.tools[t] = { total: 0, byLevel: {} };
    if (!out.tools[t].byLevel) out.tools[t].byLevel = {};
  }
  return out;
}

function summarizeMode(records, mode, now = Date.now()) {
  let played = 0;
  let passed = 0;
  let playingNow = 0;
  for (const raw of records) {
    const r = normalizeRec(raw, raw && raw.deviceId, raw && raw.date);
    const m = r.modes[mode];
    if (!m || !m.firstStartAt) continue;
    played++;
    if (m.passedAt) passed++;
    const recent = m.lastSeenAt && now - m.lastSeenAt <= ACTIVE_MS;
    if (recent && m.status === 'playing' && !m.passedAt) playingNow++;
  }
  const passRate = played > 0 ? Math.round((passed / played) * 1000) / 10 : 0;
  return { played, playingNow, passed, passRate };
}

function summarizeTools(records) {
  const totals = { undo: 0, hint: 0, shuffle: 0, magnet: 0 };
  const byLevel = {};
  for (const raw of records) {
    const r = normalizeRec(raw, raw && raw.deviceId, raw && raw.date);
    for (const t of TOOLS) {
      const block = r.tools[t] || { total: 0, byLevel: {} };
      totals[t] += block.total | 0;
      const levels = block.byLevel || {};
      for (const lv of Object.keys(levels)) {
        if (!byLevel[lv]) byLevel[lv] = { undo: 0, hint: 0, shuffle: 0, magnet: 0, total: 0 };
        const n = levels[lv] | 0;
        byLevel[lv][t] += n;
        byLevel[lv].total += n;
      }
    }
  }
  const levelRows = Object.keys(byLevel)
    .map((k) => ({ levelId: Number(k), ...byLevel[k] }))
    .sort((a, b) => a.levelId - b.levelId);
  return { totals, byLevel: levelRows };
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
  if (!['start', 'heartbeat', 'pass', 'leave', 'tool'].includes(event)) {
    return json(400, { ok: false, error: 'event must be start|heartbeat|pass|leave|tool' });
  }
  const playMode = String(body.mode || 'daily').toLowerCase();
  if (!MODES.includes(playMode)) {
    return json(400, { ok: false, error: 'mode must be daily|campaign' });
  }
  const deviceId = sanitizeDeviceId(body.deviceId);
  if (!deviceId) return json(400, { ok: false, error: 'bad deviceId' });
  const date = sanitizeDate(body.date) || beijingDate();
  const now = Date.now();
  const levelId =
    body.levelId != null && Number.isFinite(Number(body.levelId))
      ? Math.floor(Number(body.levelId))
      : null;
  const tool = String(body.tool || '').toLowerCase();
  if (event === 'tool' && TOOLS.indexOf(tool) < 0) {
    return json(400, { ok: false, error: 'tool must be undo|hint|shuffle|magnet' });
  }

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

  const rec = normalizeRec(ctx.rec, deviceId, date);
  const m = rec.modes[playMode];
  m.lastSeenAt = now;
  if (levelId != null) m.levelId = levelId;

  if (event === 'start' || event === 'heartbeat') {
    if (!m.firstStartAt) m.firstStartAt = now;
    if (!m.passedAt) {
      m.status = 'playing';
      m.leftAt = null;
    }
    if (event === 'start' && levelId != null) {
      const k = String(levelId);
      m.levelsPlayed[k] = (m.levelsPlayed[k] | 0) + 1;
    }
  } else if (event === 'pass') {
    if (!m.firstStartAt) m.firstStartAt = now;
    if (!m.passedAt) m.passedAt = now;
    m.status = 'passed';
    if (levelId != null) {
      const k = String(levelId);
      m.levelsPassed[k] = (m.levelsPassed[k] | 0) + 1;
    }
  } else if (event === 'leave') {
    if (!m.passedAt) {
      m.status = 'left';
      m.leftAt = now;
    }
  } else if (event === 'tool') {
    const block = rec.tools[tool];
    block.total = (block.total | 0) + 1;
    const lv = levelId != null ? String(levelId) : '0';
    block.byLevel[lv] = (block.byLevel[lv] | 0) + 1;
  }

  try {
    await saveDevice(env, date, deviceId, rec, ctx);
  } catch (e) {
    return json(503, { ok: false, error: e.message || String(e) });
  }
  return json(200, {
    ok: true,
    date,
    event,
    mode: playMode,
    status: m.status,
    backend: ctx.mode,
  });
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
  const daily = summarizeMode(listed.records, 'daily');
  const campaign = summarizeMode(listed.records, 'campaign');
  const tools = summarizeTools(listed.records);
  return json(200, {
    ok: true,
    date,
    // 兼容旧字段 = 每日挑战
    played: daily.played,
    playingNow: daily.playingNow,
    passed: daily.passed,
    passRate: daily.passRate,
    daily,
    campaign,
    tools,
    activeWindowSec: ACTIVE_MS / 1000,
    backend: listed.backend,
    note: '每日挑战 + 闯关 + 道具（按关）；不含对弈',
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
