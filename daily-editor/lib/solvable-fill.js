/**
 * 可解花色生成 — 每日挑战专用
 *
 * 可点规则与正式客户端对齐（产品统一口径）：
 * 1) 上方遮挡：只检查 layer+1（紧邻上层），同层足迹 abs(row)<2 且 abs(col)<2
 * 2) 左右夹击：同层、col±2、abs(row差)<2；左右同时存在则不可拿
 *
 * 花色：不再限制 31 种。按「每花色对数」pairsPerSuit 配置，
 * 由总对数算出所需花色种类 typeCount = ceil(totalPairs / pairsPerSuit)。
 * 牌面资源仍可按 faceCount(默认 31) 取模映射显示。
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DailySolvableFill = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /** @deprecated 仅作牌面资源数量参考，不再限制生成 typeId 上限 */
    const FACE_COUNT = 31;
    const MIN_TYPE_ID = 1;
    const DEFAULT_PAIRS_PER_SUIT = 2;
    const DEFAULT_RETRIES = 100;
    const SOLVE_TIMEOUT_MS = 8000;

    /** 产品统一：遮挡只看紧邻上层 */
    const COVER_ONLY_NEXT_LAYER = true;

    function shuffle(arr, rng) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

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

    function footprintsOverlap(a, b) {
        return Math.abs(a.row - b.row) < 2 && Math.abs(a.col - b.col) < 2;
    }

    /**
     * 与正式客户端一致的可点判定。
     * cover: 仅 layer === tile.layer + 1 且足迹重叠
     * sandwich: 同层 col±2 且 abs(row)<2，左右皆有则不可拿
     */
    function isClickable(tile, all) {
        if (!tile) return false;
        for (let i = 0; i < all.length; i++) {
            const o = all[i];
            if (o === tile || o.id === tile.id) continue;
            if (COVER_ONLY_NEXT_LAYER) {
                if (o.layer !== tile.layer + 1) continue;
            } else if (!(o.layer > tile.layer)) {
                continue;
            }
            if (footprintsOverlap(o, tile)) return false;
        }
        const same = [];
        for (let i = 0; i < all.length; i++) {
            const t = all[i];
            if (t === tile || t.id === tile.id) continue;
            if (t.layer === tile.layer) same.push(t);
        }
        const hasL = same.some((t) => t.col === tile.col - 2 && Math.abs(t.row - tile.row) < 2);
        const hasR = same.some((t) => t.col === tile.col + 2 && Math.abs(t.row - tile.row) < 2);
        return !(hasL && hasR);
    }

    function resolvePairsPerSuit(opts) {
        const n = opts && opts.pairsPerSuit != null ? Number(opts.pairsPerSuit) : DEFAULT_PAIRS_PER_SUIT;
        if (!Number.isFinite(n) || n < 1) return DEFAULT_PAIRS_PER_SUIT;
        return Math.floor(n);
    }

    /** 总对数 → 所需花色种类数（不设 31 上限） */
    function computeTypeCount(totalPairs, pairsPerSuit) {
        const pps = Math.max(1, pairsPerSuit | 0);
        const pairs = Math.max(0, totalPairs | 0);
        if (pairs === 0) return 0;
        return Math.ceil(pairs / pps);
    }

    function buildTypePool(totalPairs, rng, opts) {
        const pairsPerSuit = resolvePairsPerSuit(opts || {});
        const typeCount = computeTypeCount(totalPairs, pairsPerSuit);
        if (typeCount < 1) throw new Error('总对数为 0，无法分配花色');

        const counts = new Array(typeCount).fill(0);
        let placedPairs = 0;
        while (placedPairs < totalPairs) {
            const eligible = [];
            for (let t = 0; t < typeCount; t++) {
                if (counts[t] < pairsPerSuit) eligible.push(t);
            }
            const pool = eligible.length ? eligible : Array.from({ length: typeCount }, (_, i) => i);
            const t = pool[Math.floor(rng() * pool.length)];
            counts[t]++;
            placedPairs++;
        }
        const typePool = [];
        counts.forEach((c, t) => {
            for (let k = 0; k < c; k++) typePool.push(t + MIN_TYPE_ID);
        });
        shuffle(typePool, rng);
        return { typePool, typeCount, pairsPerSuit, counts };
    }

    function backwardFill(tiles, rng, slotPressure, opts) {
        const n = tiles.length;
        const totalPairs = n / 2;
        if (totalPairs !== Math.floor(totalPairs)) {
            throw new Error(`牌数为奇数 ${n}`);
        }
        slotPressure = slotPressure != null ? slotPressure : 0.5;

        const plan = buildTypePool(totalPairs, rng, opts);
        const typePool = plan.typePool;

        const assigned = new Array(n).fill(0);
        const pairsPlaced = [];
        let remaining = tiles.map((t, idx) => ({ ...t, _idx: idx }));

        let guard = 0;
        while (remaining.length > 0) {
            if (++guard > n * 4) return null;
            const clickable = remaining.filter((t) => isClickable(t, remaining));
            if (clickable.length < 2) return null;

            const type = typePool[pairsPlaced.length];
            let t1;
            let t2;

            const progress = pairsPlaced.length / totalPairs;
            const useLayering = slotPressure > 0 && progress < 0.7 && clickable.length >= 4;

            if (useLayering) {
                const sorted = clickable.slice().sort((a, b) => a.layer - b.layer);
                const lowLayer = sorted[0].layer;
                const highLayer = sorted[sorted.length - 1].layer;
                if (highLayer - lowLayer >= 2 && rng() < slotPressure) {
                    const topCandidates = sorted.filter((t) => t.layer === highLayer);
                    const bottomCandidates = sorted.filter((t) => t.layer === lowLayer);
                    shuffle(topCandidates, rng);
                    t1 = topCandidates[0];
                    t2 = bottomCandidates.find((c) => c._idx !== t1._idx);
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
            remaining = remaining.filter((t) => t !== t1 && t !== t2);
        }
        return {
            assigned,
            pairsPlaced,
            typeCount: plan.typeCount,
            pairsPerSuit: plan.pairsPerSuit,
        };
    }

    function verifyByElimination(tiles, pairsPlaced) {
        const remaining = new Map(tiles.map((t) => [t.id, t]));
        for (let k = 0; k < pairsPlaced.length; k++) {
            const id1 = tiles[pairsPlaced[k][0]].id;
            const id2 = tiles[pairsPlaced[k][1]].id;
            const t1 = remaining.get(id1);
            const t2 = remaining.get(id2);
            if (!t1 || !t2) return { ok: false, reason: `牌 ${id1}/${id2} 已不在场` };
            if (t1.typeId !== t2.typeId) return { ok: false, reason: 'type 不同' };
            const all = [...remaining.values()];
            if (!isClickable(t1, all) || !isClickable(t2, all)) {
                return { ok: false, reason: `牌 ${id1}/${id2} 该步不可点` };
            }
            remaining.delete(id1);
            remaining.delete(id2);
        }
        return { ok: remaining.size === 0 };
    }

    function forwardEliminable(arr) {
        let remaining = arr.slice();
        while (remaining.length > 0) {
            const clickable = remaining.filter((t) => isClickable(t, remaining));
            if (clickable.length < 2) return false;
            const byType = {};
            clickable.forEach((t) => {
                (byType[t.typeId] ||= []).push(t);
            });
            let pair = null;
            for (const k in byType) {
                if (byType[k].length >= 2) {
                    pair = byType[k].slice(0, 2);
                    break;
                }
            }
            if (!pair) return false;
            remaining = remaining.filter((t) => t !== pair[0] && t !== pair[1]);
        }
        return true;
    }

    function isDailyTile(t) {
        return t && t.type !== 'spitter' && typeof t.spitterOrder !== 'number';
    }

    function getDailyTiles(level) {
        return (level?.tiles ?? []).filter(isDailyTile);
    }

    function computeLayoutFingerprint(levelOrTiles) {
        const tiles = Array.isArray(levelOrTiles) ? levelOrTiles : getDailyTiles(levelOrTiles);
        const sig = tiles
            .map((t) => ({
                id: t.id,
                layer: t.layer,
                row: t.row,
                col: t.col,
                isDark: !!t.isDark,
            }))
            .sort((a, b) => a.id - b.id);
        return JSON.stringify(sig);
    }

    function pairsPlacedToSolution(tiles, pairsPlaced) {
        return pairsPlaced.map(([i1, i2]) => ({ id1: tiles[i1].id, id2: tiles[i2].id }));
    }

    function solutionToPairsPlaced(tiles, solution) {
        const idToIdx = new Map(tiles.map((t, i) => [t.id, i]));
        return solution.map(({ id1, id2 }) => [idToIdx.get(id1), idToIdx.get(id2)]);
    }

    function extractGreedySolution(tiles) {
        let remaining = tiles.slice();
        const moves = [];
        while (remaining.length > 0) {
            const clickable = remaining.filter((t) => isClickable(t, remaining));
            if (clickable.length < 2) return null;
            const byType = {};
            clickable.forEach((t) => {
                (byType[t.typeId] ||= []).push(t);
            });
            let pair = null;
            for (const k in byType) {
                if (byType[k].length >= 2) {
                    pair = byType[k].slice(0, 2);
                    break;
                }
            }
            if (!pair) return null;
            moves.push({ id1: pair[0].id, id2: pair[1].id });
            remaining = remaining.filter((t) => t !== pair[0] && t !== pair[1]);
        }
        return moves;
    }

    function replaySolution(tiles, solution) {
        if (!solution?.length) return { ok: false, reason: '解法为空' };
        const pairsPlaced = solutionToPairsPlaced(tiles, solution);
        if (pairsPlaced.some(([a, b]) => a == null || b == null)) {
            return { ok: false, reason: '解法含未知牌 id' };
        }
        return verifyByElimination(tiles, pairsPlaced);
    }

    function countTypeIds(tiles) {
        const cnt = new Map();
        for (const t of tiles) {
            if (!Number.isFinite(t.typeId)) continue;
            cnt.set(t.typeId, (cnt.get(t.typeId) ?? 0) + 1);
        }
        return cnt;
    }

    function allTypeCountsEven(tiles) {
        for (const n of countTypeIds(tiles).values()) {
            if (n % 2 !== 0) return false;
        }
        return true;
    }

    function findSolutionBfs(tiles, timeoutMs) {
        const deadline = Date.now() + (timeoutMs ?? SOLVE_TIMEOUT_MS);
        const initial = tiles.slice();

        function stateKey(remaining) {
            return remaining
                .map((t) => t.id)
                .sort((a, b) => a - b)
                .join(',');
        }

        const queue = [{ remaining: initial, moves: [] }];
        const seen = new Set([stateKey(initial)]);

        while (queue.length) {
            if (Date.now() > deadline) return { status: 'TIMEOUT' };
            const { remaining, moves } = queue.shift();
            if (remaining.length === 0) return { status: 'SOLVED', solution: moves };

            const clickable = remaining.filter((t) => isClickable(t, remaining));
            const byType = new Map();
            for (const t of clickable) {
                if (!Number.isFinite(t.typeId)) continue;
                if (!byType.has(t.typeId)) byType.set(t.typeId, []);
                byType.get(t.typeId).push(t);
            }

            const branches = [];
            for (const group of byType.values()) {
                if (group.length < 2) continue;
                for (let i = 0; i < group.length; i++) {
                    for (let j = i + 1; j < group.length; j++) {
                        branches.push([group[i], group[j]]);
                    }
                }
            }
            if (!branches.length) continue;

            for (const [a, b] of branches) {
                const next = remaining.filter((t) => t !== a && t !== b);
                const key = stateKey(next);
                if (seen.has(key)) continue;
                seen.add(key);
                queue.push({
                    remaining: next,
                    moves: moves.concat([{ id1: a.id, id2: b.id }]),
                });
            }

            if (seen.size > 50000) break;
        }
        return { status: 'UNSOLVABLE' };
    }

    function planTypeAssignments(tiles, opts = {}) {
        const list = Array.isArray(tiles) ? tiles : getDailyTiles(tiles);
        const result = generateSolvableTypeIds({ tiles: list }, opts);
        if (!result.ok) return result;
        const assignments = new Map();
        for (const [idStr, typeId] of Object.entries(result.assignedById)) {
            assignments.set(Number(idStr), typeId);
        }
        return { ...result, assignments };
    }

    function generateSolvableTypeIds(level, opts = {}) {
        const fillTiles = getDailyTiles(level).map((t, i) => ({
            id: t.id,
            layer: t.layer,
            row: t.row,
            col: t.col,
            typeId: t.typeId != null ? t.typeId : null,
            isDark: !!t.isDark,
            _idx: i,
        }));

        if (fillTiles.length % 2 !== 0) {
            return {
                ok: false,
                status: 'failed',
                error: `牌数为奇数（${fillTiles.length}），无法生成可解花色`,
            };
        }
        if (fillTiles.length === 0) {
            return { ok: false, status: 'failed', error: '棋盘为空，请先放置牌' };
        }

        const maxRetries = opts.maxRetries ?? DEFAULT_RETRIES;
        const startSeed = opts.seed ?? Math.floor(Math.random() * 1000) + 1;
        const slotPressure = opts.slotPressure ?? 0.5;
        const pairsPerSuit = resolvePairsPerSuit(opts);

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const seed = startSeed + attempt;
            let result;
            try {
                result = backwardFill(
                    fillTiles,
                    makeRng(seed * 9301 + 49297),
                    slotPressure,
                    { pairsPerSuit },
                );
            } catch (e) {
                return { ok: false, status: 'failed', error: String(e.message || e) };
            }
            if (!result) continue;

            const filled = fillTiles.map((t, i) => ({ ...t, typeId: result.assigned[i] }));
            const verify = verifyByElimination(filled, result.pairsPlaced);
            if (!verify.ok) continue;

            const solution = pairsPlacedToSolution(fillTiles, result.pairsPlaced);
            // 首步可点再确认（防规则漏判）
            const first = solution[0];
            if (first) {
                const open = filled.filter((t) => isClickable(t, filled));
                const okFirst =
                    open.some((t) => t.id === first.id1) && open.some((t) => t.id === first.id2);
                if (!okFirst) continue;
            }

            return {
                ok: true,
                status: 'verified',
                seed,
                assigned: result.assigned,
                assignedById: Object.fromEntries(filled.map((t) => [t.id, t.typeId])),
                solution,
                verify,
                pairsPerSuit: result.pairsPerSuit,
                typeCount: result.typeCount,
                layoutFingerprint: computeLayoutFingerprint(fillTiles),
                clickableRules: {
                    cover: 'layer+1 only',
                    sandwich: 'same-layer col±2 and abs(row)<2',
                },
            };
        }

        return {
            ok: false,
            status: 'failed',
            error: `生成失败：${maxRetries} 次尝试未找到可解花色`,
        };
    }

    function verifyImportedLevel(level, opts = {}) {
        const tiles = getDailyTiles(level).map((t) => ({ ...t }));
        if (tiles.length % 2 !== 0) {
            return { ok: false, status: 'failed', error: '牌数为奇数' };
        }
        if (tiles.some((t) => t.typeId == null || !Number.isFinite(t.typeId))) {
            return { ok: false, status: 'none', error: '存在未分配花色' };
        }
        if (!allTypeCountsEven(tiles)) {
            return { ok: false, status: 'failed', error: '花色数量不是偶数' };
        }

        let solution = extractGreedySolution(tiles);
        let verify = solution ? replaySolution(tiles, solution) : { ok: false };

        if (!verify.ok) {
            const bfs = findSolutionBfs(tiles, opts.timeoutMs ?? SOLVE_TIMEOUT_MS);
            if (bfs.status === 'TIMEOUT') {
                return {
                    ok: false,
                    status: 'generated',
                    error: '求解超时，待人工验证',
                    layoutFingerprint: computeLayoutFingerprint(tiles),
                };
            }
            if (bfs.status === 'UNSOLVABLE') {
                return { ok: false, status: 'failed', error: '导入关卡不可解' };
            }
            solution = bfs.solution;
            verify = replaySolution(tiles, solution);
        }

        if (!verify.ok) {
            return { ok: false, status: 'failed', error: verify.reason || 'replay 未通过' };
        }

        return {
            ok: true,
            status: 'verified',
            preserved: true,
            solution,
            verify,
            layoutFingerprint: computeLayoutFingerprint(tiles),
        };
    }

    return {
        /** @deprecated 使用 FACE_COUNT；保留 TYPE_COUNT 兼容旧调用 */
        TYPE_COUNT: FACE_COUNT,
        FACE_COUNT,
        MIN_TYPE_ID,
        MAX_TYPE_ID: Infinity,
        DEFAULT_PAIRS_PER_SUIT,
        SOLVE_TIMEOUT_MS,
        COVER_ONLY_NEXT_LAYER,
        shuffle,
        makeRng,
        footprintsOverlap,
        isClickable,
        computeTypeCount,
        resolvePairsPerSuit,
        backwardFill,
        verifyByElimination,
        forwardEliminable,
        computeLayoutFingerprint,
        planTypeAssignments,
        generateSolvableTypeIds,
        verifyImportedLevel,
        replaySolution,
        extractGreedySolution,
        getDailyTiles,
        allTypeCountsEven,
        pairsPlacedToSolution,
    };
});
