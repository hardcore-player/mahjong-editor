// generator.js - browser port of two Node generators, Node deps stripped
// 模板 T2_gong.json 内嵌;所有函数挂到 window.GEN
(function (global) {
  'use strict';

  const TEMPLATE_T2_GONG = {"levelId":1,"totalPairs":22,"tiles":[{"id":1,"layer":0,"row":-8,"col":-5,"typeId":null},{"id":2,"layer":0,"row":-8,"col":-3,"typeId":null},{"id":3,"layer":0,"row":-8,"col":-1,"typeId":null},{"id":4,"layer":0,"row":-8,"col":1,"typeId":null},{"id":5,"layer":0,"row":-8,"col":3,"typeId":null},{"id":6,"layer":0,"row":-8,"col":5,"typeId":null},{"id":7,"layer":0,"row":-6,"col":-5,"typeId":null},{"id":8,"layer":0,"row":-6,"col":-3,"typeId":null},{"id":9,"layer":0,"row":-6,"col":-1,"typeId":null},{"id":10,"layer":0,"row":-6,"col":1,"typeId":null},{"id":11,"layer":0,"row":-6,"col":3,"typeId":null},{"id":12,"layer":0,"row":-6,"col":5,"typeId":null},{"id":13,"layer":0,"row":-4,"col":-5,"typeId":null},{"id":14,"layer":0,"row":-4,"col":-3,"typeId":null},{"id":15,"layer":0,"row":-4,"col":-1,"typeId":null},{"id":16,"layer":0,"row":-4,"col":1,"typeId":null},{"id":17,"layer":0,"row":-4,"col":3,"typeId":null},{"id":18,"layer":0,"row":-4,"col":5,"typeId":null},{"id":19,"layer":0,"row":-2,"col":-3,"typeId":null},{"id":20,"layer":0,"row":-2,"col":-1,"typeId":null},{"id":21,"layer":0,"row":-2,"col":1,"typeId":null},{"id":22,"layer":0,"row":-2,"col":3,"typeId":null},{"id":23,"layer":0,"row":0,"col":-3,"typeId":null},{"id":24,"layer":0,"row":0,"col":-1,"typeId":null},{"id":25,"layer":0,"row":0,"col":1,"typeId":null},{"id":26,"layer":0,"row":0,"col":3,"typeId":null},{"id":27,"layer":0,"row":2,"col":-5,"typeId":null},{"id":28,"layer":0,"row":2,"col":-3,"typeId":null},{"id":29,"layer":0,"row":2,"col":-1,"typeId":null},{"id":30,"layer":0,"row":2,"col":1,"typeId":null},{"id":31,"layer":0,"row":2,"col":3,"typeId":null},{"id":32,"layer":0,"row":2,"col":5,"typeId":null},{"id":33,"layer":0,"row":4,"col":-5,"typeId":null},{"id":34,"layer":0,"row":4,"col":-3,"typeId":null},{"id":35,"layer":0,"row":4,"col":-1,"typeId":null},{"id":36,"layer":0,"row":4,"col":1,"typeId":null},{"id":37,"layer":0,"row":4,"col":3,"typeId":null},{"id":38,"layer":0,"row":4,"col":5,"typeId":null},{"id":39,"layer":0,"row":6,"col":-5,"typeId":null},{"id":40,"layer":0,"row":6,"col":-3,"typeId":null},{"id":41,"layer":0,"row":6,"col":-1,"typeId":null},{"id":42,"layer":0,"row":6,"col":1,"typeId":null},{"id":43,"layer":0,"row":6,"col":3,"typeId":null},{"id":44,"layer":0,"row":6,"col":5,"typeId":null}],"specialTiles":[]};

  // ===== shape_generator =====
// shape_generator_v17_std.js  （std = 标准坐标）
// 基于模板的规则生成器 —— 与 v17 相同的算法，但导出用【标准坐标约定】：
//   row = 上下（纵），col = 左右（横）
// 内部算法仍用 row=横/col=纵 运算（不改动，风险最低），只在 toEditorJSON 导出处交换 row/col。
// 原 shape_generator_v17.js 保持不动。
//
// 输入：模板（任意 L0 形状 + 可选 L1+）
// 输出：每个种子生成不同形状的变体（JSON 为 std 坐标）


// ========== 工具 ==========
function shuffle(arr, rng) {
  rng = rng || Math.random;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function keyOf(row, col) { return `${row},${col}`; }
function mirrorRow(row) { return -row; }
function inBounds(row, col) {
  return row >= -5 && row <= 5 && col >= -8 && col <= 6;
}

// ========== 支撑（象限规则） ==========
function quadCovered(lowerArr, r, c) {
  return lowerArr.some(lt => lt.row <= r && r < lt.row + 2 && lt.col <= c && c < lt.col + 2);
}

function hasSupport(row, col, lowerArr) {
  const quads = [[row, col], [row, col + 1], [row + 1, col], [row + 1, col + 1]];
  let covered = 0;
  quads.forEach(([r, c]) => { if (quadCovered(lowerArr, r, c)) covered++; });
  return covered === 4;
}

// 兜底：校验整关每张"可消麻将"(排除吐牌机本体,它不是可消的牌)是否被下方任意层托住(象限规则)。
// validateShape 只在校对偶化/装配前的 shape；mirror 展开、偶化删牌、队列/回填重排都可能让上层牌悬空,
// 用这份在【最终输出】上的检查兜底:但凡有一张悬空就判该塔形不可用(让上层循环重搭新塔形)。
// 注意:这里必须用"只看正下方一层"的严格口径(与编辑器悬空判定 hasSupportAtLayer 一致)。
// 曾经是"看所有下层"的宽松口径——隔层桥牌能过这关,却被编辑器判悬空报"支撑限制未通过"。
function levelHasFullSupport(arr) {
  const playable = arr.filter(t => t.type !== 'spitter');
  for (let i = 0; i < playable.length; i++) {
    const t = playable[i];
    if (t.layer <= 0) continue;
    const lower = playable.filter(o => o !== t && o.layer === t.layer - 1);
    if (!hasSupport(t.row, t.col, lower)) return false;
  }
  return true;
}

// ========== 模板加载 ==========
function loadTemplate(jsonInput) {
  const json = jsonInput;
  const layerMap = {};
  json.tiles.forEach(t => {
    const l = t.layer;
    if (!layerMap[l]) layerMap[l] = [];
    layerMap[l].push({ row: t.row, col: t.col });
  });
  const layerNums = Object.keys(layerMap).map(Number).sort((a, b) => a - b);
  return {
    layers: layerNums.map(l => ({ layer: l, cells: layerMap[l] })),
    layerCount: layerNums.length,
  };
}

// ========== 散落策略 ==========
// 从候选位置挑牌。mode='ordered' 按行列有序密排（互锁，喂饱上一层）；mode='random' 随机有机
function generateLayer(lowerArr, lowerKeys, style, count, mode = 'ordered', mirror = true) {
  const candidates = [];
  for (let row = 0; row <= 5; row++) {
    for (let col = -8; col <= 6; col++) {
      if (!inBounds(row, col)) continue;
      if (!hasSupport(row, col, lowerArr)) continue;
      if (lowerKeys.has(keyOf(row, col))) continue;

      // 位置偏好过滤
      if (style.positionBias === 'left' && col > 0) continue;
      if (style.positionBias === 'right' && col < 0) continue;
      if (style.positionBias === 'edge' && col > -2 && col < 2) continue;

      // 行偏好：仅在排序里给偏好行靠前（不排除其他行）
      let order = Infinity;
      if (style.rowBias) {
        const idx = style.rowBias.indexOf(row);
        if (idx >= 0) order = idx;
      }

      candidates.push({ row, col, order });
    }
  }

  if (candidates.length === 0) return new Set();

  // ordered：偏好行优先，其次行列有序密排（互锁喂上层）
  // random：打乱后随机挑（有机变化）
  // 先 shuffle 再稳定排序：ordered 同优先级内不再固定从 row0 开始（旧插入序),
  // 否则视觉边列(内部 row±5)永远排最后,~13 张配额经常轮不到 → 边列 L1 覆盖率仅 ~26%
  shuffle(candidates);
  if (mode === 'ordered') candidates.sort((a, b) => a.order - b.order);

  const selected = new Set();
  // 边列保底(仅 L1/ordered):先在视觉最边列占 1 张(候选 row ≥ 最大row-1,含跨列半格位),
  // 再铺其余——纯随机时边列 ~52% 整列落空(实测 L1 覆盖率仅 48%),整列全可点。
  // mirror 展开会自动补对称侧;L2+ 不保底(桥式支撑已让它们 98% 覆盖边列)。
  if (mode === 'ordered' && candidates.length > 0) {
    const maxRow = Math.max(...candidates.map(c => c.row));
    const edgePool = candidates.filter(c => c.row >= maxRow - 1);
    if (edgePool.length > 0) {
      shuffle(edgePool);
      const e = edgePool[0];
      selected.add(keyOf(e.row, e.col));
    }
  }
  for (const cand of candidates) {
    if (selected.size >= count) break;
    let tooClose = false;
    for (const k of selected) {
      const [r, c] = k.split(',').map(Number);
      if (Math.abs(cand.row - r) < 2 && Math.abs(cand.col - c) < 2) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    // 无全覆盖：仅镜像模式时，镜像位置也不能和下层完全重合
    if (mirror) {
      const mr = mirrorRow(cand.row); // row-mirror（内部坐标）
      if (lowerKeys.has(keyOf(mr, cand.col))) continue;
    }
    selected.add(keyOf(cand.row, cand.col));
  }

  return expandMirrorWithLimit(selected, count, mirror);
}

function expandMirrorWithLimit(left, count, mirror = true) {
  const full = new Set(left);
  if (mirror) {
    left.forEach(function(k) {
      var p = k.split(',').map(Number), r = p[0], c = p[1];
      var mr = mirrorRow(r);
      if (mr !== r) full.add(mr + ',' + c);
    });
  }
  if (full.size > 0) {
    var symmetryErrors = 0;
    full.forEach(function(k){ var p=k.split(','),r=+p[0],c=+p[1]; if(!full.has(-r+','+c)) symmetryErrors++; });
    if (symmetryErrors > 0) console.warn('[dbg] asymmetric layer! full=' + full.size + ' errors=' + symmetryErrors + ' selected=' + left.size + ' sample=' + [...left].slice(0,3).join(' '));
  }
  return full;
}

// ========== 主生成 ==========
// 从模板生成关卡（L0 保持原样，L1+ 完全随机生成）
// 无风格、无偏置：每次调用随机抽取金字塔目标和行偏好，始终保持中心化塔
function generateFromTemplate(template, options = {}) {
  const templateLayerCount = template.layerCount;
  const generateLayerCount = options.layerCount ?? templateLayerCount;
  // mirror=false：底座不对称时，上层按底座实际形状堆，不做镜像展开
  const mirror = options.mirror !== false;

  // 随机金字塔目标（镜像展开前约×2）
  // L1 是骨架要够密，往上递减；每层加随机抖动制造差异
  const baseTargets = [13, 9, 6, 4, 2]; // L1..L5 基础
  const style = {
    // 随机行偏好：从中抽 1~3 行作排序优先（只影响先填哪行，不排除其他行）
    rowBias: options.rowBias ?? [1, 3, 5].slice(0, 1 + Math.floor(Math.random() * 3)),
    colOffset: 0,
  };

  function calcCount(layerIdx, totalLayers) {
    const b = baseTargets[layerIdx - 1] ?? 2;
    const jitter = 0.7 + Math.random() * 0.6; // 0.7 ~ 1.3 随机抖动
    return Math.max(2, Math.round(b * jitter));
  }

  // 使用编辑器已有的层（L0, L1, ...），只生成缺少的层
  const newLayers = [];
  for (let l = 0; l < template.layers.length; l++) {
    newLayers.push({ layer: l, cells: [...template.layers[l].cells] });
  }
  // 如果编辑器层数不够，继续往上堆
  for (let l = template.layers.length; l < generateLayerCount; l++) {
    // 支撑只看正下方一层(与编辑器悬空判定 hasSupportAtLayer 同规则——
    // 曾经试过放宽为"看所有下层"(桥式搭放),结果编辑器把隔层牌全判悬空报
    // "支撑限制未通过",两端规则打架,已回退)
    const lowerArr = newLayers[l - 1].cells;
    const lowerKeys = new Set(lowerArr.map(c => keyOf(c.row, c.col)));
    const count = calcCount(l, generateLayerCount);
    const mode = l === 1 ? 'ordered' : 'random';
    const selected = generateLayer(lowerArr, lowerKeys, style, count, mode, mirror);
    const arr = Array.from(selected).map(k => {
      const [r, c] = k.split(',').map(Number);
      return { row: r, col: c };
    });
    newLayers.push({ layer: l, cells: arr });
  }

  // 应用 colOffset（上靠/下靠风格）：整体平移所有上层
  if (style.colOffset !== 0) {
    for (let l = 1; l < newLayers.length; l++) {
      const delta = style.colOffset;
      const left = newLayers[l].cells.filter(c => c.row >= 0);
      if (left.length === 0) continue;
      const shifted = left.map(c => ({ row: c.row, col: c.col + delta }));
      if (shifted.some(c => !inBounds(c.row, c.col))) continue;
      const lowerArr = newLayers[l - 1].cells;
      const lowerKeys = new Set(lowerArr.map(c => keyOf(c.row, c.col)));
      let overlap = false;
      for (const c of shifted) {
        if (lowerKeys.has(keyOf(c.row, c.col))) { overlap = true; break; }
      }
      if (overlap) continue;
      const newFull = [];
      for (const c of shifted) {
        newFull.push({ row: c.row, col: c.col });
        if (mirrorRow(c.row) !== c.row) {
          newFull.push({ row: mirrorRow(c.row), col: c.col });
        }
      }
      newLayers[l].cells = newFull;
    }
  }

  const tiles = [];
  newLayers.forEach(ld => {
    ld.cells.forEach(c => {
      tiles.push({ id: 0, layer: ld.layer, row: c.row, col: c.col, typeId: null });
    });
  });

  return {
    tiles,
    layers: newLayers.length,
    layerCounts: newLayers.map(l => l.cells.length),
    styleName: '随机',
    styleIdx: 0,
  };
}

// ========== 校验 ==========
function validateShape(shape, opts = {}) {
  const errors = [];
  const byLayer = {};
  shape.tiles.forEach(t => {
    if (!byLayer[t.layer]) byLayer[t.layer] = [];
    byLayer[t.layer].push(t);
  });

  const layerNums = Object.keys(byLayer).map(Number).sort((a, b) => a - b);
  if (layerNums.length === 0) return { ok: true, errors: [] };

  // 对称（skipSymmetry=true 时跳过：底座不对称时，上层按实际形状堆，不要求镜像）
  // 内部坐标用 row-mirror（对应 std 坐标的 col-mirror = 左右视觉对称），与底座检测、堆塔展开保持一致
  if (!opts.skipSymmetry) {
    layerNums.forEach(l => {
      const set = new Set(byLayer[l].map(t => keyOf(t.row, t.col)));
      byLayer[l].forEach(t => {
        if (!set.has(keyOf(mirrorRow(t.row), t.col))) {
          errors.push(`[对称] L${l}(${t.row},${t.col})`);
        }
      });
    });
  }

  // 支撑:只看正下方一层(与编辑器悬空判定 hasSupportAtLayer 同规则,别放宽成桥式)
  layerNums.forEach(l => {
    if (l === 0) return;
    byLayer[l].forEach(t => {
      if (!hasSupport(t.row, t.col, byLayer[l - 1])) {
        errors.push(`[支撑] L${l}(${t.row},${t.col})`);
      }
    });
  });

  // 同层冲突:只允许完全重合才算冲突(相邻是合法的)
  layerNums.forEach(l => {
    const arr = byLayer[l];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (arr[i].row === arr[j].row && arr[i].col === arr[j].col) {
          errors.push(`[冲突] L${l}(${arr[i].row},${arr[i].col})`);
        }
      }
    }
  });

  // 全覆盖
  layerNums.forEach(l => {
    if (l === 0) return;
    const lowerKeys = new Set(byLayer[l - 1].map(t => keyOf(t.row, t.col)));
    byLayer[l].forEach(t => {
      if (lowerKeys.has(keyOf(t.row, t.col))) {
        errors.push(`[全覆盖] L${l}(${t.row},${t.col})`);
      }
    });
  });

  return { ok: errors.length === 0, errors };
}

// ========== 导出 JSON ==========
function toEditorJSON(shape, levelId = 1, skipParity = false) {
  let tiles = shape.tiles.map(t => ({
    id: 0, layer: t.layer, row: t.row, col: t.col, typeId: null,
  }));

  if (!skipParity && tiles.length % 2 !== 0) {
    const subTiles = shape.tiles.map(t => ({ layer: t.layer, row: t.row, col: t.col }));
    let removedOne = false;
    for (let l = shape.layers - 1; l >= 0; l--) {
      const lt = subTiles.filter(t => t.layer === l);
      const axis = lt.find(t => mirrorRow(t.row) === t.row);
      if (axis) {
        tiles = tiles.filter(t =>
          !(t.layer === axis.layer && t.row === axis.row && t.col === axis.col)
        );
        removedOne = true;
        break;
      }
    }
    if (!removedOne) {
      let removed = 0;
      for (let l = shape.layers - 1; l >= 0 && removed < 2; l--) {
        const lt = subTiles.filter(t => t.layer === l);
        const nonAxis = lt.find(t => mirrorRow(t.row) !== t.row);
        if (nonAxis) {
          const mr = mirrorRow(nonAxis.row);
          const mirror = lt.find(t => t.row === mr && t.col === nonAxis.col);
          if (mirror) {
            tiles = tiles.filter(t =>
              !(t.layer === nonAxis.layer && t.row === nonAxis.row && t.col === nonAxis.col) &&
              !(t.layer === mirror.layer && t.row === mirror.row && t.col === mirror.col)
            );
            for (let i = subTiles.length - 1; i >= 0; i--) {
              if (subTiles[i].layer === nonAxis.layer && subTiles[i].row === nonAxis.row && subTiles[i].col === nonAxis.col) subTiles.splice(i, 1);
              if (subTiles[i].layer === mirror.layer && subTiles[i].row === mirror.row && subTiles[i].col === mirror.col) subTiles.splice(i, 1);
            }
            removed++;
          }
        }
      }
    }
  }

  tiles.sort((a, b) => a.layer - b.layer || a.row - b.row || a.col - b.col);
  tiles.forEach((t, i) => t.id = i + 1);

  // std：导出示【标准坐标】row=上下(纵)、col=左右(横)。
  // 内部运算用的是 row=横/col=纵，这里把每个牌的值交换后再导出。
  tiles.forEach(t => { const tmp = t.row; t.row = t.col; t.col = tmp; });

  return {
    levelId,
    totalPairs: Math.floor(tiles.length / 2),
    tiles,
    specialTiles: [],
  };
}

// ========== ASCII 预览 ==========
function drawShape(shape, title = '') {
  const { tiles, layers, layerCounts } = shape;
  let out = `═══ ${title} ═══\n`;
  out += `${tiles.length}张 / ${layerCounts.join(' → ')} / ${layers}层 / ${shape.styleName || ''}\n\n`;

  const minRow = -6, maxRow = 7;
  const minCol = -9, maxCol = 9;
  const w = maxRow - minRow + 1, h = maxCol - minCol + 1;
  const grid = Array.from({length: h}, () => Array(w).fill('·'));
  const chars = ['0','1','2','3','4','5','6'];

  for (const t of tiles) {
    const ch = chars[t.layer] || '?';
    for (let dr = 0; dr < 2; dr++) {
      for (let dc = 0; dc < 2; dc++) {
        const r = t.row + dr - minRow;
        const c = t.col + dc - minCol;
        if (r >= 0 && r < w && c >= 0 && c < h) {
          const cur = grid[c][r];
          const curL = cur === '·' ? -1 : parseInt(cur);
          if (t.layer > curL) grid[c][r] = ch;
        }
      }
    }
  }

  out += '┌' + '─'.repeat(w) + '┐\n';
  for (let c = 0; c < h; c++) {
    out += '│' + grid[c].join('') + '│\n';
  }
  out += '└' + '─'.repeat(w) + '┘\n';

  return out;
}

  // ===== generate_fill =====
// generate_fill_std.js —— 一键「生成布局 + 填花色」直接出成品（std 坐标）
// 用法：node generate_fill_std.js <模板名> [数量] [dark|plain]
//   <模板名>：模板/ 目录下的文件名（不带 .json），如 T2_gong
//   [数量]  ：生成的关数，默认 24（上限 200）
//   [模式]  ：dark=暗牌（默认） / plain=普通（不带暗牌）
//
// 一步到位，不再经过 batch_<TAG> 中间目录：
//   生成随机布局（内存）→ 倒推填花色（100% 可解）→ 直接写成品到 <TAG>_暗/ 或 <TAG>_填色/
// 系列 TAG = 模板名第一段（下划线前）。
// 层数自动判断：纯 L0 底子模板 → 堆 6 层；自带多层模板 → 用模板自己的层数。


// ============ 34 种麻将牌 ============
const NAMES = [];
for (let i = 1; i <= 9; i++) NAMES.push('万' + i);
for (let i = 1; i <= 9; i++) NAMES.push('条' + i);
for (let i = 1; i <= 9; i++) NAMES.push('筒' + i);
['东', '西', '南', '北', '中', '发', '白'].forEach(n => NAMES.push(n));
const TYPE_COUNT = NAMES.length; // 34

// ============ 暗牌参数（可调） ============
const DARK_RATIO_MIN = 0.10; // 每关暗牌数下限 ≈ 总牌 × 10%
const DARK_RATIO_MAX = 0.20; // 每关暗牌数上限 ≈ 总牌 × 20%（每关在区间内随机浮动）
const DARK_WEIGHT = 20;      // 暗钩子难度权重

// ============ 可种子化 RNG (mulberry32) ============
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============ 几何 ============
function covers(a, b) {
  return a.layer > b.layer && Math.abs(a.row - b.row) < 2 && Math.abs(a.col - b.col) < 2;
}

// ============ 节奏填色 ============
// 先沿自然翻牌把大约两成的牌配成同时能消的对，开局连着消。
// 到这一步时，场上只留一种能消的花色当诱饵，其余能点的牌都是新花色的单张。
// 只消对子会把诱饵消掉，然后被盖住的两张同花色永远凑不齐。
// 要过关，得先把那张不成对的关键牌放进卡槽。
function paceNote(tag) {
  (globalThis.__paceWhy = globalThis.__paceWhy || []).push(tag);
}
function pacedFill(tiles, rng) {
  const n = tiles.length;
  if (n < 8 || n % 2) { paceNote('tiny'); return null; }
  const items = tiles.map(function (t, idx) {
    return {
      layer: t.layer, row: t.row, col: t.col, _idx: idx,
      spitterOrder: t.spitterOrder == null ? null : t.spitterOrder
    };
  });
  function cellKey(t) { return t.layer + ',' + t.row + ',' + t.col; }
  function posKey(t) { return t.row + ',' + t.col; }
  function visibleOf(list) {
    const plain = [];
    const queues = new Map();
    list.forEach(function (t) {
      if (t.spitterOrder == null) plain.push(t);
      else {
        const k = cellKey(t);
        if (!queues.has(k)) queues.set(k, []);
        queues.get(k).push(t);
      }
    });
    const occ = new Set(plain.map(cellKey));
    const out = plain.slice();
    queues.forEach(function (arr, k) {
      if (occ.has(k)) return;
      arr.sort(function (a, b) { return a.spitterOrder - b.spitterOrder; });
      out.push(arr[0]);
    });
    return out;
  }
  function clickableIn(set) {
    const vis = visibleOf(items.filter(function (t) { return set.has(t._idx); }));
    return vis.filter(function (t) { return isClickable(t, vis); });
  }
  function freshFrom(counts, avoid) {
    for (let pass = 0; pass < 2; pass++) {
      for (let s = 1; s <= TYPE_COUNT; s++) {
        const c = counts[s] || 0;
        if (c >= 3) continue;
        if (avoid && avoid[s]) continue;
        if (pass === 0 && c) continue;
        counts[s] = c + 1;
        return s;
      }
    }
    return 0;
  }
  // 开场尽量重复已经出现过的花色，把新花色留到中段的诱饵。
  function freshReuse(counts, avoid) {
    for (let pass = 0; pass < 2; pass++) {
      for (let s = 1; s <= TYPE_COUNT; s++) {
        const c = counts[s] || 0;
        if (c >= 3) continue;
        if (avoid && avoid[s]) continue;
        if (pass === 0 && !c) continue;
        if (pass === 1 && c) continue;
        counts[s] = c + 1;
        return s;
      }
    }
    return 0;
  }
  function belowOf(set, t) {
    return items.filter(function (j) {
      return set.has(j._idx) && j.spitterOrder == null && j.row === t.row && j.col === t.col && j.layer < t.layer;
    }).sort(function (a, b) { return b.layer - a.layer; });
  }

  const counts0 = {};
  const suit0 = {};
  let rem0 = new Set(items.map(function (t) { return t._idx; }));
  let guard = 0;
  while (guard++ < n) {
    const free = clickableIn(rem0);
    if (free.length < 4) break;
    const wave = Math.floor(free.length / 2);
    const removed = n - rem0.size;
    const next = removed + wave * 2;
    if (removed / n >= 0.18) break;
    if (next / n > 0.28 && removed / n >= 0.12) break;
    shuffle(free, rng);
    const waveAvoid = {};
    for (let k = 0; k < wave; k++) {
      const s = freshReuse(counts0, waveAvoid);
      if (!s) { paceNote('fresh'); return null; }
      waveAvoid[s] = 1;
      suit0[free[2 * k]._idx] = suit0[free[2 * k + 1]._idx] = s;
      rem0.delete(free[2 * k]._idx);
      rem0.delete(free[2 * k + 1]._idx);
    }
  }
  if (n - rem0.size < 4) { paceNote('short' + (n - rem0.size)); return null; }

  function freedBy(set, cover, target) {
    if (!cover || !target || !set.has(cover._idx) || !set.has(target._idx) || cover._idx === target._idx) return false;
    const next = new Set(set);
    next.delete(cover._idx);
    return clickableIn(next).some(function (t) { return t._idx === target._idx; });
  }
  function chainOk(set, Q, C, D, P) {
    if (!Q || !C || !D || !P) return false;
    const s1 = new Set(set);
    s1.delete(Q._idx);
    if (!clickableIn(s1).some(function (t) { return t._idx === C._idx; })) return false;
    s1.delete(C._idx);
    if (!clickableIn(s1).some(function (t) { return t._idx === D._idx; })) return false;
    s1.delete(D._idx);
    return clickableIn(s1).some(function (t) { return t._idx === P._idx; });
  }
  function deferrable(set, t) {
    const below = belowOf(set, t)[0];
    return !!(below && freedBy(set, t, below));
  }

  // 把「点掉也救不出同伴」的明牌继续成对消掉。消不动时，改挖一张能救出同伴的牌，换一层几何。
  let guardR = 0;
  let stall = 0;
  let prevExtra = 999;
  while (guardR++ < n && (n - rem0.size) / n < 0.58) {
    const free = clickableIn(rem0);
    const keep = new Set();
    const qIds = new Set();
    free.forEach(function (t) {
      const u = belowOf(rem0, t);
      if (u.length >= 3 && chainOk(rem0, t, u[0], u[1], u[2])) { keep.add(t._idx); qIds.add(t._idx); }
      if (deferrable(rem0, t)) keep.add(t._idx);
    });
    if (!qIds.size) break;
    const extras = free.filter(function (t) { return !keep.has(t._idx); });
    if (extras.length >= prevExtra) stall++; else stall = 0;
    prevExtra = extras.length;
    let pair = null;
    if (extras.length >= 2 && stall > 8) {
      const buddy = free.find(function (t) { return keep.has(t._idx) && !qIds.has(t._idx); });
      shuffle(extras, rng);
      pair = buddy ? [extras[0], buddy] : [extras[0], extras[1]];
    } else if (extras.length >= 2) {
      shuffle(extras, rng);
      pair = [extras[0], extras[1]];
    } else if (extras.length === 1) {
      const buddy = free.find(function (t) { return t !== extras[0] && !qIds.has(t._idx); });
      if (buddy) pair = [extras[0], buddy];
    }
    if (!pair) break;
    const s = freshReuse(counts0);
    if (!s) break;
    suit0[pair[0]._idx] = suit0[pair[1]._idx] = s;
    rem0.delete(pair[0]._idx);
    rem0.delete(pair[1]._idx);
  }

  const freeNow = clickableIn(rem0);
  const qCands = freeNow.filter(function (t) {
    if (t.spitterOrder != null) return false;
    const u = belowOf(rem0, t);
    return u.length >= 3 && chainOk(rem0, t, u[0], u[1], u[2]);
  });
  shuffle(qCands, rng);

  function attempt(Q, C, D, P, A, B) {
    const prot = new Set([Q, C, D, P, A, B].map(function (t) { return t._idx; }));
    if (prot.size < 6) { paceNote('overlap'); return null; }
    const rem = new Set(rem0);
    const suit = Object.assign({}, suit0);
    const counts = Object.assign({}, counts0);
    function fresh() { return freshFrom(counts); }
    const bait = fresh();
    const key = fresh();
    if (!bait || !key) { paceNote('nokey'); return null; }
    counts[bait] = 3;
    counts[key] = 3;
    if ([A, B, C, D, Q, P].some(function (t) { return suit[t._idx]; })) { paceNote('painted'); return null; }
    suit[A._idx] = suit[B._idx] = suit[C._idx] = suit[D._idx] = bait;
    suit[Q._idx] = suit[P._idx] = key;
    const avoid = {};
    freeNow.forEach(function (t) { if (suit[t._idx]) avoid[suit[t._idx]] = 1; });
    const fset = new Set(freeNow.map(function (t) { return t._idx; }));
    const taken = new Set();
    let deferOk = true;
    freeNow.forEach(function (t) {
      if (!deferOk || suit[t._idx] || prot.has(t._idx)) return;
      let partner = null;
      const below = belowOf(rem, t).filter(function (j) {
        return !suit[j._idx] && !prot.has(j._idx) && !taken.has(j._idx);
      })[0];
      if (below && freedBy(rem, t, below)) partner = below;
      if (!partner) {
        partner = items.find(function (j) {
          return rem.has(j._idx) && !suit[j._idx] && !prot.has(j._idx) && !fset.has(j._idx) && !taken.has(j._idx) && freedBy(rem, t, j);
        });
      }
      if (!partner) { deferOk = false; paceNote('defer-mate'); return; }
      const s = freshFrom(counts, avoid);
      if (!s) { deferOk = false; paceNote('defer-suit'); return; }
      suit[t._idx] = suit[partner._idx] = s;
      avoid[s] = 1;
      taken.add(partner._idx);
    });
    if (!deferOk) { paceNote('defer'); return null; }

    function matchCount(set) {
      const by = {};
      clickableIn(set).forEach(function (t) {
        const s = suit[t._idx];
        if (!s) return;
        by[s] = (by[s] || 0) + 1;
      });
      let m = 0;
      Object.keys(by).forEach(function (k) { if (by[k] >= 2) m++; });
      return m;
    }
    if (matchCount(rem) !== 1) { paceNote('match'+matchCount(rem)); return null; }
    const decision = new Set(rem);
    const slots = [];
    const rem2 = new Set(rem);
    function play(idx) {
      if (!rem2.has(idx)) return false;
      if (!clickableIn(rem2).some(function (t) { return t._idx === idx; })) return false;
      const s = suit[idx];
      const at = slots.indexOf(s);
      if (at >= 0) slots.splice(at, 1);
      else if (slots.length >= 4) return false;
      else slots.push(s);
      rem2.delete(idx);
      return true;
    }
    if (!play(Q._idx) || !play(A._idx) || !play(C._idx) || !play(B._idx) || !play(D._idx) || !play(P._idx)) {
      paceNote('play');
      return null;
    }
    if (slots.length) { paceNote('slots'+slots.length); return null; }
    let stall = 0;
    let steps = 0;
    while (rem2.size && steps++ < n * 3) {
      const before = rem2.size;
      const free = clickableIn(rem2);
      const hit = free.find(function (t) { return slots.indexOf(suit[t._idx]) >= 0; });
      if (hit) {
        if (!play(hit._idx)) { paceNote('rest-hit'); return null; }
      } else {
        const by = {};
        free.forEach(function (t) {
          if (!suit[t._idx]) return;
          (by[suit[t._idx]] = by[suit[t._idx]] || []).push(t);
        });
        let pair = null;
        Object.keys(by).forEach(function (k) { if (!pair && by[k].length >= 2) pair = by[k]; });
        if (pair) {
          if (!play(pair[0]._idx) || !play(pair[1]._idx)) { paceNote('rest-pair'); return null; }
        } else {
          const un = free.filter(function (t) { return !suit[t._idx]; });
          if (un.length >= 2) {
            const s = fresh();
            if (!s) { paceNote('rest-fresh'); return null; }
            suit[un[0]._idx] = suit[un[1]._idx] = s;
            if (!play(un[0]._idx) || !play(un[1]._idx)) { paceNote('rest-play2'); return null; }
          } else {
            const opener = free.find(function (t) {
              if (!suit[t._idx] || slots.length >= 3) return false;
              const mate = items.find(function (j) {
                return rem2.has(j._idx) && suit[j._idx] === suit[t._idx] && j._idx !== t._idx;
              });
              return mate && freedBy(rem2, t, mate);
            });
            if (opener) {
              if (!play(opener._idx)) { paceNote('rest-open'); return null; }
            } else if (un.length === 1) {
              const t = un[0];
              const mate = items.find(function (j) {
                return rem2.has(j._idx) && !suit[j._idx] && j._idx !== t._idx && freedBy(rem2, t, j);
              });
              if (!mate) { paceNote('rest-below'); return null; }
              const s = fresh();
              if (!s) { paceNote('rest-fresh2'); return null; }
              suit[t._idx] = suit[mate._idx] = s;
              if (slots.length >= 3 || !play(t._idx)) { paceNote('rest-slot'); return null; }
            } else {
              paceNote('rest-stuck' + free.length + 's' + slots.length);
              return null;
            }
          }
        }
      }
      if (rem2.size === before) {
        if (++stall > 2) { paceNote('rest-stall'); return null; }
      } else stall = 0;
    }
    if (rem2.size || slots.length) { paceNote('rest'+rem2.size); return null; }
    if (matchCount(decision) !== 1) { paceNote('after'+matchCount(decision)); return null; }
    const tally = {};
    let missing = false;
    items.forEach(function (t) {
      if (!suit[t._idx]) { missing = true; return; }
      tally[suit[t._idx]] = (tally[suit[t._idx]] || 0) + 1;
    });
    if (missing) { paceNote('missing'); return null; }
    if (Object.keys(tally).some(function (k) { return tally[k] % 2 !== 0; })) { paceNote('odd'); return null; }
    const greedy = new Set(items.map(function (t) { return t._idx; }));
    let gsteps = 0;
    let sawFun = false;
    let stuckFree = 0;
    while (greedy.size && gsteps++ < n * 2) {
      const free = clickableIn(greedy);
      const removed = n - greedy.size;
      const by = {};
      free.forEach(function (t) { (by[suit[t._idx]] = by[suit[t._idx]] || []).push(t); });
      let pair = null;
      let matches = 0;
      Object.keys(by).forEach(function (k) {
        if (by[k].length >= 2) {
          matches++;
          if (!pair) pair = by[k];
        }
      });
      if (removed / n <= 0.3 && matches >= 2) sawFun = true;
      if (!pair) { stuckFree = free.length; break; }
      greedy.delete(pair[0]._idx);
      greedy.delete(pair[1]._idx);
    }
    if (!greedy.size || greedy.size < n * 0.45 || stuckFree < 8 || !sawFun) {
      paceNote('curve');
      return null;
    }
    [A, B, C, D, Q, P].forEach(function (t) { tiles[t._idx]._keepFace = true; });
    return { assigned: items.map(function (t) { return suit[t._idx]; }), pairsPlaced: [] };
  }

  let triedQ = 0;
  for (let qi = 0; qi < qCands.length && triedQ < 4; qi++) {
    const Q = qCands[qi];
    const under = belowOf(rem0, Q);
    const C = under[0], D = under[1], P = under[2];
    const others = freeNow.filter(function (t) { return t !== Q && posKey(t) !== posKey(Q); });
    shuffle(others, rng);
    let tried = 0;
    for (let i = 0; i < others.length && tried < 6; i++) {
      for (let j = i + 1; j < others.length && tried < 6; j++) {
        tried++;
        const got = attempt(Q, under[0], under[1], under[2], others[i], others[j]);
        if (got) return got;
      }
    }
    triedQ++;
  }
  paceNote('noq' + qCands.length + 'f' + freeNow.length + 'r' + (n - rem0.size));
  return null;
}


// slotPressure: 0~1 槽位压力偏好。越大越倾向配"层高差大"的对(一张早露、一张深埋)，
// 正向玩时玩家被迫把早露那张存进卡槽 -> 槽位占用升高、容错率降低
function legacyBackwardFill(tiles, rng, slotPressure) {
  const n = tiles.length;
  const totalPairs = n / 2;
  if (totalPairs !== Math.floor(totalPairs)) throw new Error(`牌数为奇数 ${n}`);
  slotPressure = slotPressure != null ? slotPressure : 0.5;

  const counts = new Array(TYPE_COUNT).fill(0);
  let placedPairs = 0;
  while (placedPairs < totalPairs) {
    const eligible = [];
    for (let t = 0; t < TYPE_COUNT; t++) if (counts[t] < 3) eligible.push(t);
    const t = eligible[Math.floor(rng() * eligible.length)];
    counts[t]++;
    placedPairs++;
  }
  const typePool = [];
  counts.forEach((c, t) => { for (let k = 0; k < c; k++) typePool.push(t + 1); });
  shuffle(typePool, rng);

  const assigned = new Array(n).fill(0);
  const pairsPlaced = [];
  let remaining = tiles.map((t, idx) => ({ ...t, _idx: idx }));

  let guard = 0;
  while (remaining.length > 0) {
    if (++guard > n * 4) return null;
    const clickable = remaining.filter(t => isClickable(t, remaining));
    if (clickable.length < 2) return null;

    const type = typePool[pairsPlaced.length];
    let t1, t2;

    // 叠层配对:倒推前中期(棋盘还满)按概率把一张最高层 + 一张最低层配对
    // 倒推的逆序 = 正向消除序列 -> 早配的对(带高层张)在正向玩时很晚才消,低层那张一直压着
    const progress = pairsPlaced.length / totalPairs;
    const useLayering = slotPressure > 0 && progress < 0.7 && clickable.length >= 4;

    if (useLayering) {
      const sorted = clickable.slice().sort((a, b) => a.layer - b.layer);
      const lowLayer = sorted[0].layer;
      const highLayer = sorted[sorted.length - 1].layer;
      if (highLayer - lowLayer >= 2 && rng() < slotPressure) {
        const topCandidates = sorted.filter(t => t.layer === highLayer);
        const bottomCandidates = sorted.filter(t => t.layer === lowLayer);
        shuffle(topCandidates, rng);
        t1 = topCandidates[0];
        t2 = bottomCandidates.find(c => c._idx !== t1._idx);
        if (!t2) t1 = null;
      }
    }

    if (!t1 || !t2) {
      shuffle(clickable, rng);
      t1 = clickable[0];
      t2 = clickable[1];
    }

    assigned[t1._idx] = type;
    assigned[t2._idx] = type;
    pairsPlaced.push([t1._idx, t2._idx]);
    remaining = remaining.filter(t => t !== t1 && t !== t2);
  }
  return { assigned, pairsPlaced };
}

// 深埋配对：大部分对子一张露在上面、另一张压在低三到四层。
// 花色不平均，有的只有一对两对，有的四对五对。
// 顺着能看见的对子点，槽会先满；按生成时的顺序才能在四格里走完。
function deepFill(tiles, rng) {
  const n = tiles.length;
  function fail(tag) {
    (globalThis.__deepWhy = globalThis.__deepWhy || []).push(tag);
    return null;
  }
  if (n < 8 || n % 2) return fail('tiny');
  const totalPairs = n / 2;
  const items = tiles.map(function (t, idx) {
    return {
      layer: t.layer, row: t.row, col: t.col, _idx: idx,
      spitterOrder: t.spitterOrder == null ? null : t.spitterOrder
    };
  });
  function cellKey(t) { return t.layer + ',' + t.row + ',' + t.col; }
  function visibleOf(list) {
    const plain = [];
    const queues = new Map();
    list.forEach(function (t) {
      if (t.spitterOrder == null) plain.push(t);
      else {
        const k = cellKey(t);
        if (!queues.has(k)) queues.set(k, []);
        queues.get(k).push(t);
      }
    });
    const occ = new Set(plain.map(cellKey));
    const out = plain.slice();
    queues.forEach(function (arr, k) {
      if (occ.has(k)) return;
      arr.sort(function (a, b) { return a.spitterOrder - b.spitterOrder; });
      out.push(arr[0]);
    });
    return out;
  }
  function clickableIn(set) {
    const vis = visibleOf(items.filter(function (t) { return set.has(t._idx); }));
    return vis.filter(function (tile) {
      if (vis.some(function (o) {
        return o !== tile && o.layer > tile.layer &&
          Math.abs(o.row - tile.row) < 2 && Math.abs(o.col - tile.col) < 2;
      })) return false;
      const same = vis.filter(function (t) { return t.layer === tile.layer && t !== tile; });
      const hasL = same.some(function (t) { return t.col === tile.col - 2 && Math.abs(t.row - tile.row) < 2; });
      const hasR = same.some(function (t) { return t.col === tile.col + 2 && Math.abs(t.row - tile.row) < 2; });
      return !(hasL && hasR);
    });
  }

  const quotas = [];
  let left = totalPairs;
  const fatBudget = Math.floor(totalPairs * 0.5);
  let fat = 0;
  while (fat + 4 <= fatBudget && left >= 4 && quotas.length < 10) {
    const q = (left >= 5 && rng() < 0.6) ? 5 : 4;
    quotas.push(q);
    left -= q;
    fat += q;
  }
  while (left > 0) {
    let q = (left >= 2 && rng() < 0.45) ? 2 : 1;
    if (q > left) q = left;
    quotas.push(q);
    left -= q;
  }
  while (quotas.length > TYPE_COUNT) {
    let i = quotas.lastIndexOf(1);
    let add = 1;
    if (i < 0) { i = quotas.lastIndexOf(2); add = 2; }
    if (i < 0) break;
    quotas.splice(i, 1);
    const j = quotas.findIndex(function (q) { return q + add <= 5; });
    if (j >= 0) quotas[j] += add;
    else quotas[quotas.length - 1] += add;
  }
  const thin = [];
  const fatPool = [];
  quotas.forEach(function (q, i) {
    const bag = q <= 2 ? thin : fatPool;
    for (let k = 0; k < q; k++) bag.push(i + 1);
  });
  shuffle(thin, rng);
  shuffle(fatPool, rng);

  const assigned = new Array(n).fill(0);
  const rem = new Set(items.map(function (t) { return t._idx; }));
  const slots = [];
  const initialFree = new Set(clickableIn(rem).map(function (t) { return t._idx; }));
  const openingSuit = {};
  const gaps = [];
  let instant = 0;

  function takeSuit(tile) {
    const pools = tile && initialFree.has(tile._idx) ? [thin, fatPool] : [fatPool, thin];
    for (let p = 0; p < pools.length; p++) {
      const bag = pools[p];
      for (let i = bag.length - 1; i >= 0; i--) {
        const s = bag[i];
        if (tile && initialFree.has(tile._idx) && openingSuit[s]) continue;
        bag.splice(i, 1);
        if (tile && initialFree.has(tile._idx)) openingSuit[s] = 1;
        return s;
      }
    }
    return 0;
  }

  let guard = 0;
  while (rem.size && guard++ < n * 6) {
    const free = clickableIn(rem);
    const ready = free.filter(function (t) { return assigned[t._idx] && slots.indexOf(assigned[t._idx]) >= 0; });
    if (ready.length) {
      ready.sort(function (a, b) { return b.layer - a.layer; });
      const t = ready[0];
      slots.splice(slots.indexOf(assigned[t._idx]), 1);
      rem.delete(t._idx);
      continue;
    }
    const open = free.filter(function (t) { return !assigned[t._idx]; });
    function instantPair(prefer) {
      if (open.length < 2) return false;
      let pair = null;
      if (prefer) {
        const other = open.find(function (t) {
          return t !== prefer && !(initialFree.has(prefer._idx) && initialFree.has(t._idx));
        });
        if (other) pair = [prefer, other];
      }
      for (let i = 0; i < open.length && !pair; i++) {
        for (let j = i + 1; j < open.length; j++) {
          if (initialFree.has(open[i]._idx) && initialFree.has(open[j]._idx)) continue;
          pair = [open[i], open[j]];
          break;
        }
      }
      if (!pair) return false;
      const s = takeSuit(initialFree.has(pair[0]._idx) ? pair[0] : (initialFree.has(pair[1]._idx) ? pair[1] : null));
      if (!s) return false;
      assigned[pair[0]._idx] = assigned[pair[1]._idx] = s;
      rem.delete(pair[0]._idx);
      rem.delete(pair[1]._idx);
      instant++;
      gaps.push(Math.abs(pair[0].layer - pair[1].layer));
      return true;
    }
    const digger = open.find(function (tile) {
      return items.some(function (p) {
        return rem.has(p._idx) && assigned[p._idx] && slots.indexOf(assigned[p._idx]) >= 0 &&
          tile.layer > p.layer && Math.abs(tile.row - p.row) < 2 && Math.abs(tile.col - p.col) < 2;
      });
    });
    if (digger && instantPair(digger)) continue;
    if (slots.length >= 3 && instantPair()) continue;
    if (slots.length >= 4 || !open.length) return fail('stuck' + slots.length + 'o' + open.length + 'r' + rem.size);
    open.sort(function (a, b) { return b.layer - a.layer || a._idx - b._idx; });
    const freeSet = new Set(free.map(function (t) { return t._idx; }));
    function coverCount(t) {
      let c = 0;
      for (let i = 0; i < items.length; i++) {
        const o = items[i];
        if (!rem.has(o._idx) || o._idx === t._idx) continue;
        if (o.layer > t.layer && Math.abs(o.row - t.row) < 2 && Math.abs(o.col - t.col) < 2) c++;
      }
      return c;
    }
    function covers(upper, lower) {
      return upper.layer > lower.layer && Math.abs(upper.row - lower.row) < 2 && Math.abs(upper.col - lower.col) < 2;
    }
    let choice = null;
    for (let i = open.length - 1; i >= 0 && !choice; i--) {
      const tile = open[i];
      const cands = items.filter(function (t) {
        return rem.has(t._idx) && !assigned[t._idx] && !freeSet.has(t._idx) &&
          covers(tile, t) && tile.layer - t.layer >= 3 && coverCount(t) <= 3;
      });
      if (!cands.length) continue;
      cands.sort(function (a, b) { return coverCount(a) - coverCount(b); });
      choice = { top: tile, partner: cands[0] };
    }
    if (!choice) {
      const top = open[0];
      const buried = items.filter(function (t) {
        return rem.has(t._idx) && !assigned[t._idx] && t._idx !== top._idx && !freeSet.has(t._idx) && top.layer - t.layer >= 3;
      });
      if (!buried.length && instantPair()) continue;
      if (!buried.length) return fail('nobury' + rem.size);
      buried.sort(function (a, b) { return coverCount(a) - coverCount(b); });
      choice = { top: top, partner: buried[0] };
    }
    const top = choice.top;
    const partner = choice.partner;
    const s = takeSuit(top);
    if (!s) return fail('nosuit');
    assigned[top._idx] = assigned[partner._idx] = s;
    rem.delete(top._idx);
    slots.push(s);
    gaps.push(top.layer - partner.layer);
    tiles[top._idx]._keepFace = true;
  }
  if (rem.size || slots.length) return fail('left' + rem.size + 's' + slots.length + 'g' + gaps.filter(function (g) { return g >= 3; }).length);
  if (assigned.some(function (s) { return !s; })) return fail('hole');
  const tally = {};
  assigned.forEach(function (s) { tally[s] = (tally[s] || 0) + 1; });
  const counts = Object.values(tally);
  if (counts.some(function (c) { return c % 2 !== 0 || c > 10; })) return fail('badcount');
  if (!counts.some(function (c) { return c >= 8; })) return fail('nofat');
  if (!counts.some(function (c) { return c <= 4; })) return fail('nothin');
  const deepN = gaps.filter(function (g) { return g >= 3; }).length;
  if (deepN < totalPairs * 0.35) return fail('shallow' + deepN);

  const start = new Set(items.map(function (t) { return t._idx; }));
  const by = {};
  clickableIn(start).forEach(function (t) { (by[assigned[t._idx]] = by[assigned[t._idx]] || []).push(t); });
  let opening = 0;
  Object.keys(by).forEach(function (k) { if (by[k].length >= 2) opening++; });
  if (opening > 0) return fail('open' + opening);

  const greedy = new Set(start);
  const gSlots = [];
  let gGuard = 0;
  let pairMoves = 0;
  let slotMoves = 0;
  while (greedy.size && gGuard++ < n * 3) {
    const gFree = clickableIn(greedy);
    const hit = gFree.find(function (t) { return gSlots.indexOf(assigned[t._idx]) >= 0; });
    if (hit) {
      gSlots.splice(gSlots.indexOf(assigned[hit._idx]), 1);
      greedy.delete(hit._idx);
      continue;
    }
    const gBy = {};
    gFree.forEach(function (t) { (gBy[assigned[t._idx]] = gBy[assigned[t._idx]] || []).push(t); });
    const pair = Object.keys(gBy).map(function (k) { return gBy[k]; }).find(function (a) { return a.length >= 2; });
    if (pair) {
      pairMoves++;
      greedy.delete(pair[0]._idx);
      greedy.delete(pair[1]._idx);
      continue;
    }
    if (gSlots.length >= 4 || !gFree.length) break;
    slotMoves++;
    gFree.sort(function (a, b) { return b.layer - a.layer; });
    gSlots.push(assigned[gFree[0]._idx]);
    greedy.delete(gFree[0]._idx);
  }
  if (!greedy.size) return fail('cleared-p' + pairMoves + '-s' + slotMoves);

  return { assigned: assigned, pairsPlaced: [] };
}

// attempt: 0 第一次玩，死局；1 第一次重开，很难的活局；之后每重开一次陷阱变少，大约第 8 次重开可以按开局那种消法过关。
function rhythmFill(tiles, rng, attempt) {
  attempt = attempt | 0;
  const n = tiles.length;
  if (n < 8 || n % 2) return null;
  const items = tiles.map(function (t, idx) {
    return {
      layer: +t.layer, row: +t.row, col: +t.col, _idx: idx,
      spitterOrder: t.spitterOrder == null ? null : t.spitterOrder
    };
  });
  function cellKey(t) { return t.layer + ',' + t.row + ',' + t.col; }
  function visibleOf(list) {
    const plain = [];
    const queues = new Map();
    list.forEach(function (t) {
      if (t.spitterOrder == null) plain.push(t);
      else {
        const k = cellKey(t);
        if (!queues.has(k)) queues.set(k, []);
        queues.get(k).push(t);
      }
    });
    const occ = new Set(plain.map(cellKey));
    const out = plain.slice();
    queues.forEach(function (arr, k) {
      if (occ.has(k)) return;
      arr.sort(function (a, b) { return a.spitterOrder - b.spitterOrder; });
      out.push(arr[0]);
    });
    return out;
  }
  const higherOf = new Array(n);
  const leftOf = new Array(n);
  const rightOf = new Array(n);
  for (let i = 0; i < n; i++) { higherOf[i] = []; leftOf[i] = []; rightOf[i] = []; }
  for (let i = 0; i < n; i++) {
    const a = items[i];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const b = items[j];
      if (b.layer > a.layer && Math.abs(b.row - a.row) < 2 && Math.abs(b.col - a.col) < 2) higherOf[i].push(j);
      else if (b.layer === a.layer && Math.abs(b.row - a.row) < 2) {
        if (b.col === a.col - 2) leftOf[i].push(j);
        else if (b.col === a.col + 2) rightOf[i].push(j);
      }
    }
  }
  function sideBlocks(list, set, ignore) {
    for (let k = 0; k < list.length; k++) {
      const id = list[k];
      if (id === ignore) continue;
      if (set.has(id)) return true;
    }
    return false;
  }
  function isFreeIdx(set, idx, ignore) {
    if (!set.has(idx) || idx === ignore) return false;
    const h = higherOf[idx];
    for (let k = 0; k < h.length; k++) {
      const id = h[k];
      if (id === ignore) continue;
      if (set.has(id)) return false;
    }
    const L = sideBlocks(leftOf[idx], set, ignore);
    if (!L) return true;
    return !sideBlocks(rightOf[idx], set, ignore);
  }
  const hasQueue = items.some(function (t) { return t.spitterOrder != null; });
  function clickableInSlow(set) {
    const vis = visibleOf(items.filter(function (t) { return set.has(t._idx); }));
    return vis.filter(function (tile) {
      if (vis.some(function (o) {
        return o !== tile && o.layer > tile.layer &&
          Math.abs(o.row - tile.row) < 2 && Math.abs(o.col - tile.col) < 2;
      })) return false;
      const same = vis.filter(function (t) { return t.layer === tile.layer && t !== tile; });
      const hasL = same.some(function (t) { return t.col === tile.col - 2 && Math.abs(t.row - tile.row) < 2; });
      const hasR = same.some(function (t) { return t.col === tile.col + 2 && Math.abs(t.row - tile.row) < 2; });
      return !(hasL && hasR);
    });
  }
  function clickableIn(set) {
    if (hasQueue) return clickableInSlow(set);
    const out = [];
    for (let i = 0; i < n; i++) if (isFreeIdx(set, i, -1)) out.push(items[i]);
    return out;
  }
  function coversIn(set, t) {
    const out = [];
    const h = higherOf[t._idx];
    for (let k = 0; k < h.length; k++) if (set.has(h[k])) out.push(items[h[k]]);
    return out;
  }
  function separated(a, b) {
    return Math.abs(a.row - b.row) >= 4 || Math.abs(a.col - b.col) >= 4;
  }
  function dist(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) + Math.abs(a.layer - b.layer) * 2;
  }
  function tooClose(a, b) {
    const dl = Math.abs(a.layer - b.layer);
    const dr = Math.abs(a.row - b.row);
    const dc = Math.abs(a.col - b.col);
    const cheb = Math.max(dr, dc);
    if (dl >= 1 && dl <= 2 && dr < 2 && dc < 2) return true;
    if (dl === 1 && cheb <= 2) return true;
    if (dl === 0 && cheb <= 2) return true;
    return false;
  }
  function stacked(a, b) {
    const dl = Math.abs(a.layer - b.layer);
    return dl >= 1 && dl <= 2 && Math.abs(a.row - b.row) < 2 && Math.abs(a.col - b.col) < 2;
  }
  const noMutual = new Set();
  let relaxNear = false;
  function clashes(a, b) {
    if (!a || !b) return false;
    if (stacked(a, b)) return true;
    if (!relaxNear && tooClose(a, b)) return true;
    return false;
  }
  function pickFar(list) {
    if (!list || list.length < 2) return null;
    let best = null;
    let bestD = -1;
    let bestSep = false;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const x = list[i];
        const y = list[j];
        if (clashes(x, y)) continue;
        if (!relaxNear && noMutual.has(x._idx) && noMutual.has(y._idx)) continue;
        const d = dist(x, y);
        const sep = separated(x, y);
        if (!best || (sep && !bestSep) || (sep === bestSep && d > bestD)) {
          best = [x, y];
          bestD = d;
          bestSep = sep;
        }
      }
    }
    return best;
  }

  const trap = 1;
  const assigned = new Array(n).fill(0);
  const rem = new Set(items.map(function (t) { return t._idx; }));
  const suitCount = {};
  const script = [];

  function suitFits(s, a, b) {
    if (!a || !b || clashes(a, b)) return false;
    for (let i = 0; i < n; i++) {
      if (assigned[i] !== s) continue;
      if (clashes(items[i], a) || clashes(items[i], b)) return false;
    }
    return true;
  }
  function takeSuit(a, b, preferReuse) {
    const order = [];
    for (let s = 1; s <= TYPE_COUNT; s++) order.push(s);
    shuffle(order, rng);
    let best = 0;
    let bestC = preferReuse ? -1 : 999;
    for (let i = 0; i < order.length; i++) {
      const s = order[i];
      const c = suitCount[s] || 0;
      if (c + 2 > 10) continue;
      if (preferReuse && c < 2) continue;
      if (a && b && !suitFits(s, a, b)) continue;
      if (preferReuse) {
        if (c > bestC && c <= 8) {
          bestC = c;
          best = s;
        }
      } else if (c < bestC) {
        bestC = c;
        best = s;
        if (c === 0) break;
      }
    }
    if (!best && preferReuse) return takeSuit(a, b, false);
    if (!best) return 0;
    suitCount[best] = (suitCount[best] || 0) + 2;
    return best;
  }

  const cutPairs = Math.max(1, Math.round(4 * n / 196));
  const openingCap = Math.max(2, Math.round(n / 100));
  const easyTarget = Math.max(openingCap * 2, Math.floor(n * 0.30 / 2) * 2 - cutPairs * 2);
  const initialFree = new Set(clickableIn(rem).map(function (t) { return t._idx; }));
  let openingMade = 0;
  let removed = 0;
  let guard = 0;
  let wave = 0;
  while (guard++ < n && removed < easyTarget) {
    const batch = clickableIn(rem).filter(function (t) { return !assigned[t._idx]; });
    if (batch.length < 2) break;
    wave++;
    const used = new Set();
    const pairs = [];
    const order = batch.slice();
    shuffle(order, rng);
    for (let i = 0; i < order.length; i++) {
      const seed = order[i];
      if (used.has(seed._idx)) continue;
      if (removed + pairs.length * 2 + 2 > easyTarget) break;
      let best = null;
      let bestD = -1;
      let bestSep = false;
      for (let j = 0; j < order.length; j++) {
        const t = order[j];
        if (used.has(t._idx) || t._idx === seed._idx) continue;
        if (tooClose(seed, t)) continue;
        if (initialFree.has(seed._idx) && initialFree.has(t._idx) && openingMade + pairs.length >= openingCap) continue;
        if (noMutual.has(seed._idx) && noMutual.has(t._idx)) continue;
        const d = dist(seed, t);
        const sep = separated(seed, t);
        if (!best || (sep && !bestSep) || (sep === bestSep && d > bestD)) {
          best = t;
          bestD = d;
          bestSep = sep;
        }
      }
      if (!best) continue;
      used.add(seed._idx);
      used.add(best._idx);
      pairs.push([seed, best]);
    }
    if (wave === 1) {
      items.forEach(function (t) {
        if (initialFree.has(t._idx) && !used.has(t._idx)) noMutual.add(t._idx);
      });
    }
    if (!pairs.length) break;
    let placedWave = 0;
    for (let i = 0; i < pairs.length; i++) {
      const s = takeSuit(pairs[i][0], pairs[i][1]);
      if (!s) continue;
      assigned[pairs[i][0]._idx] = assigned[pairs[i][1]._idx] = s;
      rem.delete(pairs[i][0]._idx);
      rem.delete(pairs[i][1]._idx);
      script.push(['p', pairs[i][0]._idx, pairs[i][1]._idx]);
      removed += 2;
      placedWave++;
      if (initialFree.has(pairs[i][0]._idx) && initialFree.has(pairs[i][1]._idx)) openingMade++;
    }
    if (!placedWave) break;
  }
  if (removed < 4) { globalThis.__rhythm = { fail: 'easy', removed: removed }; return null; }

  const slots = [];
  let guard2 = 0;
  let gates = 0;
  let forceParks = 0;
  let baitPairs = 0;
  let moved = false;
  const minGates = Math.max(3, Math.round(n / 50));
  const minForceParks = Math.max(8, Math.round(n / 22));
  const minBait = Math.max(3, Math.round(n / 55));
  const holdBait = new Set();
  const pendingBait = [];
  function flushBait() {
    if (!pendingBait.length || slots.length >= 4) return false;
    const pair = pendingBait[0];
    if (!rem.has(pair[0]) || !rem.has(pair[1])) {
      pendingBait.shift();
      holdBait.delete(pair[0]);
      holdBait.delete(pair[1]);
      return false;
    }
    if (!isFreeIdx(rem, pair[0], -1) || !isFreeIdx(rem, pair[1], -1)) return false;
    pendingBait.shift();
    holdBait.delete(pair[0]);
    holdBait.delete(pair[1]);
    rem.delete(pair[0]);
    rem.delete(pair[1]);
    script.push(['p', pair[0], pair[1]]);
    return true;
  }
  while (rem.size && guard2++ < n * 8) {
    if (moved) relaxNear = false;
    moved = false;
    const free = clickableIn(rem);
    const ready = free.filter(function (t) { return assigned[t._idx] && slots.indexOf(assigned[t._idx]) >= 0; });
    if (ready.length) {
      ready.sort(function (a, b) { return a.layer - b.layer; });
      const t = ready[0];
      slots.splice(slots.indexOf(assigned[t._idx]), 1);
      rem.delete(t._idx);
      script.push(['m', t._idx]);
      moved = true;
      continue;
    }
    const hanging = free.filter(function (t) {
      if (holdBait.has(t._idx)) return false;
      if (!assigned[t._idx] || slots.indexOf(assigned[t._idx]) >= 0) return false;
      const mate = items.find(function (o) {
        return rem.has(o._idx) && o._idx !== t._idx && assigned[o._idx] === assigned[t._idx];
      });
      if (!mate || holdBait.has(mate._idx)) return false;
      const next = new Set(rem);
      next.delete(t._idx);
      return isFreeIdx(next, mate._idx, -1);
    });
    if (hanging.length && slots.length < 4) {
      const t = hanging[0];
      slots.push(assigned[t._idx]);
      rem.delete(t._idx);
      script.push(['k', t._idx]);
      moved = true;
      continue;
    }
    if (pendingBait.length && (forceParks >= 1 || rem.size <= pendingBait.length * 2 + 2) && flushBait()) {
      moved = true;
      continue;
    }
    const open = free.filter(function (t) { return !assigned[t._idx]; });
    function freedIf(removeIds, targetId) {
      if (!rem.has(targetId)) return false;
      for (let i = 0; i < removeIds.length; i++) if (removeIds[i] === targetId) return false;
      const h = higherOf[targetId];
      for (let k = 0; k < h.length; k++) {
        const id = h[k];
        if (removeIds.indexOf(id) >= 0) continue;
        if (rem.has(id)) return false;
      }
      const ignoreSide = function (list) {
        for (let k = 0; k < list.length; k++) {
          const id = list[k];
          if (removeIds.indexOf(id) >= 0) continue;
          if (rem.has(id)) return true;
        }
        return false;
      };
      const L = ignoreSide(leftOf[targetId]);
      if (!L) return true;
      return !ignoreSide(rightOf[targetId]);
    }
    function findBuriedFor(top, usedSet, maxCov) {
      const lim = maxCov == null ? 5 : maxCov;
      const buried = items.filter(function (t) {
        if (!rem.has(t._idx) || assigned[t._idx] || t._idx === top._idx) return false;
        if (usedSet && usedSet.has(t._idx)) return false;
        if (clashes(top, t)) return false;
        const cov = coversIn(rem, t);
        if (!cov.length || cov.length > lim) return false;
        return true;
      });
      buried.sort(function (a, b) {
        const ca = coversIn(rem, a).length;
        const cb = coversIn(rem, b).length;
        if (ca !== cb) return ca - cb;
        return Math.abs(b.layer - top.layer) - Math.abs(a.layer - top.layer);
      });
      return buried;
    }
    function tryGate() {
      if (slots.length) return false;
      if (open.length < 4) return false;
      const keys = [];
      for (let i = 0; i < open.length; i++) {
        const top = open[i];
        const partners = items.filter(function (t) {
          if (!rem.has(t._idx) || assigned[t._idx] || t._idx === top._idx) return false;
          const cov = coversIn(rem, t);
          if (!(cov.length >= 1 && cov.length <= 2 && cov.some(function (c) { return c._idx === top._idx; }))) return false;
          return freedIf([top._idx], t._idx);
        });
        const hidden = partners.filter(function (t) {
          const dark = tiles[t._idx] && tiles[t._idx].isDark;
          return dark || t.row !== top.row || t.col !== top.col || coversIn(rem, t).length >= 1;
        });
        if (!hidden.length) continue;
        keys.push({ top: top, partner: hidden[Math.floor(rng() * hidden.length)] });
      }
      if (!keys.length) return false;
      shuffle(keys, rng);
      for (let ki = 0; ki < Math.min(keys.length, 12); ki++) {
        const key = keys[ki];
        const rest = open.filter(function (t) { return t._idx !== key.top._idx; });
        const bait = pickFar(rest);
        if (!bait) continue;
        if (freedIf([bait[0]._idx, bait[1]._idx], key.partner._idx)) continue;
        const decoys = rest.filter(function (t) { return t._idx !== bait[0]._idx && t._idx !== bait[1]._idx; });
        const usedP = new Set([key.partner._idx, key.top._idx, bait[0]._idx, bait[1]._idx]);
        const decoyPlan = [];
        let decoyOk = true;
        const decoyLimit = Math.min(decoys.length, 2);
        for (let d = 0; d < decoyLimit; d++) {
          const buried = items.filter(function (t) {
            if (!rem.has(t._idx) || assigned[t._idx] || usedP.has(t._idx)) return false;
            if (!freedIf([key.top._idx], t._idx)) return false;
            if (freedIf([bait[0]._idx, bait[1]._idx], t._idx)) return false;
            return true;
          });
          if (!buried.length) { decoyOk = false; break; }
          decoyPlan.push([decoys[d], buried[Math.floor(rng() * buried.length)]]);
          usedP.add(decoyPlan[d][1]._idx);
        }
        if (!decoyOk && decoyLimit > 0) continue;
        const sk = takeSuit(key.top, key.partner);
        const sb = takeSuit(bait[0], bait[1], baitPairs < minBait);
        if (!sk || !sb) continue;
        const planned = [];
        let suitsOk = true;
        for (let d = 0; d < decoyPlan.length; d++) {
          const sd = takeSuit(decoyPlan[d][0], decoyPlan[d][1]);
          if (!sd) { suitsOk = false; break; }
          planned.push(sd);
        }
        if (!suitsOk) {
          [sk, sb].concat(planned).forEach(function (s) {
            if (!s) return;
            suitCount[s] -= 2;
            if (!suitCount[s]) delete suitCount[s];
          });
          continue;
        }
        assigned[bait[0]._idx] = assigned[bait[1]._idx] = sb;
        assigned[key.top._idx] = assigned[key.partner._idx] = sk;
        for (let d = 0; d < decoyPlan.length; d++) {
          assigned[decoyPlan[d][0]._idx] = assigned[decoyPlan[d][1]._idx] = planned[d];
        }
        rem.delete(key.top._idx);
        slots.push(sk);
        script.push(['k', key.top._idx]);
        rem.delete(key.partner._idx);
        slots.splice(slots.indexOf(sk), 1);
        script.push(['m', key.partner._idx]);
        forceParks++;
        for (let d = 0; d < decoyPlan.length; d++) {
          const dt = decoyPlan[d][0];
          const dp = decoyPlan[d][1];
          const sd = assigned[dt._idx];
          rem.delete(dt._idx);
          slots.push(sd);
          script.push(['k', dt._idx]);
          rem.delete(dp._idx);
          slots.splice(slots.indexOf(sd), 1);
          script.push(['m', dp._idx]);
          forceParks++;
        }
        rem.delete(bait[0]._idx);
        rem.delete(bait[1]._idx);
        script.push(['p', bait[0]._idx, bait[1]._idx]);
        baitPairs++;
        return true;
      }
      return false;
    }
    function tryDoublePark() {
      if (slots.length !== 0 || open.length < 2) return false;
      const needMore = forceParks < minForceParks || gates < minGates;
      if (!needMore && rng() > 0.5) return false;
      const order = open.slice();
      shuffle(order, rng);
      const limitI = Math.min(order.length, 12);
      for (let i = 0; i < limitI; i++) {
        for (let j = i + 1; j < order.length; j++) {
          const a = order[i];
          const b = order[j];
          if (clashes(a, b)) continue;
          const used = new Set();
          const buryA = findBuriedFor(a, used, 4);
          if (!buryA.length) continue;
          const pa = buryA[0];
          used.add(pa._idx);
          const buryB = findBuriedFor(b, used, 4);
          if (!buryB.length) continue;
          const pb = buryB[0];
          const sa = takeSuit(a, pa);
          const sb = takeSuit(b, pb);
          if (!sa || !sb) {
            if (sa) { suitCount[sa] -= 2; if (!suitCount[sa]) delete suitCount[sa]; }
            if (sb) { suitCount[sb] -= 2; if (!suitCount[sb]) delete suitCount[sb]; }
            continue;
          }
          assigned[a._idx] = assigned[pa._idx] = sa;
          assigned[b._idx] = assigned[pb._idx] = sb;
          rem.delete(a._idx);
          slots.push(sa);
          script.push(['k', a._idx]);
          rem.delete(b._idx);
          slots.push(sb);
          script.push(['k', b._idx]);
          forceParks += 2;
          return true;
        }
      }
      return false;
    }
    function trySimpleBait() {
      if (slots.length !== 0 || open.length < 3) return false;
      if (gates >= minGates && baitPairs >= minBait && rng() > 0.35) return false;
      const order = open.slice();
      shuffle(order, rng);
      for (let i = 0; i < Math.min(order.length, 14); i++) {
        const top = order[i];
        const partners = findBuriedFor(top, null, 3);
        if (!partners.length) continue;
        const partner = partners[0];
        const rest = open.filter(function (t) { return t._idx !== top._idx; });
        let bait = pickFar(rest);
        if (!bait && rest.length >= 2) {
          for (let x = 0; x < rest.length && !bait; x++) {
            for (let y = x + 1; y < rest.length; y++) {
              if (!clashes(rest[x], rest[y])) { bait = [rest[x], rest[y]]; break; }
            }
          }
        }
        if (!bait) continue;
        const sk = takeSuit(top, partner);
        const sb = takeSuit(bait[0], bait[1], baitPairs < minBait);
        if (!sk || !sb) {
          if (sk) { suitCount[sk] -= 2; if (!suitCount[sk]) delete suitCount[sk]; }
          if (sb) { suitCount[sb] -= 2; if (!suitCount[sb]) delete suitCount[sb]; }
          continue;
        }
        assigned[top._idx] = assigned[partner._idx] = sk;
        assigned[bait[0]._idx] = assigned[bait[1]._idx] = sb;
        holdBait.add(bait[0]._idx);
        holdBait.add(bait[1]._idx);
        pendingBait.push([bait[0]._idx, bait[1]._idx]);
        rem.delete(top._idx);
        slots.push(sk);
        script.push(['k', top._idx]);
        forceParks++;
        baitPairs++;
        return true;
      }
      return false;
    }
    const latePhase = rem.size <= n - Math.max(8, easyTarget);
    const wantTrap = gates < minGates || baitPairs < minBait || forceParks < minForceParks;
    if (slots.length === 0 && (latePhase || wantTrap)) {
      if (wantTrap && tryDoublePark()) { gates++; moved = true; continue; }
      if (trySimpleBait()) { gates++; moved = true; continue; }
      if (tryGate()) { gates++; moved = true; continue; }
      if (tryDoublePark()) { gates++; moved = true; continue; }
    }
    const relieve = slots.length >= 2 && slots.length < 4 && open.length >= 2;
    if (relieve) {
      const pair = pickFar(open);
      if (pair) {
        const s = takeSuit(pair[0], pair[1], baitPairs < minBait);
        if (s) {
          assigned[pair[0]._idx] = assigned[pair[1]._idx] = s;
          rem.delete(pair[0]._idx);
          rem.delete(pair[1]._idx);
          script.push(['p', pair[0]._idx, pair[1]._idx]);
          if (suitCount[s] >= 4) baitPairs++;
          moved = true;
          continue;
        }
      }
    }
    if (!open.length || slots.length >= 4) {
      globalThis.__rhythm = { fail: 'noslot', slots: slots.length, open: open.length, gates: gates, rem: rem.size };
      return null;
    }
    const maxLayer = open.reduce(function (m, t) { return Math.max(m, t.layer); }, 0);
    const lows = open.filter(function (t) { return t.layer < maxLayer; });
    const pool = lows.length ? lows : open.slice();
    shuffle(pool, rng);
    let parked = false;
    if (slots.length < 3) {
      for (let i = 0; i < pool.length && !parked; i++) {
        const top = pool[i];
        const buried = findBuriedFor(top, null, slots.length >= 2 ? 2 : (relaxNear ? 5 : 3)).filter(function (t) {
          return freedIf([top._idx], t._idx) || coversIn(rem, t).length <= 2;
        });
        for (let bi = 0; bi < buried.length && !parked; bi++) {
          const partner = buried[bi];
          const s = takeSuit(top, partner);
          if (!s) continue;
          assigned[top._idx] = assigned[partner._idx] = s;
          rem.delete(top._idx);
          slots.push(s);
          script.push(['k', top._idx]);
          forceParks++;
          parked = true;
        }
      }
    }
    if (parked) { moved = true; continue; }
    if (!parked && slots.length <= 1 && relaxNear) {
      for (let i = 0; i < pool.length && !parked; i++) {
        const top = pool[i];
        const any = items.filter(function (t) {
          if (!rem.has(t._idx) || assigned[t._idx] || t._idx === top._idx) return false;
          return !clashes(top, t);
        });
        shuffle(any, rng);
        for (let ai = 0; ai < Math.min(any.length, 16) && !parked; ai++) {
          const partner = any[ai];
          const s = takeSuit(top, partner);
          if (!s) continue;
          assigned[top._idx] = assigned[partner._idx] = s;
          rem.delete(top._idx);
          slots.push(s);
          script.push(['k', top._idx]);
          forceParks++;
          parked = true;
        }
      }
    }
    if (parked) { moved = true; continue; }
    if (open.length >= 2 && slots.length < 4) {
      const pair = pickFar(open);
      if (pair) {
        const s = takeSuit(pair[0], pair[1], baitPairs < minBait && latePhase);
        if (s) {
          assigned[pair[0]._idx] = assigned[pair[1]._idx] = s;
          rem.delete(pair[0]._idx);
          rem.delete(pair[1]._idx);
          script.push(['p', pair[0]._idx, pair[1]._idx]);
          if (suitCount[s] >= 4) baitPairs++;
          moved = true;
          continue;
        }
      }
    }
    if (!relaxNear) {
      relaxNear = true;
      continue;
    }
    if (pendingBait.length && flushBait()) { moved = true; continue; }
    globalThis.__rhythm = { fail: 'noimm', open: open.length, rem: rem.size, slots: slots.length, gates: gates, forceParks: forceParks };
    return null;
  }
  while (pendingBait.length && flushBait()) { /* drain held bait pairs */ }
  if (pendingBait.length || rem.size || slots.length) {
    globalThis.__rhythm = { fail: 'left', rem: rem.size, slots: slots.length, gates: gates, forceParks: forceParks, pending: pendingBait.length };
    return null;
  }
  if (assigned.some(function (s) { return !s; })) return null;

  const board = new Set(items.map(function (t) { return t._idx; }));
  const sl = [];
  function applyPick(id) {
    const free = clickableIn(board);
    if (!free.some(function (t) { return t._idx === id; })) return false;
    const s = assigned[id];
    const at = sl.indexOf(s);
    if (at >= 0) sl.splice(at, 1);
    else {
      if (sl.length >= 4) return false;
      sl.push(s);
    }
    board.delete(id);
    return true;
  }
  for (let i = 0; i < script.length; i++) {
    const step = script[i];
    if (step[0] === 'p') {
      if (!applyPick(step[1]) || !applyPick(step[2])) {
        globalThis.__rhythm = { fail: 'replay-p', at: i, gates: gates };
        return null;
      }
    } else if (!applyPick(step[1])) {
      globalThis.__rhythm = { fail: 'replay-k', at: i, kind: step[0], gates: gates };
      return null;
    }
  }
  if (board.size || sl.length) return null;
  const tally = {};
  assigned.forEach(function (s) { tally[s] = (tally[s] || 0) + 1; });
  if (Object.keys(tally).some(function (k) { return !tally[k] || tally[k] % 2 !== 0; })) return null;
  let stackedHits = 0;
  let nearHits = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (assigned[i] !== assigned[j]) continue;
      if (stacked(items[i], items[j])) stackedHits++;
      else if (tooClose(items[i], items[j])) nearHits++;
    }
  }
  if (stackedHits) { globalThis.__rhythm = { fail: 'stack', stackedHits: stackedHits, nearHits: nearHits, easy: removed }; return null; }
  const nearBudget = Math.max(10, Math.round(14 * n / 196));
  if (nearHits > nearBudget) { globalThis.__rhythm = { fail: 'close', stackedHits: stackedHits, nearHits: nearHits, easy: removed }; return null; }

  const openBy = {};
  clickableIn(new Set(items.map(function (t) { return t._idx; }))).forEach(function (t) {
    (openBy[assigned[t._idx]] = openBy[assigned[t._idx]] || []).push(t);
  });
  let opening = 0;
  let spread = 0;
  Object.keys(openBy).forEach(function (k) {
    if (openBy[k].length < 2) return;
    opening++;
    if (separated(openBy[k][0], openBy[k][1])) spread++;
  });
  if (opening < 2 || spread < 1) { globalThis.__rhythm = { fail: 'open', opening: opening, gates: gates }; return null; }
  if (forceParks < Math.max(4, Math.round(minForceParks * 0.45))) {
    globalThis.__rhythm = { fail: 'parks', forceParks: forceParks, gates: gates, bait: baitPairs };
    return null;
  }
  if (n >= 100 && gates < Math.min(3, Math.max(2, Math.round(minGates * 0.5)))) {
    globalThis.__rhythm = { fail: 'gates', forceParks: forceParks, gates: gates, bait: baitPairs };
    return null;
  }
  if (trap >= 0.85) {
    const boardG = new Set(items.map(function (t) { return t._idx; }));
    const slG = [];
    let g = 0;
    while (boardG.size && g++ < n * 3) {
      const fr = clickableIn(boardG);
      const hit = fr.find(function (t) { return slG.indexOf(assigned[t._idx]) >= 0; });
      if (hit) { slG.splice(slG.indexOf(assigned[hit._idx]), 1); boardG.delete(hit._idx); continue; }
      const gBy = {};
      fr.forEach(function (t) { (gBy[assigned[t._idx]] = gBy[assigned[t._idx]] || []).push(t); });
      let pair = null;
      Object.keys(gBy).forEach(function (k) { if (!pair && gBy[k].length >= 2) pair = gBy[k]; });
      if (pair && slG.length < 4) { boardG.delete(pair[0]._idx); boardG.delete(pair[1]._idx); continue; }
      if (slG.length >= 4 || !fr.length) break;
      fr.sort(function (a, b) { return b.layer - a.layer; });
      slG.push(assigned[fr[0]._idx]);
      boardG.delete(fr[0]._idx);
    }
    const greedyNeed = Math.floor(n * 0.55);
    if (boardG.size < greedyNeed) { globalThis.__rhythm = { fail: 'greedy', gates: gates, left: boardG.size, need: greedyNeed, forceParks: forceParks }; return null; }
  }
  globalThis.__rhythm = {
    attempt: attempt, trap: Math.round(trap * 100), opening: opening, spread: spread, easy: removed,
    gates: gates, forceParks: forceParks, bait: baitPairs, dead: false, stackedHits: stackedHits, nearHits: nearHits
  };
  return { assigned: assigned, pairsPlaced: [], script: script };
}

/**
 * 死局优先：先随机铺死局花色，再沿一条「边走边配」的窄走廊最小改线救活。
 * 走廊推进时同步写 script，避免回放对不上。
 */
function deadRescueFill(tiles, rng, attempt) {
  attempt = attempt | 0;
  const n = tiles.length;
  if (n < 8 || n % 2) return null;
  const items = tiles.map(function (t, idx) {
    return {
      layer: +t.layer, row: +t.row, col: +t.col, _idx: idx,
      spitterOrder: t.spitterOrder == null ? null : t.spitterOrder
    };
  });
  const higherOf = new Array(n);
  const leftOf = new Array(n);
  const rightOf = new Array(n);
  for (let i = 0; i < n; i++) { higherOf[i] = []; leftOf[i] = []; rightOf[i] = []; }
  for (let i = 0; i < n; i++) {
    const a = items[i];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const b = items[j];
      if (b.layer > a.layer && Math.abs(b.row - a.row) < 2 && Math.abs(b.col - a.col) < 2) higherOf[i].push(j);
      else if (b.layer === a.layer && Math.abs(b.row - a.row) < 2) {
        if (b.col === a.col - 2) leftOf[i].push(j);
        else if (b.col === a.col + 2) rightOf[i].push(j);
      }
    }
  }
  function sideBlocks(list, set, ignore) {
    for (let k = 0; k < list.length; k++) {
      const id = list[k];
      if (id === ignore) continue;
      if (set.has(id)) return true;
    }
    return false;
  }
  function isFreeIdx(set, idx, ignore) {
    if (!set.has(idx) || idx === ignore) return false;
    const h = higherOf[idx];
    for (let k = 0; k < h.length; k++) {
      const id = h[k];
      if (id === ignore) continue;
      if (set.has(id)) return false;
    }
    if (!sideBlocks(leftOf[idx], set, ignore)) return true;
    return !sideBlocks(rightOf[idx], set, ignore);
  }
  function clickableIn(set) {
    const out = [];
    for (let i = 0; i < n; i++) if (isFreeIdx(set, i, -1)) out.push(items[i]);
    return out;
  }
  function coversIn(set, t) {
    const out = [];
    const h = higherOf[t._idx];
    for (let k = 0; k < h.length; k++) if (set.has(h[k])) out.push(items[h[k]]);
    return out;
  }
  function separated(a, b) {
    return Math.abs(a.row - b.row) >= 4 || Math.abs(a.col - b.col) >= 4;
  }
  function dist(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) + Math.abs(a.layer - b.layer) * 2;
  }
  function stacked(a, b) {
    const dl = Math.abs(a.layer - b.layer);
    return dl >= 1 && dl <= 2 && Math.abs(a.row - b.row) < 2 && Math.abs(a.col - b.col) < 2;
  }
  function tooClose(a, b) {
    const dl = Math.abs(a.layer - b.layer);
    const dr = Math.abs(a.row - b.row);
    const dc = Math.abs(a.col - b.col);
    const cheb = Math.max(dr, dc);
    if (dl >= 1 && dl <= 2 && dr < 2 && dc < 2) return true;
    if (dl === 1 && cheb <= 2) return true;
    if (dl === 0 && cheb <= 2) return true;
    return false;
  }

  // ----- Phase A: 随机死局配对 -----
  const dead = new Array(n).fill(0);
  const order = items.map(function (t) { return t._idx; });
  shuffle(order, rng);
  let nextSuit = 1;
  const taken = new Set();
  for (let oi = 0; oi < order.length; oi++) {
    const a = order[oi];
    if (taken.has(a)) continue;
    let best = -1;
    let bestScore = -1e9;
    for (let oj = 0; oj < order.length; oj++) {
      const b = order[oj];
      if (b === a || taken.has(b) || stacked(items[a], items[b])) continue;
      const covA = higherOf[a].length;
      const covB = higherOf[b].length;
      const score = (covA === 0 && covB === 0 ? 10 : 0) + Math.min(covA, covB) * 3 + dist(items[a], items[b]) * 0.05 + rng();
      if (score > bestScore) { bestScore = score; best = b; }
    }
    if (best < 0) {
      for (let oj = 0; oj < order.length; oj++) {
        const b = order[oj];
        if (b === a || taken.has(b) || stacked(items[a], items[b])) continue;
        best = b;
        break;
      }
    }
    if (best < 0) { globalThis.__rhythm = { fail: 'dead-pair' }; return null; }
    const s = nextSuit <= TYPE_COUNT ? nextSuit++ : (1 + Math.floor(rng() * TYPE_COUNT));
    dead[a] = dead[best] = s;
    taken.add(a);
    taken.add(best);
  }

  // ----- Phase B: 在死局偏好下边走边配（只给未出场牌赋花色，绝不改已进槽的线）-----
  const assigned = new Array(n).fill(0);
  const suitCount = {};
  const rem = new Set(items.map(function (t) { return t._idx; }));
  const slots = [];
  const script = [];
  const pairs = [];
  let forceParks = 0;
  let doubleParks = 0;
  let baitMarks = 0;

  function recount() {
    for (let k in suitCount) delete suitCount[k];
    for (let i = 0; i < n; i++) if (assigned[i]) suitCount[assigned[i]] = (suitCount[assigned[i]] || 0) + 1;
  }
  function mateOf(idx) {
    const s = assigned[idx];
    if (!s) return -1;
    for (let i = 0; i < n; i++) if (i !== idx && assigned[i] === s) return i;
    return -1;
  }
  function takeSuit(a, b, prefer) {
    if (stacked(items[a], items[b])) return 0;
    recount();
    const orderS = [];
    if (prefer && prefer >= 1 && prefer <= TYPE_COUNT) orderS.push(prefer);
    for (let s = 1; s <= TYPE_COUNT; s++) if (s !== prefer) orderS.push(s);
    if (!prefer) shuffle(orderS, rng);
    else {
      const rest = orderS.slice(1);
      shuffle(rest, rng);
      for (let i = 0; i < rest.length; i++) orderS[i + 1] = rest[i];
    }
    let best = 0;
    let bestC = 999;
    for (let pass = 0; pass < 3 && !best; pass++) {
      for (let i = 0; i < orderS.length; i++) {
        const s = orderS[i];
        const c = suitCount[s] || 0;
        if (c + 2 > (pass >= 2 ? 10 : 8)) continue;
        let bad = false;
        for (let k = 0; k < n && !bad; k++) {
          if (assigned[k] !== s) continue;
          if (stacked(items[k], items[a]) || stacked(items[k], items[b])) bad = true;
          else if (pass === 0 && (tooClose(items[k], items[a]) || tooClose(items[k], items[b]))) bad = true;
        }
        if (bad) continue;
        // 死局同花优先
        if (prefer && s === prefer) return s;
        if (c < bestC) { bestC = c; best = s; if (c === 0 && !prefer) break; }
      }
    }
    return best;
  }
  function bindPair(a, b) {
    if (assigned[a] || assigned[b]) return 0;
    const prefer = (dead[a] && dead[a] === dead[b]) ? dead[a] : 0;
    const s = takeSuit(a, b, prefer);
    if (!s) return 0;
    assigned[a] = assigned[b] = s;
    suitCount[s] = (suitCount[s] || 0) + 2;
    pairs.push([a, b]);
    if (prefer && s === prefer) baitMarks++;
    else baitMarks++;
    return s;
  }
  function pick(id) {
    if (!isFreeIdx(rem, id, -1)) return false;
    const s = assigned[id];
    const at = slots.indexOf(s);
    if (at >= 0) slots.splice(at, 1);
    else {
      if (slots.length >= 4) return false;
      slots.push(s);
    }
    rem.delete(id);
    return true;
  }
  function sweep() {
    let moved = false;
    for (let guard = 0; guard < n; guard++) {
      const free = clickableIn(rem);
      const ready = free.find(function (t) { return slots.indexOf(assigned[t._idx]) >= 0; });
      if (ready) {
        if (!pick(ready._idx)) break;
        script.push(['m', ready._idx]);
        moved = true;
        continue;
      }
      const hang = free.find(function (t) {
        if (slots.indexOf(assigned[t._idx]) >= 0) return false;
        const mate = mateOf(t._idx);
        if (mate < 0 || !rem.has(mate)) return false;
        const next = new Set(rem);
        next.delete(t._idx);
        return isFreeIdx(next, mate, -1);
      });
      if (hang && slots.length < 4) {
        if (!pick(hang._idx)) break;
        script.push(['k', hang._idx]);
        moved = true;
        continue;
      }
      break;
    }
    return moved;
  }

  const easyTarget = Math.max(4, Math.floor(n * 0.16 / 2) * 2);
  const openingCap = Math.max(2, Math.min(4, Math.round(n / 80)));
  const initialFree = new Set(clickableIn(rem).map(function (t) { return t._idx; }));
  let openingMade = 0;
  let removed = 0;
  let guard = 0;
  // 在合格远距候选里随机抽，避免每次都锁死同一对角位
  function pickRandomFarPair(list, wantSep) {
    if (!list || list.length < 2) return null;
    const cands = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (stacked(list[i], list[j])) continue;
        const d = dist(list[i], list[j]);
        const sep = separated(list[i], list[j]);
        if (wantSep && !sep && cands.some(function (c) { return c.sep; })) continue;
        cands.push({
          a: list[i], b: list[j], sep: sep, d: d,
          score: (sep ? 80 : 0) + d + rng() * 24
        });
      }
    }
    if (!cands.length) return null;
    cands.sort(function (x, y) { return y.score - x.score; });
    const cut = Math.max(4, Math.min(cands.length, Math.ceil(cands.length * 0.4)));
    const pool = cands.slice(0, cut);
    return pool[Math.floor(rng() * pool.length)];
  }
  function deadMateOnBoard(idx) {
    const s = dead[idx];
    if (!s) return -1;
    for (let i = 0; i < n; i++) {
      if (i === idx || dead[i] !== s) continue;
      if (!rem.has(i) || assigned[i]) continue;
      return i;
    }
    return -1;
  }
  // 先强制做出至少 2 组开局当面可消（远距候选随机）
  while (guard++ < n && openingMade < Math.max(2, openingCap)) {
    const batch = clickableIn(rem).filter(function (t) { return initialFree.has(t._idx); });
    if (batch.length < 2) break;
    const best = pickRandomFarPair(batch, true) || pickRandomFarPair(batch, false);
    if (!best || !bindPair(best.a._idx, best.b._idx)) break;
    if (!pick(best.a._idx) || !pick(best.b._idx)) {
      globalThis.__rhythm = { fail: 'open-pick' };
      return null;
    }
    script.push(['p', best.a._idx, best.b._idx]);
    removed += 2;
    openingMade++;
    sweep();
  }
  while (guard++ < n && removed < easyTarget) {
    const batch = clickableIn(rem);
    if (batch.length < 2) break;
    const best = pickRandomFarPair(batch, removed < easyTarget * 0.6) || pickRandomFarPair(batch, false);
    if (!best || !bindPair(best.a._idx, best.b._idx)) break;
    if (!pick(best.a._idx) || !pick(best.b._idx)) break;
    script.push(['p', best.a._idx, best.b._idx]);
    removed += 2;
    sweep();
  }
  if (removed < 4 || openingMade < 2) {
    globalThis.__rhythm = { fail: 'easy', removed: removed, openingMade: openingMade };
    return null;
  }

  guard = 0;
  let relax = false;
  while (rem.size && guard++ < n * 10) {
    if (sweep()) continue;
    const free = clickableIn(rem);
    if (!free.length) { globalThis.__rhythm = { fail: 'nofree', rem: rem.size }; return null; }

    // 卡槽将满：优先当面消一对腾位置
    if (slots.length >= 3 && free.length >= 2) {
      const pair = pickRandomFarPair(free, false);
      if (pair && bindPair(pair.a._idx, pair.b._idx) && slots.length < 4) {
        if (pick(pair.a._idx) && pick(pair.b._idx)) {
          script.push(['p', pair.a._idx, pair.b._idx]);
          continue;
        }
      }
    }

    // 双停牌
    let placed = false;
    if (slots.length === 0 && free.length >= 2 && rem.size > 12 && doubleParks < Math.max(3, Math.round(n / 45))) {
      const pool = free.slice();
      shuffle(pool, rng);
      for (let i = 0; i < pool.length && !placed; i++) {
        for (let j = i + 1; j < pool.length && !placed; j++) {
          const a = pool[i];
          const b = pool[j];
          if (stacked(a, b)) continue;
          const buryA = items.filter(function (t) {
            if (!rem.has(t._idx) || t._idx === a._idx || t._idx === b._idx || assigned[t._idx]) return false;
            if (stacked(a, t)) return false;
            const cov = coversIn(rem, t);
            return cov.length >= 1 && cov.length <= 3;
          });
          const buryB = items.filter(function (t) {
            if (!rem.has(t._idx) || t._idx === a._idx || t._idx === b._idx || assigned[t._idx]) return false;
            if (stacked(b, t)) return false;
            const cov = coversIn(rem, t);
            return cov.length >= 1 && cov.length <= 3;
          });
          if (!buryA.length || !buryB.length) continue;
          shuffle(buryA, rng);
          shuffle(buryB, rng);
          let pa = null;
          let pb = null;
          // 偶尔跟死局边走，打散固定几何配对
          const deadA = deadMateOnBoard(a._idx);
          const deadB = deadMateOnBoard(b._idx);
          if (rng() < 0.45 && deadA >= 0 && buryA.some(function (t) { return t._idx === deadA; })) {
            pa = items[deadA];
          }
          if (rng() < 0.45 && deadB >= 0 && buryB.some(function (t) { return t._idx === deadB; })) {
            pb = items[deadB];
          }
          for (let x = 0; x < buryA.length && !pa; x++) {
            for (let y = 0; y < buryB.length; y++) {
              if (buryA[x]._idx === buryB[y]._idx) continue;
              if (pb && buryB[y]._idx !== pb._idx) continue;
              pa = buryA[x];
              pb = buryB[y];
              break;
            }
          }
          if (pa && !pb) {
            for (let y = 0; y < buryB.length; y++) {
              if (buryB[y]._idx === pa._idx) continue;
              pb = buryB[y];
              break;
            }
          }
          if (!pa || !pb || pa._idx === pb._idx) continue;
          if (!bindPair(a._idx, pa._idx) || !bindPair(b._idx, pb._idx)) continue;
          if (!pick(a._idx) || !pick(b._idx)) continue;
          script.push(['k', a._idx]);
          script.push(['k', b._idx]);
          forceParks += 2;
          doubleParks++;
          placed = true;
        }
      }
    }
    if (placed) continue;

    // 单停牌：停一张，配埋牌（埋牌候选随机，并偏好死局伴侣）
    const pool = free.slice();
    shuffle(pool, rng);
    if (slots.length < 3) {
      for (let i = 0; i < pool.length && !placed; i++) {
        const top = pool[i];
        const buried = items.filter(function (t) {
          if (!rem.has(t._idx) || t._idx === top._idx || assigned[t._idx]) return false;
          if (stacked(top, t)) return false;
          const cov = coversIn(rem, t);
          if (!cov.length || cov.length > (relax ? 7 : 4)) return false;
          return true;
        });
        if (!buried.length && relax) {
          const any = items.filter(function (t) {
            return rem.has(t._idx) && !assigned[t._idx] && t._idx !== top._idx && !stacked(top, t);
          });
          shuffle(any, rng);
          if (any.length) buried.push(any[0]);
        }
        if (!buried.length) continue;
        const deadM = deadMateOnBoard(top._idx);
        if (deadM >= 0 && rng() < 0.5) {
          const hit = buried.find(function (t) { return t._idx === deadM; });
          if (hit) {
            buried.splice(buried.indexOf(hit), 1);
            buried.unshift(hit);
          }
        }
        // 同埋深档里打乱，避免永远配同一张底牌
        buried.sort(function (a, b) {
          const ca = coversIn(rem, a).length;
          const cb = coversIn(rem, b).length;
          if (ca !== cb) return ca - cb;
          return rng() - 0.5;
        });
        const tryN = Math.min(buried.length, Math.max(3, Math.ceil(buried.length * 0.6)));
        const orderBi = [];
        for (let bi = 0; bi < tryN; bi++) orderBi.push(bi);
        shuffle(orderBi, rng);
        for (let oi = 0; oi < orderBi.length && !placed; oi++) {
          const partner = buried[orderBi[oi]];
          if (!bindPair(top._idx, partner._idx)) continue;
          if (!pick(top._idx)) continue;
          script.push(['k', top._idx]);
          forceParks++;
          placed = true;
        }
      }
    }
    if (placed) continue;

    // 末段或放松：当面一对
    if (free.length >= 2 && (rem.size <= 16 || relax || slots.length >= 2)) {
      const pair = pickRandomFarPair(free, false);
      if (pair && slots.length < 4 && bindPair(pair.a._idx, pair.b._idx)) {
        if (pick(pair.a._idx) && pick(pair.b._idx)) {
          script.push(['p', pair.a._idx, pair.b._idx]);
          continue;
        }
      }
    }

    if (!relax) { relax = true; continue; }
    globalThis.__rhythm = { fail: 'corridor', rem: rem.size, slots: slots.length, parks: forceParks };
    return null;
  }
  if (rem.size || slots.length) {
    globalThis.__rhythm = { fail: 'left', rem: rem.size, slots: slots.length };
    return null;
  }
  if (forceParks < Math.max(4, Math.round(n / 28))) {
    globalThis.__rhythm = { fail: 'parks', forceParks: forceParks };
    return null;
  }

  // 完整性
  for (let i = 0; i < n; i++) if (!assigned[i]) { globalThis.__rhythm = { fail: 'orphan' }; return null; }
  const tally = {};
  assigned.forEach(function (s) { tally[s] = (tally[s] || 0) + 1; });
  if (Object.keys(tally).some(function (k) { return tally[k] % 2; })) {
    globalThis.__rhythm = { fail: 'odd' };
    return null;
  }
  let stackedHits = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (assigned[i] === assigned[j] && stacked(items[i], items[j])) stackedHits++;
    }
  }
  if (stackedHits) { globalThis.__rhythm = { fail: 'stack', stackedHits: stackedHits }; return null; }

  // 开局当面可消
  const openBy = {};
  clickableIn(new Set(items.map(function (t) { return t._idx; }))).forEach(function (t) {
    (openBy[assigned[t._idx]] = openBy[assigned[t._idx]] || []).push(t);
  });
  let opening = 0;
  let spread = 0;
  Object.keys(openBy).forEach(function (k) {
    if (openBy[k].length < 2) return;
    opening++;
    if (separated(openBy[k][0], openBy[k][1])) spread++;
  });
  if (opening < 2) {
    globalThis.__rhythm = { fail: 'open', opening: opening, spread: spread };
    return null;
  }

  // 贪心早死 + 旁支宽度
  const boardG = new Set(items.map(function (t) { return t._idx; }));
  const slG = [];
  let g = 0;
  let branchSum = 0;
  let branchN = 0;
  while (boardG.size && g++ < n * 3) {
    const fr = clickableIn(boardG);
    const gBy = {};
    fr.forEach(function (t) { (gBy[assigned[t._idx]] = gBy[assigned[t._idx]] || []).push(t); });
    let freePairs = 0;
    Object.keys(gBy).forEach(function (k) { if (gBy[k].length >= 2) freePairs++; });
    if (g > 3) { branchSum += freePairs; branchN++; }
    const hit = fr.find(function (t) { return slG.indexOf(assigned[t._idx]) >= 0; });
    if (hit) { slG.splice(slG.indexOf(assigned[hit._idx]), 1); boardG.delete(hit._idx); continue; }
    let pair = null;
    Object.keys(gBy).forEach(function (k) { if (!pair && gBy[k].length >= 2) pair = gBy[k]; });
    if (pair && slG.length < 4) { boardG.delete(pair[0]._idx); boardG.delete(pair[1]._idx); continue; }
    if (slG.length >= 4 || !fr.length) break;
    fr.sort(function (a, b) { return b.layer - a.layer; });
    slG.push(assigned[fr[0]._idx]);
    boardG.delete(fr[0]._idx);
  }
  const greedyNeed = Math.floor(n * 0.58);
  if (boardG.size < greedyNeed) {
    globalThis.__rhythm = { fail: 'greedy', left: boardG.size, need: greedyNeed, forceParks: forceParks };
    return null;
  }
  const branchAvg = branchN ? branchSum / branchN : 99;
  if (branchAvg > 2.1) {
    globalThis.__rhythm = { fail: 'branchy', branchAvg: Math.round(branchAvg * 100) / 100, forceParks: forceParks };
    return null;
  }

  globalThis.__rhythm = {
    attempt: attempt, mode: 'dead-rescue', opening: opening, spread: spread, easy: removed,
    forceParks: forceParks, doubleParks: doubleParks, bait: baitMarks, gates: doubleParks,
    greedyLeft: boardG.size, branchAvg: Math.round(branchAvg * 100) / 100, dead: true
  };
  return { assigned: assigned, pairsPlaced: [], script: script };
}

function visiblePlayTiles(rem) {
  const list = [];
  rem.forEach(function (t) { list.push(t); });
  const plain = [];
  const queues = new Map();
  list.forEach(function (t) {
    if (t.type === 'spitter') return;
    if (t.spitterOrder == null) plain.push(t);
    else {
      const k = t.layer + ',' + t.row + ',' + t.col;
      if (!queues.has(k)) queues.set(k, []);
      queues.get(k).push(t);
    }
  });
  const occ = new Set(plain.map(function (t) { return t.layer + ',' + t.row + ',' + t.col; }));
  const out = plain.slice();
  queues.forEach(function (arr, k) {
    if (occ.has(k)) return;
    arr.sort(function (a, b) { return a.spitterOrder - b.spitterOrder; });
    out.push(arr[0]);
  });
  return out;
}
function playerClickable(tile, vis) {
  if (vis.some(function (o) {
    return o !== tile && o.layer > tile.layer &&
      Math.abs(o.row - tile.row) < 2 && Math.abs(o.col - tile.col) < 2;
  })) return false;
  const same = vis.filter(function (t) { return t.layer === tile.layer && t !== tile; });
  const hasL = same.some(function (t) { return t.col === tile.col - 2 && Math.abs(t.row - tile.row) < 2; });
  const hasR = same.some(function (t) { return t.col === tile.col + 2 && Math.abs(t.row - tile.row) < 2; });
  return !(hasL && hasR);
}
function verifySolution(tiles, solution) {
  if (!solution || !Array.isArray(solution.steps)) return { ok: false, reason: '没有步骤' };
  const playable = tiles.filter(function (t) { return t.type !== 'spitter'; });
  const ids = new Set();
  const tally = {};
  for (let i = 0; i < playable.length; i++) {
    const t = playable[i];
    if (t.id == null || ids.has(t.id)) return { ok: false, reason: '牌 id 重复或缺失' };
    ids.add(t.id);
    if (t.typeId == null) return { ok: false, reason: '有牌没有花色' };
    tally[t.typeId] = (tally[t.typeId] || 0) + 1;
  }
  if (Object.keys(tally).some(function (k) { return tally[k] % 2 !== 0; })) {
    return { ok: false, reason: '花色张数不成对' };
  }
  if (solution.steps.length !== playable.length) return { ok: false, reason: '步骤数和牌数不一致' };
  const rem = new Map();
  playable.forEach(function (t) { rem.set(t.id, t); });
  const slots = [];
  const seen = new Set();
  for (let i = 0; i < solution.steps.length; i++) {
    const step = solution.steps[i];
    if (!step || step.action !== 'pick') return { ok: false, reason: '第 ' + (i + 1) + ' 步不是 pick' };
    if (seen.has(step.tileId)) return { ok: false, reason: '牌 ' + step.tileId + ' 被拿了两次' };
    const tile = rem.get(step.tileId);
    if (!tile) return { ok: false, reason: '牌 ' + step.tileId + ' 不在场' };
    const vis = visiblePlayTiles(rem);
    if (!playerClickable(tile, vis)) return { ok: false, reason: '牌 ' + step.tileId + ' 当时不能拿' };
    const at = slots.indexOf(tile.typeId);
    if (at >= 0) slots.splice(at, 1);
    else {
      if (slots.length >= (solution.slotCapacity || 4)) return { ok: false, reason: '第 ' + (i + 1) + ' 步卡槽已满' };
      slots.push(tile.typeId);
    }
    rem.delete(tile.id);
    seen.add(step.tileId);
  }
  if (rem.size || slots.length) return { ok: false, reason: '没有清空盘面或卡槽' };
  return { ok: true };
}
function solutionFromScript(playable, script) {
  const steps = [];
  for (let i = 0; i < script.length; i++) {
    const step = script[i];
    if (step[0] === 'p') {
      steps.push({ action: 'pick', tileId: playable[step[1]].id });
      steps.push({ action: 'pick', tileId: playable[step[2]].id });
    } else {
      steps.push({ action: 'pick', tileId: playable[step[1]].id });
    }
  }
  return { version: 1, slotCapacity: 4, usesProps: false, steps: steps };
}
function reshufflePlayLevel(level, attempt, rng) {
  if (!level || !level.tiles) return null;
  const tiles = level.tiles.map(function (t) { return Object.assign({}, t); });
  const usedIds = new Set();
  let nextId = 1;
  tiles.forEach(function (t) {
    if (t.id != null && !usedIds.has(t.id)) {
      usedIds.add(t.id);
      if (t.id >= nextId) nextId = t.id + 1;
      return;
    }
    while (usedIds.has(nextId)) nextId++;
    t.id = nextId;
    usedIds.add(nextId);
    nextId++;
  });
  const playable = [];
  tiles.forEach(function (t) {
    if (t.type === 'spitter') return;
    playable.push(t);
  });
  if (!playable.length || playable.length % 2) return null;
  const tries = Math.max(80, Math.min(200, Math.round(playable.length / 2)));
  let accepted = null;
  let lastFail = null;
  for (let k = 0; k < tries && !accepted; k++) {
    const result = deadRescueFill(playable, makeRng((Math.floor(rng() * 1e9) + k * 97) >>> 0), 1);
    if (!result || !result.script || !result.assigned) {
      lastFail = (globalThis.__rhythm && globalThis.__rhythm.fail) || 'fill';
      continue;
    }
    let p = 0;
    tiles.forEach(function (t) {
      if (t.type === 'spitter') return;
      t.typeId = result.assigned[p++];
    });
    const tally = {};
    playable.forEach(function (t) { tally[t.typeId] = (tally[t.typeId] || 0) + 1; });
    if (Object.keys(tally).some(function (k) { return tally[k] % 2 !== 0; })) {
      lastFail = 'odd';
      continue;
    }
    const solution = solutionFromScript(playable, result.script);
    if (!solution.steps || solution.steps.length !== playable.length) {
      lastFail = 'steps';
      continue;
    }
    const check = verifySolution(tiles, solution);
    if (!check.ok) {
      lastFail = 'verify:' + (check.reason || '');
      globalThis.__rhythm = Object.assign({}, globalThis.__rhythm || {}, { fail: 'verify', reason: check.reason });
      continue;
    }
    // 二次确认：步骤必须清空盘面（verify 已查，这里再记日志）
    accepted = { solution: solution, rhythm: globalThis.__rhythm };
  }
  if (!accepted) {
    globalThis.__rhythm = { fail: 'no-verified', lastFail: lastFail, tries: tries };
    return null;
  }
  const out = Object.assign({}, level, { tiles: tiles, solution: accepted.solution });
  delete out._rhythmAttempt;
  const darkIds = new Set();
  tiles.forEach(function (t) { if (t.isDark) darkIds.add(t.id); });
  try { out._difficulty = evaluateDifficulty({ tiles: tiles }, darkIds); } catch (_) {}
  if (accepted.rhythm) {
    globalThis.__rhythm = Object.assign({}, accepted.rhythm, {
      verified: true,
      steps: accepted.solution.steps.length
    });
  }
  return out;
}

function backwardFill(tiles, rng, slotPressure) {
  for (let k = 0; k < 8; k++) {
    const rhythm = rhythmFill(tiles, makeRng((Math.floor(rng() * 1e9) + k * 97) >>> 0), 0);
    if (rhythm) return rhythm;
  }
  const deep = deepFill(tiles, rng);
  if (deep) return deep;
  return legacyBackwardFill(tiles, rng, typeof slotPressure === 'number' ? slotPressure : 0.5);
}

// ============ 校验 ============
function verifyByElimination(tiles, pairsPlaced) {
  const remaining = new Map(tiles.map(t => [t.id, t]));
  for (let k = 0; k < pairsPlaced.length; k++) {
    const id1 = tiles[pairsPlaced[k][0]].id;
    const id2 = tiles[pairsPlaced[k][1]].id;
    const t1 = remaining.get(id1);
    const t2 = remaining.get(id2);
    if (!t1 || !t2) return { ok: false, reason: `牌 ${id1}/${id2} 已不在场` };
    if (t1.typeId !== t2.typeId) return { ok: false, reason: `type 不同` };
    const all = [...remaining.values()];
    if (!isClickable(t1, all) || !isClickable(t2, all)) {
      return { ok: false, reason: `牌 ${id1}/${id2} 该步不可点` };
    }
    remaining.delete(id1);
    remaining.delete(id2);
  }
  return { ok: remaining.size === 0 };
}

// 正向可解检查:反复找"两张同 typeId 且都可点"的一对消除,能否清空棋盘。
// 用于'完整导入的关卡是否可保留原花色'判断。贪心(个别刁钻配置可能误判),仅为保留与否做护栏;
// 误判只会导致"改走重填"(结果仍合法),不会产出死局。
function forwardEliminable(arr) {
  let remaining = arr.slice();
  while (remaining.length > 0) {
    const clickable = remaining.filter(t => isClickable(t, remaining));
    if (clickable.length < 2) return false;
    const byType = {};
    clickable.forEach(t => { (byType[t.typeId] ||= []).push(t); });
    let pair = null;
    for (const k in byType) { if (byType[k].length >= 2) { pair = byType[k].slice(0, 2); break; } }
    if (!pair) return false;
    remaining = remaining.filter(t => t !== pair[0] && t !== pair[1]);
  }
  return true;
}

// 游戏规则：被更高层压住不可点；被同层左右夹住不可点
// std 坐标：row=上下(纵)，col=左右(横)。左右夹住 = 同列(col 相等)、row 相同、col±2。
function isClickable(tile, all) {
  if (all.some(o => o !== tile && o.layer > tile.layer &&
      Math.abs(o.row - tile.row) < 2 && Math.abs(o.col - tile.col) < 2)) return false;
  const same = all.filter(t => t.layer === tile.layer && t !== tile);
  const hasL = same.some(t => t.col === tile.col - 2 && t.row === tile.row);
  const hasR = same.some(t => t.col === tile.col + 2 && t.row === tile.row);
  return !(hasL && hasR);
}

// ============ 暗牌分配 ============
// options: { coverageRate: 暗钩比例(暗牌里标在钩子埋牌上的比例), totalCount: 暗牌总数上限(<=0/null = 无暗牌) }
function assignDarkTiles(tiles, rng, options) {
  options = options || {};
  const coverageRate = options.coverageRate != null ? options.coverageRate : 1; // 默认全覆盖
  const totalCount = options.totalCount; // 暗牌总数上限;undefined/<=0 = 无暗牌
  const exclude = new Set((options.excludeIdx || []).map(Number));
  // 暗牌总数 <= 0 → 一张暗牌都没有(自然也没有暗钩)
  if (totalCount == null || totalCount <= 0) return [];
  const byType = {};
  tiles.forEach((t, i) => { (byType[t.typeId] ||= []).push({ t, i }); });
  const darkIdx = [];
  const marked = new Set();
  // 阶段一:用新钩子定义收集所有"对中有一张被埋"的对子
  const buriedPairs = [];
  for (const k in byType) {
    const arr = byType[k];
    if (arr.length < 2) continue;
    const pairs = Math.floor(arr.length / 2);
    // 找出该花色中被埋的牌(用新定义 isTileBuried:上压 OR 左右夹 都算)
    const buriedInType = arr.filter(x => isTileBuried(x.t, tiles));
    // 每对中有一张被埋就算埋对,埋对最多 pairs 个
    const pairCount = Math.min(buriedInType.length, pairs);
    for (let p = 0; p < pairCount; p++) {
      buriedPairs.push(arr);
    }
  }
  shuffle(buriedPairs, rng);
  // 暗钩 = 暗牌里标在"钩子被埋牌"上的那部分;不超过总数上限
  const hookTarget = Math.min(Math.round(buriedPairs.length * coverageRate), totalCount);
  for (let p = 0; p < hookTarget && p < buriedPairs.length; p++) {
    const arr = buriedPairs[p];
    // 找该花色中第一个被埋的牌作为暗牌
    const buried = arr.find(x => !exclude.has(x.i) && isTileBuried(x.t, tiles));
    if (buried && !marked.has(buried.i)) { darkIdx.push(buried.i); marked.add(buried.i); }
  }
  // 阶段二:补随机暗牌(纯钩子模式时跳过)
  if (totalCount != null) {
    const candidates = tiles.map((_, i) => i).filter(i => !marked.has(i) && !exclude.has(i));
    shuffle(candidates, rng);
    for (const i of candidates) {
      if (darkIdx.length >= totalCount) break;
      darkIdx.push(i); marked.add(i);
    }
  }
  return darkIdx;
}

// ============ 难度评估（含暗钩子权重 + 钩子稀缺度） ============
// 判断单张牌是否被埋:任意埋法(上压 / 左右夹)都算
function isTileBuried(tile, allTiles) {
  // 1. 同层被压:有上层牌覆盖
  const hasUpper = allTiles.some(other =>
    other.id !== tile.id &&
    other.layer > tile.layer &&
    Math.abs(other.row - tile.row) < 2 &&
    Math.abs(other.col - tile.col) < 2
  );
  if (hasUpper) return true;
  // 2. 左右夹:同层左右都被夹住,row 范围匹配(与 isClickable 一致)
  const sameLayer = allTiles.filter(t => t.layer === tile.layer && t.id !== tile.id);
  const hasLeft = sameLayer.some(t => t.col === tile.col - 2 && Math.abs(t.row - tile.row) < 2);
  const hasRight = sameLayer.some(t => t.col === tile.col + 2 && Math.abs(t.row - tile.row) < 2);
  return hasLeft && hasRight;
}

// 埋深：这张牌要"挖开多少张"才能见到。
// 上压 → 被多少张上层牌盖住(深度 = 盖住它的牌数)；左右夹 → 算深度 1。
// 深度越大越难（要清掉越多张才能点到它）。
function tileBuriedDepth(tile, all) {
  let depth = 0;
  for (const o of all) {
    if (o.id !== tile.id && o.layer > tile.layer &&
      Math.abs(o.row - tile.row) < 2 && Math.abs(o.col - tile.col) < 2) depth++;
  }
  if (depth > 0) return depth;
  const same = all.filter(t => t.layer === tile.layer && t.id !== tile.id);
  const L = same.some(t => t.col === tile.col - 2 && Math.abs(t.row - tile.row) < 2);
  const R = same.some(t => t.col === tile.col + 2 && Math.abs(t.row - tile.row) < 2);
  return (L && R) ? 1 : 0;
}

// 吐牌机队列压力：只计算"实际不可见/不可消"的队列牌贡献
// 从第1张往后找，找到第一张无法立即配对的牌，它及之后所有牌都算压力
// (因为前面不消就无法看到后面)
function computeSpitterQueuePressure(tiles, queueTiles) {
  if (!queueTiles || queueTiles.length === 0) return { pressure: 0, hiddenQueueCount: 0 };
  // 按 spitterOrder 排序（1 先看到）
  const sorted = queueTiles.slice().sort((a, b) => a.spitterOrder - b.spitterOrder);
  // 找出第一张"出牌时立即可见且可配对"的队列牌
  // 简化模型：判断队列牌的 pair（同 typeId 的另一张牌）是否在场上
  // 如果 pair 在场上 → 立即可消 → 不算压力
  // 如果 pair 被埋了 → 这张牌得等 pair 露出来才能消 → 算压力
  let hiddenCount = 0;
  for (const qt of sorted) {
    const pair = tiles.find(t => t.id !== qt.id && t.spitterOrder == null && t.typeId === qt.typeId);
    if (pair && !isTileBuried(pair, tiles)) {
      // pair 在场上且可见（未埋），立即可消 → 这张牌不贡献压力
      continue;
    } else {
      // pair 被埋或不存在 → 从这张开始所有后续牌都算压力
      hiddenCount += sorted.length - sorted.indexOf(qt);
      break;
    }
  }
  // 公式：(0.5 + hiddenCount - 1) × 8
  const pressure = hiddenCount > 0 ? (0.5 + hiddenCount - 1) * 8 : 0;
  return { pressure, hiddenQueueCount: hiddenCount };
}

function evaluateDifficulty(level, darkIds = new Set(), darkWeight = DARK_WEIGHT) {
  const tiles = level.tiles;
  const total = tiles.length;
  const clickableSet = new Set(tiles.filter(t => isClickable(t, tiles)).map(t => t.id));
  const clickRatio = clickableSet.size / total;
  const maxLayer = Math.max(...tiles.map(t => t.layer));
  const byType = {};
  tiles.forEach(t => { (byType[t.typeId] ||= []).push(t); });

  let hooks = 0, darkHooks = 0;           // 原始钩子数（显示/目标匹配用）
  let effHooks = 0, effDarkHooks = 0;     // 可见伴侣加权钩子数（计分用）

  for (const k in byType) {
    const arr = byType[k];
    const pairs = Math.floor(arr.length / 2);
    if (pairs < 1) continue;
    // 埋深:每张牌被盖住/夹住的深度(0=完全可见)
    const depths = arr.map(t => tileBuriedDepth(t, tiles));
    const darkIdx = arr.map(t => darkIds.has(t.id));
    // 按埋深从深到浅排序,配对时深的对深的(避免任意结对影响计分)
    const order = depths.map((_, i) => i).sort((a, b) => depths[b] - depths[a]);
    let locked = 0;        // 新钩子数:一对里至少有一张被埋
    let pairW = 0;         // 计分权重:深度缩放 + 双埋加成
    let darkLocked = 0;    // 含暗牌的锁定对(显示用)
    let darkPairW = 0;
    for (let p = 0; p < pairs; p++) {
      const i = order[2 * p], j = order[2 * p + 1];
      const d1 = (i != null ? depths[i] : 0), d2 = (j != null ? depths[j] : 0);
      const dm = Math.max(d1, d2), dn = Math.min(d1, d2);
      if (dm === 0) continue;                 // 两张都可见 → 不算钩子(好拿)
      locked++;
      const w = dm + (dn > 0 ? dn : 0);       // 一明一暗=深那张;双埋=两深相加
      pairW += w;
      if (darkIdx[i] || darkIdx[j]) { darkPairW += w; darkLocked++; }
    }
    // 伴侣型加权:同色露得越多 → 越容易找到同伴 → 权重越低(保留"伴侣型钩子影响分数"思想)
    const visibleCount = arr.filter((_, i) => depths[i] === 0).length;
    const wc = 1 / (visibleCount + 1);
    hooks += locked;
    effHooks += pairW * wc;
    darkHooks += darkLocked;
    effDarkHooks += darkPairW * wc;
  }

  const totalPairs = Math.floor(total / 2);
  // 槽位压力:最优打法下卡槽最多同时占几个花色位
  const slotsResult = computeMinSlots(tiles);
  const minSlots = slotsResult.minSlots;
  // 槽位压力项:2 槽起 0 分,每 +1 槽 +7.5 分,6 槽拿满 30 分
  const slotTerm = Math.min(Math.max(0, minSlots - 2) / 4, 1) * 30;
  // 封顶调整:5 → 8,让钩子数拉开分数差距
  const darkHookTerm = Math.min(effDarkHooks / 40, 1) * darkWeight;
  // 吐牌机队列压力：只计算"实际不可见/不可消"的队列牌贡献
  // 从第1张往后找，找到第一张无法立即配对的牌，它及之后所有牌都算压力
  const queueTiles = tiles.filter(t => t.spitterOrder != null);
  const queueResult = computeSpitterQueuePressure(tiles, queueTiles);
  const queueCount = queueTiles.length;
  const spitterQueuePressure = queueResult.pressure;
  const score = Math.round(
    (1 - clickRatio) * 30 + maxLayer * 8 +
    Math.min(effHooks / 40, 1) * 30 + darkHookTerm + slotTerm +
    spitterQueuePressure + 5
  );
  return {
    score: Math.max(0, score),
    clickRatio: +clickRatio.toFixed(3),
    clickable: clickableSet.size, total, maxLayer,
    typeCount: Object.keys(byType).length,
    hooks, darkHooks,
    effHooks: +effHooks.toFixed(2),
    effDarkHooks: +effDarkHooks.toFixed(2),
    totalPairs,
    hookDensity: totalPairs ? +(hooks / totalPairs).toFixed(3) : 0,
    darkHookDensity: totalPairs ? +(darkHooks / totalPairs).toFixed(3) : 0,
    minSlots,
    slotSolvable: slotsResult.solvable,
    queueCount,
    hiddenQueueCount: queueResult.hiddenQueueCount,
    spitterQueuePressure: +spitterQueuePressure.toFixed(2),
  };
}

// ============ 最小槽位需求 ============
// 模拟一个聪明玩家的打法,统计卡槽中最大同时存在的花色数。
// 这个值越接近 7(卡槽上限),容错率越低 -- 顺序走错一步就容易把槽堆满。
// 模型:
//   board = 场上未点的牌;slot = 已进槽未配对的牌
//   1. 场上有可点的牌,其花色槽里已有 -> 点它配掉槽里那张(槽位 -1)
//   2. 场上有两张可点同花色 -> 点掉(短暂过槽即消,不计峰值)
//   3. 只能点单张 -> 选"底下压牌最多"的进槽(尽早解锁),槽位 +1
// 每次单张进槽后记录 slot.size 峰值。
// 返回 { minSlots, solvable } -- solvable=false 表示贪心走到死局(不代表关卡无解,但说明需要精确顺序)
function computeMinSlots(tiles) {
  const board = new Set(tiles.map(t => t.id));
  const tileMap = new Map(tiles.map(t => [t.id, t]));
  const slot = new Map(); // typeId -> tile(该花色槽里那张)
  let maxSlots = 0;
  let guard = 0;

  while (board.size > 0 || slot.size > 0) {
    if (++guard > tiles.length * 2 + 10) return { minSlots: 7, solvable: false };
    if (board.size === 0) break; // 槽里还有单张 = 死局(配不掉了)
    const all = tiles.filter(t => board.has(t.id));
    const clickable = all.filter(t => isClickable(t, all));
    if (clickable.length === 0) return { minSlots: 7, solvable: false };

    // 优先级 1:可点牌的花色在槽里 -> 立即配对
    let done = false;
    for (const t of clickable) {
      if (slot.has(t.typeId)) {
        slot.delete(t.typeId);
        board.delete(t.id);
        done = true;
        break;
      }
    }
    if (done) continue;

    // 优先级 2:两张可点同花色 -> 消掉
    const byType = {};
    clickable.forEach(t => { (byType[t.typeId] ||= []).push(t); });
    let pair = null;
    for (const typeId in byType) {
      if (byType[typeId].length >= 2) { pair = byType[typeId].slice(0, 2); break; }
    }
    if (pair) {
      board.delete(pair[0].id);
      board.delete(pair[1].id);
      continue;
    }

    // 优先级 3:只能点单张 -> 选底下压牌最多的进槽
    let bestTile = null, bestUnder = -1;
    for (const t of clickable) {
      let under = 0;
      for (const o of tiles) {
        if (o.id === t.id || !board.has(o.id)) continue;
        if (covers(t, o)) under++;
      }
      if (under > bestUnder) { bestUnder = under; bestTile = t; }
    }
    board.delete(bestTile.id);
    slot.set(bestTile.typeId, bestTile);
    maxSlots = Math.max(maxSlots, slot.size);
  }
  return { minSlots: Math.max(1, maxSlots), solvable: true };
}
  // ========= 手填花色 / 锁牌 =========
  // 钥匙是花色，不是牌型。有锁牌时，非锁牌里正好 2 张是这个花色。
  const KEY_SUIT = 100;

  function preparePinnedFill(fillTiles) {
    fillTiles.forEach(function (t) {
      t.isLock = t.type === 'lock' || t.isLock === true;
      if (t.isLock) t.type = 'lock';
      if (t.manualSuit && t.typeId != null && t.type !== 'spitter') t.pin = Number(t.typeId);
      else t.pin = null;
    });
    const use = fillTiles.some(function (t) { return t.pin != null || t.isLock; });
    return { use: use, error: use ? pinConstraintError(fillTiles) : null };
  }

  function pinConstraintError(tiles) {
    if (!tiles.length) return null;
    if (tiles.length % 2 !== 0) return '可消除的牌数是奇数，无法配对';
    let keyPins = 0;
    let locks = 0;
    let freeNonLock = 0;
    let freeLock = 0;
    const counts = {};
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (t.isLock && t.pin === KEY_SUIT) return '锁牌不能画成钥匙，否则钥匙被锁住就开不了锁';
      if (t.isLock) locks++;
      if (t.pin === KEY_SUIT) {
        if (!t.isLock) keyPins++;
      } else if (t.pin != null) {
        counts[t.pin] = (counts[t.pin] || 0) + 1;
      } else if (t.isLock) {
        freeLock++;
      } else {
        freeNonLock++;
      }
    }
    if (keyPins > 2) return '钥匙花色只能有 2 张，现在画了 ' + keyPins + ' 张';
    let extraKeys = 0;
    if (locks > 0) extraKeys = 2 - keyPins;
    else if (keyPins === 1) extraKeys = 1;
    if (extraKeys > freeNonLock) {
      return '有锁牌时需要正好 2 张钥匙花色，还差 ' + extraKeys + ' 张，没有空着的非锁牌可以填';
    }
    const freeAfter = freeNonLock + freeLock - extraKeys;
    let odds = 0;
    Object.keys(counts).forEach(function (k) { if (counts[k] % 2) odds++; });
    if (odds > freeAfter) return '有 ' + odds + ' 种花色填成了单数，剩下的空牌不够把它们配成对';
    if ((freeAfter - odds) % 2 !== 0) return '空着的牌数无法和手填花色一起配成对';
    return null;
  }

  // 每种已上花色都是双数时，不再要求搜索出一条消除顺序。
  // 贪心搜索只试约 100 次，复杂叠牌经常搜不到，但花色本身已经成对。
  function directEvenAssign(tiles, rng) {
    if (!tiles.length || tiles.length % 2 !== 0) return null;
    const counts = {};
    const free = [];
    for (let i = 0; i < tiles.length; i++) {
      const pin = tiles[i].pin;
      if (pin == null) free.push(i);
      else counts[pin] = (counts[pin] || 0) + 1;
    }
    if (Object.keys(counts).some(function (k) { return counts[k] % 2 !== 0; })) return null;
    const assigned = new Array(tiles.length);
    for (let i = 0; i < tiles.length; i++) {
      assigned[i] = tiles[i].pin != null ? Number(tiles[i].pin) : null;
    }
    let keyPins = 0;
    let locks = 0;
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i].isLock) locks++;
      if (!tiles[i].isLock && tiles[i].pin === KEY_SUIT) keyPins++;
    }
    let needKeys = locks > 0 ? 2 - keyPins : (keyPins === 1 ? 1 : 0);
    if (needKeys < 0) return null;
    let open = free.slice();
    if (needKeys > 0) {
      const pool = open.filter(function (i) { return !tiles[i].isLock; });
      if (pool.length < needKeys) return null;
      shuffle(pool, rng);
      for (let k = 0; k < needKeys; k++) {
        assigned[pool[k]] = KEY_SUIT;
        open = open.filter(function (i) { return i !== pool[k]; });
      }
    }
    if (open.length % 2 !== 0) return null;
    shuffle(open, rng);
    for (let i = 0; i < open.length; i += 2) {
      const type = 1 + Math.floor(rng() * TYPE_COUNT);
      assigned[open[i]] = type;
      assigned[open[i + 1]] = type;
    }
    return { assigned: assigned };
  }

  // 吐牌器队列里手填的花色。没填的位置保持 null，仍由随机填色补。
  function applyQueueSuit(tile, sp, order) {
    const preset = sp && Array.isArray(sp.queueSuits) ? sp.queueSuits : [];
    const raw = preset[order - 1];
    if (raw == null || raw === '') return;
    const suit = Number(raw);
    if (!isFinite(suit)) return;
    tile.typeId = suit;
    tile.manualSuit = true;
  }

  function stampEditorMarks(levelTiles, editorTiles) {
    const marks = {};
    (editorTiles || []).forEach(function (src) {
      if (!src || src.type === 'spitter' || src.spitterOrder != null) return;
      const interesting = src.type === 'lock' || src.type === 'dark' || (src.manualSuit && src.typeId != null);
      if (!interesting) return;
      marks[src.layer + ',' + src.row + ',' + src.col] = src;
    });
    const missing = [];
    Object.keys(marks).forEach(function (key) {
      const found = levelTiles.some(function (lt) {
        return (lt.layer + ',' + lt.row + ',' + lt.col) === key;
      });
      if (!found) missing.push(key);
    });
    if (missing.length) return missing;
    levelTiles.forEach(function (lt) {
      const src = marks[lt.layer + ',' + lt.row + ',' + lt.col];
      if (!src) return;
      if (src.type === 'lock') {
        lt.type = 'lock';
        lt.isLock = true;
      } else if (src.type === 'dark') {
        lt.type = 'dark';
      }
      if (src.manualSuit && src.typeId != null) {
        lt.manualSuit = true;
        lt.typeId = Number(src.typeId);
      }
    });
    return missing;
  }

  function backwardFillPinned(tiles, rng, slotPressure) {
    const n = tiles.length;
    if (n % 2 !== 0) return null;
    slotPressure = slotPressure != null ? slotPressure : 0.5;
    const assigned = new Array(n).fill(null);
    const pairCounts = {};
    const keySet = new Set();
    let keysToPlace = 0;
    let locks = 0;
    for (let i = 0; i < n; i++) {
      if (tiles[i].isLock) locks++;
      if (!tiles[i].isLock && tiles[i].pin === KEY_SUIT) keySet.add(i);
    }
    if (locks > 0) keysToPlace = 2 - keySet.size;
    else if (keySet.size === 1) keysToPlace = 1;
    if (keySet.size > 2 || keysToPlace < 0) return null;

    let remaining = tiles.map(function (t, idx) {
      return {
        layer: t.layer, row: t.row, col: t.col, _idx: idx,
        pin: t.pin != null ? Number(t.pin) : null,
        isLock: !!t.isLock
      };
    });
    let keysCleared = keySet.size + keysToPlace === 0;

    // 手填落单的花色先留一张空牌当伴。这张空牌先不拿去随机配对，也不拿去当钥匙。
    function layerBlocks(a, b) {
      return a.layer !== b.layer && Math.abs(a.row - b.row) < 2 && Math.abs(a.col - b.col) < 2;
    }
    const reservedPartner = new Set();
    const needyPartner = new Map();
    let reserveFailed = false;
    (function reservePartners() {
      const byType = {};
      for (let i = 0; i < n; i++) {
        const pin = tiles[i].pin;
        if (pin != null && pin !== KEY_SUIT) (byType[pin] = byType[pin] || []).push(i);
      }
      const needy = [];
      Object.keys(byType).forEach(function (k) {
        const arr = shuffle(byType[k].slice(), rng);
        if (arr.length % 2 === 1) needy.push(arr[0]);
      });
      const freeIdx = [];
      for (let i = 0; i < n; i++) if (tiles[i].pin == null) freeIdx.push(i);
      shuffle(freeIdx, rng);
      for (let i = 0; i < needy.length; i++) {
        const host = tiles[needy[i]];
        let partner = null;
        for (let j = 0; j < freeIdx.length; j++) {
          const fi = freeIdx[j];
          if (reservedPartner.has(fi)) continue;
          if (layerBlocks(tiles[fi], host)) continue;
          partner = fi;
          break;
        }
        if (partner == null) { reserveFailed = true; return; }
        needyPartner.set(needy[i], partner);
        reservedPartner.add(partner);
      }
    })();
    if (reserveFailed) return null;

    function releaseNeedy(idx) {
      if (!needyPartner.has(idx)) return;
      reservedPartner.delete(needyPartner.get(idx));
      needyPartner.delete(idx);
    }

    function canTake(tile, all) {
      if (locks > 0 && !keysCleared && tile.isLock) return false;
      return isClickable(tile, all);
    }
    function pickType() {
      const eligible = [];
      for (let t = 1; t <= TYPE_COUNT; t++) {
        if ((pairCounts[t] || 0) < 3) eligible.push(t);
      }
      if (!eligible.length) {
        for (let t = 1; t <= TYPE_COUNT; t++) eligible.push(t);
      }
      return eligible[Math.floor(rng() * eligible.length)];
    }
    function removePair(a, b, type) {
      releaseNeedy(a._idx);
      releaseNeedy(b._idx);
      if (reservedPartner.has(a._idx)) reservedPartner.delete(a._idx);
      if (reservedPartner.has(b._idx)) reservedPartner.delete(b._idx);
      assigned[a._idx] = type;
      assigned[b._idx] = type;
      if (type !== KEY_SUIT) pairCounts[type] = (pairCounts[type] || 0) + 1;
      remaining = remaining.filter(function (t) { return t !== a && t !== b; });
    }
    function takePair(pool) {
      const pinned = pool.filter(function (t) { return t.pin != null; });
      const byPin = {};
      pinned.forEach(function (t) { (byPin[t.pin] = byPin[t.pin] || []).push(t); });
      const kinds = Object.keys(byPin);
      shuffle(kinds, rng);
      for (let i = 0; i < kinds.length; i++) {
        const group = byPin[kinds[i]];
        if (group.length >= 2) return { a: group[0], b: group[1], type: Number(kinds[i]) };
      }
      const frees = pool.filter(function (t) { return t.pin == null && !reservedPartner.has(t._idx); });
      shuffle(frees, rng);
      for (let i = 0; i < kinds.length; i++) {
        const only = byPin[kinds[i]];
        if (only.length === 1 && frees.length && !needyPartner.has(only[0]._idx)) {
          return { a: only[0], b: frees[0], type: Number(kinds[i]) };
        }
      }
      if (frees.length < 2) return null;
      let a = frees[0];
      let b = frees[1];
      if (slotPressure > 0 && frees.length >= 4 && rng() < slotPressure) {
        const sorted = frees.slice().sort(function (x, y) { return x.layer - y.layer; });
        const low = sorted[0].layer;
        const high = sorted[sorted.length - 1].layer;
        if (high - low >= 2) {
          const tops = shuffle(sorted.filter(function (t) { return t.layer === high; }).slice(), rng);
          const bot = sorted.find(function (t) { return t.layer === low && t._idx !== tops[0]._idx; });
          if (bot) { a = tops[0]; b = bot; }
        }
      }
      return { a: a, b: b, type: pickType() };
    }

    let guard = 0;
    while (remaining.length) {
      if (++guard > n * 4) return null;
      const clickable = remaining.filter(function (t) { return canTake(t, remaining); });
      if (clickable.length < 2) return null;

      if (keySet.size === 2) {
        const ready = clickable.filter(function (t) { return keySet.has(t._idx); });
        if (ready.length === 2) {
          removePair(ready[0], ready[1], KEY_SUIT);
          keysCleared = true;
          continue;
        }
      }
      if (keysToPlace === 2 && keySet.size === 0) {
        const frees = shuffle(clickable.filter(function (t) {
          return !t.isLock && t.pin == null && !reservedPartner.has(t._idx);
        }).slice(), rng);
        if (frees.length >= 2) {
          keySet.add(frees[0]._idx);
          keySet.add(frees[1]._idx);
          removePair(frees[0], frees[1], KEY_SUIT);
          keysToPlace = 0;
          keysCleared = true;
          continue;
        }
      }
      if (keysToPlace === 1 && keySet.size === 1) {
        const key = clickable.find(function (t) { return keySet.has(t._idx); });
        const frees = shuffle(clickable.filter(function (t) {
          return !t.isLock && t.pin == null && !keySet.has(t._idx) && !reservedPartner.has(t._idx);
        }).slice(), rng);
        if (key && frees.length) {
          keySet.add(frees[0]._idx);
          removePair(key, frees[0], KEY_SUIT);
          keysToPlace = 0;
          keysCleared = true;
          continue;
        }
      }

      let forced = null;
      needyPartner.forEach(function (partnerIdx, needyIdx) {
        if (forced) return;
        const a = clickable.find(function (t) { return t._idx === needyIdx; });
        const b = clickable.find(function (t) { return t._idx === partnerIdx; });
        if (a && b) forced = { a: a, b: b, type: a.pin };
      });
      if (forced) {
        removePair(forced.a, forced.b, forced.type);
        continue;
      }

      const pool = clickable.filter(function (t) { return !keySet.has(t._idx); });
      const pair = takePair(pool);
      if (!pair) return null;
      if (pair.a.pin != null && pair.b.pin != null && pair.a.pin !== pair.b.pin) return null;
      removePair(pair.a, pair.b, pair.type);
    }
    if (locks > 0 && !keysCleared) return null;
    for (let i = 0; i < n; i++) {
      if (tiles[i].pin != null && assigned[i] !== tiles[i].pin) return null;
      if (tiles[i].isLock && assigned[i] === KEY_SUIT) return null;
    }
    const tally = {};
    assigned.forEach(function (typeId) { tally[typeId] = (tally[typeId] || 0) + 1; });
    const bad = Object.keys(tally).some(function (k) { return tally[k] % 2 !== 0; });
    if (bad) return null;
    if (locks > 0 && tally[KEY_SUIT] !== 2) return null;
    return { assigned: assigned };
  }

  // ========= 高层辅助 =========
  function fillEditorShape(editorTiles, editorSpecial, options) {
    options = options || {};
    const editorDiscs = options.discs || []; // 圆盘:用户画笔放置,与 tiles 并列导出
    const darkMode = options.darkMode !== false;
    const darkCoverage = options.darkCoverage != null ? options.darkCoverage : 1;
    const darkRatio = options.darkRatio;
    const darkWeight = options.darkWeight != null ? options.darkWeight : DARK_WEIGHT;
    const slotPressure = options.slotPressure != null ? options.slotPressure : 0.5;
    const rotation = options.rotation || null; // {centerRow, centerCol, radius, direction}
    // ===== 填色前校验（吐牌机相关）=====
    const spitterTilesAll = editorTiles.filter(function (t) { return t.type === 'spitter'; });
    // 队列牌由生成器自动生成（用户不画），所以 editorTiles 里没有队列牌
    const normalCount = editorTiles.length - spitterTilesAll.length;
    // count = 队列牌数量（全部都是吐牌机吐出的牌，初始显示第一张）
    const totalQueueTiles = spitterTilesAll.reduce(function (s, sp) { return s + (sp.count || 0); }, 0);
    // 校验：spitter count 合理性
    for (const sp of spitterTilesAll) {
      if (!sp.count || sp.count < 1 || sp.count > 8) {
        throw new Error('吐牌机 count=' + sp.count + ' 不合理(应为 1~8)');
      }
    }
    // 关键校验：fillTiles = normalCount + totalQueueTiles 必须偶数
    if ((normalCount + totalQueueTiles) % 2 !== 0) {
      throw new Error('吐牌机配置错误：普通牌(' + normalCount + ') + 队列牌(' + totalQueueTiles + ') = ' + (normalCount + totalQueueTiles) + ' 为奇数，无法配对。请调整普通牌数量或吐牌机 count');
    }
    const tiles = editorTiles.map(function (t, i) { return Object.assign({}, t, { _idx: i }); });
    const editorDarkIdx = [];
    const marked = new Set();
    (editorSpecial || []).forEach(function (s) {
      const i = tiles.findIndex(function (t) {
        return t.spitterOrder == null && t.type !== 'spitter' && t.layer === s.layer && t.row === s.row && t.col === s.col;
      });
      if (i < 0) return;
      if (s.type === 'lock') { tiles[i].type = 'lock'; tiles[i].isLock = true; }
      if (s.type === 'dark' && !marked.has(i)) { editorDarkIdx.push(i); marked.add(i); }
    });
    tiles.forEach(function (t, i) {
      if (t.type === 'dark' && !marked.has(i)) { editorDarkIdx.push(i); marked.add(i); }
    });
    // ===== 校验 target 位置支撑 =====
    // L1+ 的吐牌机：指向的位置必须有支撑（下方有下层牌托住），否则生成报错
    // L0 的吐牌机：target 在底层，地面就是支撑，无需校验
    for (const sp of spitterTilesAll) {
      if (sp.layer === 0) continue; // L0 无需检查支撑
      const targetRow = sp.row + ({up:-2,down:2,left:0,right:0}[sp.dir] || 0);
      const targetCol = sp.col + ({up:0,down:0,left:-2,right:2}[sp.dir] || 0);
      // 检查 target 位置在 sp.layer 层是否有支撑（象限规则：下方要有下层牌）
      const lowerTiles = editorTiles.filter(t => t.layer < sp.layer);
      if (!hasSupport(targetRow, targetCol, lowerTiles)) {
        throw new Error('吐牌机 [L' + sp.layer + ',' + sp.row + ',' + sp.col + '] 指向位置 (' + targetRow + ',' + targetCol + ') 无支撑：下方缺少下层牌托住。请在指向位置下方加牌，或调整吐牌机方向/位置');
      }
    }
    // ===== 在 backwardFill 之前生成队列牌（typeId = null，由 backwardFill 分配）=====
    // count = 队列牌数量（全部都是吐牌机吐出的牌）
    // 吐牌机机制：初始显示第一张（spitterOrder=1），点一张吐一张
    // 所有队列牌放在同一层（与 target 同层），demo 根据 spitterReleasedCount 决定显示哪张
    for (const sp of spitterTilesAll) {
      const targetRow = sp.row + ({up:-2,down:2,left:0,right:0}[sp.dir] || 0);
      const targetCol = sp.col + ({up:0,down:0,left:-2,right:2}[sp.dir] || 0);
      const queueCount = sp.count; // count = 队列牌数量
      for (let i = 1; i <= queueCount; i++) {
        const qt = {
          id: 0,
          layer: sp.layer, // 与 target 同层（不叠放，一次只显示一张）
          row: targetRow,
          col: targetCol,
          typeId: null,
          spitterOrder: i,
        };
        applyQueueSuit(qt, sp, i);
        tiles.push(qt);
      }
    }

    // 吐牌机本体不参与填色（不是麻将）
    const spitterIdxSet = new Set();
    tiles.forEach((t, i) => {
      if (t.type === 'spitter') spitterIdxSet.add(i);
    });
    // fillTiles 包含：普通牌、target 位置的牌、占位牌、队列牌
    // 排除：吐牌机本体
    const fillTiles = tiles.filter(function (t, i) {
      return !spitterIdxSet.has(i);
    });

    // fillTiles 偶数校验（backwardFill 要求）
    if (fillTiles.length % 2 !== 0) {
      throw new Error('总可消除牌数 ' + fillTiles.length + ' 为奇数，无法配对。请调整普通牌数量或吐牌机 count（普通牌 + 队列牌 必须为偶数）');
    }

    // 手填花色 / 锁牌走独立填色：填过的 typeId 不改，空牌才随机。
    // 没有任何手填、也没有锁牌时，仍走原来的整关保留或 backwardFill。
    const pinned = preparePinnedFill(fillTiles);
    if (pinned.error) throw new Error(pinned.error);

    // ===== 完整导入 → 保留原牌面(不重新填色) =====
    // 仅当:无吐牌机队列牌,且每张可消除牌都带非空 typeId(用户导入了完整关卡)。
    // 且花色计数成对 + 正向可解。任一不满足 → 照旧 backwardFill 全量重填(结果仍合法)。
    const hasQueue = fillTiles.some(function (t) { return t.spitterOrder != null; });
    const fullImported = !pinned.use && !hasQueue && fillTiles.length > 0 && fillTiles.every(function (t) { return t.typeId != null; });
    let preserve = false;
    if (fullImported) {
      const cnt = {};
      let even = true;
      fillTiles.forEach(function (t) { cnt[t.typeId] = (cnt[t.typeId] || 0) + 1; });
      Object.keys(cnt).forEach(function (k) { if (cnt[k] % 2 !== 0) even = false; });
      if (even && forwardEliminable(fillTiles)) preserve = true;
    }

    let result = null;
    if (preserve) {
      // 原样使用导入的 typeId(不重新填色),让"导入→生成"复现同一关
      result = { assigned: fillTiles.map(function (t) { return t.typeId; }) };
    } else if (pinned.use) {
      const startSeed = Math.floor(Math.random() * 1000) + 1;
      result = directEvenAssign(fillTiles, makeRng(startSeed * 9301 + 49297));
      if (!result) {
        for (let seed = startSeed; seed <= startSeed + 100 && !result; seed++) {
          result = backwardFillPinned(fillTiles, makeRng(seed * 9301 + 49297), slotPressure);
        }
      }
      if (!result) throw new Error('手填的花色和锁牌在这个形状下配不成可解关卡。请改几张花色，或不要把钥匙放在锁牌下面。');
    } else {
      const startSeed = Math.floor(Math.random() * 1000) + 1;
      for (let seed = startSeed; seed <= startSeed + 100 && !result; seed++) {
        result = backwardFill(fillTiles, makeRng(seed * 9301 + 49297), slotPressure);
      }
      if (!result) throw new Error('fill failed after 100 retries');
    }

    // 把填色结果写回非 spitter 的牌（包括普通牌、target 牌、队列牌）
    let fillIdx = 0;
    tiles.forEach(function (t, i) {
      if (spitterIdxSet.has(i)) return;
      if (result.assigned[fillIdx] !== undefined) t.typeId = result.assigned[fillIdx];
      fillIdx++;
    });

    // ===== 校验 =====
    // 1. 队列牌必须有支撑(不能悬空)——L0 除外（地面就是支撑）
    const queueTiles = tiles.filter(function (t) { return t.spitterOrder != null; });
    for (const st of queueTiles) {
      if (st.layer === 0) continue; // L0 无需检查支撑
      if (!hasSupport(st.row, st.col, tiles.filter(function (t) { return t !== st && t.layer < st.layer; }))) {
        throw new Error(`吐牌机队列牌 [L${st.layer},${st.row},${st.col}] 悬空无支撑`);
      }
    }
    // 2. 总可消除牌 = fillTiles + spitter.count,必须偶数(已在前面校验 totalElimination,这里不需要重复)

    let darkIdx = editorDarkIdx.slice();
    const lockIdx = [];
    const queuePinIdx = [];
    const keepFaceIdx = [];
    tiles.forEach(function (t, i) {
      if (t.type === 'lock' || t.isLock) lockIdx.push(i);
      if (t.spitterOrder != null && t.manualSuit) queuePinIdx.push(i);
      // 已经手填花色、又不是暗牌笔的，不能再被暗牌比例翻成暗牌
      if (t.manualSuit && t.type !== 'dark' && t.type !== 'lock' && !t.isLock) keepFaceIdx.push(i);
      if (t._keepFace) keepFaceIdx.push(i);
    });
    lockIdx.forEach(function (i) { marked.add(i); });
    queuePinIdx.forEach(function (i) { marked.add(i); });
    keepFaceIdx.forEach(function (i) { marked.add(i); });
    if (darkMode && darkRatio != null) {
      const target = Math.max(1, Math.round(tiles.length * darkRatio));
      const need = Math.max(0, target - darkIdx.length);
      if (need > 0) {
        const darkRng = makeRng(99999);
        const darkOpts = {
          coverageRate: darkCoverage,
          totalCount: need,
          excludeIdx: lockIdx.concat(queuePinIdx).concat(keepFaceIdx).concat(editorDarkIdx)
        };
        assignDarkTiles(tiles, darkRng, darkOpts).forEach(function (i) {
          if (!marked.has(i)) { darkIdx.push(i); marked.add(i); }
        });
      }
    }
    const darkSet = new Set(darkIdx);
    tiles.sort(function (a, b) { return a.layer - b.layer || a.row - b.row || a.col - b.col; });
    tiles.forEach(function (t, i) { t.id = i + 1; });
    const finalTiles = tiles.map(function (t) {
      const o = Object.assign({}, t); delete o._idx; delete o.pin; delete o.queueSuits; delete o._keepFace;
      o.isLock = t.type === 'lock' || t.isLock === true;
      if (o.isLock) {
        o.isDark = false;
        o.type = 'lock';
      } else {
        o.isDark = darkSet.has(t._idx) || t.type === 'dark';
      }
      return o;
    });
    const specialTiles = finalTiles.filter(function (t) { return t.isDark; })
      .map(function (t) { return { id: t.id, type: 'dark', layer: t.layer, row: t.row, col: t.col }; });
    finalTiles.forEach(function (t) {
      if (t.isLock) specialTiles.push({ id: t.id, type: 'lock', layer: t.layer, row: t.row, col: t.col });
    });
    const darkIds = new Set(finalTiles.filter(function (t) { return t.isDark; }).map(function (t) { return t.id; }));
    const diff = evaluateDifficulty({ tiles: finalTiles }, darkIds, darkWeight);
    return {
      levelId: 1, totalPairs: Math.floor(finalTiles.length / 2), tiles: finalTiles, specialTiles: specialTiles,
      rotation: rotation, discs: editorDiscs, _difficulty: diff,
      leafCover: Array.isArray(options.leafLayers) ? options.leafLayers.length > 0 : !!options.leafCover,
      leafLayers: Array.isArray(options.leafLayers) ? options.leafLayers.slice() : null,
      manualSuits: fillTiles.some(function (t) { return t.pin != null; })
    };
  }

  function generateAndFill(options) {
    options = options || {};
    const editorDiscs = options.discs || []; // 圆盘:用户画笔放置,与 tiles 并列导出
    const darkMode = options.darkMode !== false;
    const darkCoverage = options.darkCoverage != null ? options.darkCoverage : 1;
    const darkRatio = options.darkRatio;
    const darkWeight = options.darkWeight != null ? options.darkWeight : DARK_WEIGHT;
    const slotPressure = options.slotPressure != null ? options.slotPressure : 0.5;
    const layerMap = {};
    TEMPLATE_T2_GONG.tiles.forEach(function (t) {
      (layerMap[t.layer] = layerMap[t.layer] || []).push({ row: t.col, col: t.row });
    });
    const layerNums = Object.keys(layerMap).map(Number).sort(function (a, b) { return a - b; });
    const template = { layers: layerNums.map(function (l) { return { layer: l, cells: layerMap[l] }; }), layerCount: layerNums.length };
    const layers = template.layerCount === 1 ? 6 : template.layerCount;
    const shape = generateFromTemplate(template, { layerCount: layers });
    const v = validateShape(shape);
    if (!v.ok) throw new Error('validate failed: ' + v.errors.slice(0, 2).join('; '));
    const level = toEditorJSON(shape, 1);
    let result = null;
    const startSeed = Math.floor(Math.random() * 1000) + 1;
    for (let seed = startSeed; seed <= startSeed + 100 && !result; seed++) {
      result = backwardFill(level.tiles, makeRng(seed * 1000 + 42), slotPressure);
    }
    if (!result) throw new Error('fill failed');
    const filled = {
      levelId: level.levelId, totalPairs: level.totalPairs,
      tiles: level.tiles.map(function (t, j) { return Object.assign({}, t, { typeId: result.assigned[j] }); }),
      specialTiles: []
    };
    if (darkMode) {
      const darkRng = makeRng(7777);
      const darkOpts = { coverageRate: darkCoverage };
      if (darkRatio != null) darkOpts.totalCount = Math.max(1, Math.round(filled.tiles.length * darkRatio));
      const darkIdx = assignDarkTiles(filled.tiles, darkRng, darkOpts);
      const dSet = new Set(darkIdx);
      const special = [];
      darkIdx.forEach(function (j) {
        filled.tiles[j].isDark = true;
        special.push({ id: filled.tiles[j].id, type: 'dark', layer: filled.tiles[j].layer, row: filled.tiles[j].row, col: filled.tiles[j].col });
      });
      filled.tiles = filled.tiles.map(function (t, j) { return Object.assign({}, t, { isDark: dSet.has(j) }); });
      filled.specialTiles = special;
    } else {
      filled.tiles = filled.tiles.map(function (t) { return Object.assign({}, t, { isDark: false }); });
    }
    const darkIds = new Set((filled.specialTiles || []).map(function (s) { return s.id; }));
    const diff = evaluateDifficulty(filled, darkIds, darkWeight);
    filled._difficulty = diff;
    filled.discs = editorDiscs;
    return filled;
  }

  function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  // ===== 堆塔生成：以用户画的形状为底，自动往上堆层 + 填色 =====
  function generateStackFromShape(editorTiles, options) {
    options = options || {};
    const editorDiscs = options.discs || []; // 圆盘:用户画笔放置,与 tiles 并列导出
    const darkMode = options.darkMode !== false;
    const darkCoverage = options.darkCoverage != null ? options.darkCoverage : 1;
    const darkRatio = options.darkRatio;
    const darkWeight = options.darkWeight != null ? options.darkWeight : DARK_WEIGHT;
    const layerCount = options.layerCount || 5;
    const slotPressure = options.slotPressure != null ? options.slotPressure : 0.5;
    // 吐牌机信息（从 editor 传过来）
    const editorSpitters = options.spitters || []; // [{ targetLayer, targetRow, targetCol, count }]
    const editorQueueTiles = options.queueTiles || []; // [{ layer, row, col, spitterOrder }]
    // 编辑器形状是 std（row=纵/col=横），生成器内部用 row=横/col=纵 → swap
    const layerMap = {};
    editorTiles.forEach(function (t) {
      (layerMap[t.layer] = layerMap[t.layer] || []).push({ row: t.col, col: t.row });
    });
    const layerNums = Object.keys(layerMap).map(Number).sort(function (a, b) { return a - b; });
    if (layerNums.length === 0) throw new Error('空形状');
    // ===== 底座校验（含吐牌机）=====
    const editorSpitterCount = editorTiles.filter(function (t) { return t.type === 'spitter'; }).length;
    const editorNormalCount = editorTiles.length - editorSpitterCount;
    // 校验 spitter count 合理性
    for (const sp of editorSpitters) {
      if (!sp.count || sp.count < 1 || sp.count > 8) {
        throw new Error('吐牌机 count=' + sp.count + ' 不合理(应为 1~8)');
      }
    }
    // count = 队列牌数量（全部都是吐牌机吐出的牌）
    const totalQueueTiles = editorSpitters.reduce(function (s, sp) { return s + (sp.count || 0); }, 0);
    // ===== 校验 target 位置支撑 =====
    // L1+ 的吐牌机：指向的位置必须有支撑（下方有下层牌托住），否则生成报错
    // L0 的吐牌机：target 在底层，地面就是支撑，无需校验
    for (const sp of editorSpitters) {
      if (sp.layer === 0) continue; // L0 无需检查支撑
      const targetRow = sp.row + ({up:-2,down:2,left:0,right:0}[sp.dir] || 0);
      const targetCol = sp.col + ({up:0,down:0,left:-2,right:2}[sp.dir] || 0);
      const lowerTiles = editorTiles.filter(t => t.layer < sp.layer);
      if (!hasSupport(targetRow, targetCol, lowerTiles)) {
        throw new Error('吐牌机 [L' + sp.layer + ',' + sp.row + ',' + sp.col + '] 指向位置 (' + targetRow + ',' + targetCol + ') 无支撑：下方缺少下层牌托住。请在指向位置下方加牌，或调整吐牌机方向/位置');
      }
    }
    // 堆塔路径不预先检查队列牌奇偶性：堆上去的牌数是随机的，
    // 实际总牌数 = shape.tiles + queueTiles，由 backwardFill 在填色时判断奇偶并重试
    const template = { layers: layerNums.map(function (l) { return { layer: l, cells: layerMap[l] }; }), layerCount: layerNums.length };
    // 检测底座是否左右对称（std 坐标：每个 (layer,row,col) 都要有 (layer,row,-col)）
    // 对称底座 → 正常镜像堆塔；不对称底座 → 关掉镜像展开、跳过对称校验，按实际形状堆
    const symSet = new Set();
    editorTiles.forEach(function (t) { symSet.add(t.layer + ',' + t.row + ',' + t.col); });
    const baseSymmetric = editorTiles.every(function (t) { return symSet.has(t.layer + ',' + t.row + ',' + (-t.col)); });
    const mirror = baseSymmetric;
    // 搭塔+填色:塔形可能不可解,需要重搭新塔形(而非同一死形重试)
    let filled = null;
    for (let attempt = 0; attempt < 30 && !filled; attempt++) {
      const shape = generateFromTemplate(template, { layerCount: layerCount, mirror: mirror });
      const v = validateShape(shape, { skipSymmetry: !mirror });
      if (!v.ok) continue; // 校验不过就重搭
      // 队列牌总数奇数 → 让 shape 也保持奇数（叠加后总牌数才能偶）
      const skipParity = totalQueueTiles % 2 !== 0;
      const level = toEditorJSON(shape, 1, skipParity);
      if (stampEditorMarks(level.tiles, editorTiles).length) continue;
      // 把编辑器的吐牌机队列牌和吐牌机标记加到 stacked 结果中
      const editorSpitters = options.spitters || [];
      // 堆塔路径:spitter 本体不参与填色(保持 typeId=null,不是麻将)
      const levelSpitterIdxSet = new Set();
      level.tiles.forEach((t, i) => { if (t.type === 'spitter') levelSpitterIdxSet.add(i); });

      // ===== 在 backwardFill 之前生成队列牌和支撑牌（typeId = null，由 backwardFill 分配）=====
      // count 包含初始牌，队列牌数量 = count - 1
      // 队列牌堆叠在 target 位置上方，与普通牌视觉叠放一致
      // layer 排序：spitterOrder=1（layer 最低，紧贴 target）→ spitterOrder=count-1（layer 最高，最上面先点）
      const queueTiles = [];
      for (const sp of editorSpitters) {
        const targetRow = sp.row + ({up:-2,down:2,left:0,right:0}[sp.dir] || 0);
        const targetCol = sp.col + ({up:0,down:0,left:-2,right:2}[sp.dir] || 0);
        // 生成 count 张队列牌（count = 队列牌数量）
        // 吐牌机机制：初始显示第一张，点一张吐一张
        // 所有队列牌放在同一层（与 target 同层）
        const queueCount = sp.count;
        for (let i = 1; i <= queueCount; i++) {
          const qt = {
            id: 0,
            layer: sp.layer, // 与 target 同层（不叠放，一次只显示一张）
            row: targetRow,
            col: targetCol,
            typeId: null,
            spitterOrder: i,
          };
          applyQueueSuit(qt, sp, i);
          queueTiles.push(qt);
        }
      }

      // fillTiles 包含：普通牌 + 队列牌（排除吐牌机本体）
      const fillTiles = level.tiles.filter((t, i) => !levelSpitterIdxSet.has(i)).concat(queueTiles);
      const pinned = preparePinnedFill(fillTiles);
      if (pinned.error && (pinned.error.indexOf('锁牌不能') === 0 || pinned.error.indexOf('钥匙花色只能') === 0)) {
        throw new Error(pinned.error);
      }
      if (pinned.error) continue;

      // 填色（让 backwardFill 自己处理奇偶/可解性，不做前置校验）
      const startSeed = Math.floor(Math.random() * 1000) + 1;
      for (let seed = startSeed; seed <= startSeed + 50 && !filled; seed++) {
        let result = null;
        try {
          result = pinned.use
            ? (directEvenAssign(fillTiles, makeRng(seed * 1000 + 42)) || backwardFillPinned(fillTiles, makeRng(seed * 1000 + 42), slotPressure))
            : backwardFill(fillTiles, makeRng(seed * 1000 + 42), slotPressure);
        } catch (e) {
          if (pinned.use && e.message && e.message.indexOf('锁牌不能') === 0) throw e;
          // backwardFill 抛错（奇数牌数等），跳过此 seed
          continue;
        }
        if (result) {
          // 把填色结果写回（跳过吐牌机）
          let fillIdx = 0;
          const assignedTiles = level.tiles.map((t, i) => {
            if (levelSpitterIdxSet.has(i)) return Object.assign({}, t, { typeId: null });
            const newT = Object.assign({}, t, { typeId: result.assigned[fillIdx] });
            delete newT.pin;
            fillIdx++;
            return newT;
          });
          // 把填色结果写回队列牌
          queueTiles.forEach(function (qt) {
            qt.typeId = result.assigned[fillIdx];
            fillIdx++;
          });

          // 先 push spitter 本体（不参与填色，typeId=null）
          editorSpitters.forEach(function (sp) {
            assignedTiles.push({
              id: 0, layer: sp.layer, row: sp.row, col: sp.col,
              typeId: null, type: 'spitter', dir: sp.dir, count: sp.count,
            });
          });
          // 再 push 队列牌
          queueTiles.forEach(function (qt) { assignedTiles.push(qt); });

          // 重新分配 id
          assignedTiles.forEach((t, i) => { t.id = i + 1; });
          // 最终支撑兜底：防止偶化删牌/mirror 展开/回填重排让上层牌悬空
          if (!levelHasFullSupport(assignedTiles)) {
            filled = null; // 该塔形不可行 → 跳出内层，重搭新塔形
            break;
          }
          filled = {
            levelId: level.levelId, totalPairs: level.totalPairs,
            tiles: assignedTiles,
            specialTiles: [], // spitter 标记在 level.tiles 里通过 type 字段标识
            rotation: options.rotation || null, // 堆塔路径也要输出旋转配置
            manualSuits: assignedTiles.some(function (t) { return !!t.manualSuit; })
          };
        }
      }
    }
    if (!filled) throw new Error('堆塔后无法完成填色(底座形状可能导致无解,试试调整底座形状或减少堆层数)');

    // 吐牌机验证（L0 除外，地面就是支撑）
    const spitterTiles = filled.tiles.filter(t => t.spitterOrder != null);
    for (const st of spitterTiles) {
      if (st.layer === 0) continue; // L0 无需检查支撑
      if (!hasSupport(st.row, st.col, filled.tiles.filter(t => t !== st && t.layer < st.layer))) {
        throw new Error(`吐牌机队列牌 [L${st.layer},${st.row},${st.col}] 悬空无支撑`);
      }
    }
    // 总牌数校验：凑偶后 shape.tiles 必为偶数(targetParity 与队列总数一致),且 +1 spitter 本体 + queueCount → 偶数
    // 上面的循环已保证 shape.tiles.length % 2 === totalQueueCount % 2
    // 所以总牌数 = shape.tiles.length + 1(spitter) + totalQueueCount,奇偶性 = 偶 ✓
    // (堆塔路径不再额外校验)

    // 暗牌。锁牌保持锁牌，不会被随机改成暗牌。
    const lockIdx = [];
    const queuePinIdx = [];
    const keepFaceIdx = [];
    const paintedDarkIdx = [];
    filled.tiles.forEach(function (t, i) {
      if (t.type === 'lock' || t.isLock) lockIdx.push(i);
      else if (t.type === 'dark') paintedDarkIdx.push(i);
      if (t.spitterOrder != null && t.manualSuit) queuePinIdx.push(i);
      if (t.manualSuit && t.type !== 'dark' && t.type !== 'lock' && !t.isLock) keepFaceIdx.push(i);
      if (t._keepFace) keepFaceIdx.push(i);
    });
    const dSet = new Set(paintedDarkIdx);
    if (darkMode && darkRatio != null) {
      const target = Math.max(1, Math.round(filled.tiles.length * darkRatio));
      const need = Math.max(0, target - dSet.size);
      if (need > 0) {
        const darkRng = makeRng(7777);
        const darkOpts = {
          coverageRate: darkCoverage,
          totalCount: need,
          excludeIdx: lockIdx.concat(queuePinIdx).concat(keepFaceIdx).concat(paintedDarkIdx)
        };
        assignDarkTiles(filled.tiles, darkRng, darkOpts).forEach(function (j) {
          if (!dSet.has(j) && lockIdx.indexOf(j) < 0 && queuePinIdx.indexOf(j) < 0 && keepFaceIdx.indexOf(j) < 0) dSet.add(j);
        });
      }
    }
    filled.tiles = filled.tiles.map(function (t, j) {
      const isLock = t.type === 'lock' || t.isLock === true;
      const o = Object.assign({}, t);
      delete o.pin;
      o.isLock = isLock;
      if (isLock) { o.type = 'lock'; o.isDark = false; }
      else o.isDark = dSet.has(j);
      return o;
    });
    const special = [];
    filled.tiles.forEach(function (t) {
      if (t.isDark) special.push({ id: t.id, type: 'dark', layer: t.layer, row: t.row, col: t.col });
      if (t.isLock) special.push({ id: t.id, type: 'lock', layer: t.layer, row: t.row, col: t.col });
    });
    filled.specialTiles = special;
    const darkIds = new Set(special.filter(function (s) { return s.type === 'dark'; }).map(function (s) { return s.id; }));
    const diff = evaluateDifficulty(filled, darkIds, darkWeight);
    filled._difficulty = diff;
    filled.discs = editorDiscs;
    filled.leafCover = Array.isArray(options.leafLayers) ? options.leafLayers.length > 0 : !!options.leafCover;
    filled.leafLayers = Array.isArray(options.leafLayers) ? options.leafLayers.slice() : null;
    if (filled.manualSuits == null) filled.manualSuits = filled.tiles.some(function (t) { return !!t.manualSuit; });
    return filled;
  }

  // ============ 目标分数 → 期望可点率(软目标,反驱动) ============
  // 用户想要的耦合:目标分数越低 → 生成越"开"的塔(可点率高);越高 → 埋得越多(可点率低)。
  // 真实驱动是塔形密度(层数):分数主要由层数 + 可点率项 (1-cr)*30 决定。
  // 这里给一个朝向性期望(软目标,供编辑器展示 + 候选择优),生成器在可选塔形里朝它靠。
  // 注意:绝对可点率带宽取决于底座(实测 4×5 平底约 0.10~0.22),故此为"引导"而非"硬达标"。
  function desiredClickRatio(scoreMid) {
    if (scoreMid <= 55) return 0.50;   // 很低分 → 尽量好点
    if (scoreMid <= 70) return 0.38;
    if (scoreMid <= 85) return 0.28;
    if (scoreMid <= 105) return 0.20;
    return 0.12;                        // 很高分 → 大多被埋
  }

  global.GEN = {
    TEMPLATE_T2_GONG: TEMPLATE_T2_GONG,
    loadTemplate: loadTemplate, generateFromTemplate: generateFromTemplate, validateShape: validateShape, toEditorJSON: toEditorJSON, drawShape: drawShape,
    keyOf: keyOf, mirrorRow: mirrorRow, inBounds: inBounds, hasSupport: hasSupport, quadCovered: quadCovered,
    NAMES: NAMES, DARK_RATIO_MIN: DARK_RATIO_MIN, DARK_RATIO_MAX: DARK_RATIO_MAX, DARK_WEIGHT: DARK_WEIGHT,
    makeRng: makeRng, shuffle: shuffle, covers: covers, isClickable: isClickable,
    desiredClickRatio: desiredClickRatio, backwardFill: backwardFill, backwardFillPinned: backwardFillPinned, pinConstraintError: pinConstraintError, KEY_SUIT: KEY_SUIT, verifyByElimination: verifyByElimination, assignDarkTiles: assignDarkTiles, evaluateDifficulty: evaluateDifficulty, reshufflePlayLevel: reshufflePlayLevel, rhythmFill: rhythmFill, deadRescueFill: deadRescueFill, verifySolution: verifySolution,
    fillEditorShape: fillEditorShape, generateAndFill: generateAndFill, generateStackFromShape: generateStackFromShape, downloadJSON: downloadJSON,
  };
})(typeof window !== 'undefined' ? window : globalThis);
