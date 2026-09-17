/**
 * 每日关卡校验 — 浏览器 + Node 共用（不依赖 API / fs / serve.js）
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./level-document.js'));
    } else {
        root.DailyValidation = factory(root.LevelDocument);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (LevelDocument) {
    'use strict';

    const TILE_SPAN = 2;
    const MAX_LAYER = 30;
    const MIN_TYPE_ID = 1;
    const MAX_TYPE_ID = 31;

    function makeIssue(level, severity, code, message, tileIds = []) {
        return { severity, code, message, tileIds, levelId: level?.levelId };
    }

    function footprintsOverlap(rowA, colA, rowB, colB, span = TILE_SPAN) {
        return Math.abs(rowA - rowB) < span && Math.abs(colA - colB) < span;
    }

    function inBounds(row, col) {
        return col >= -5 && col <= 5 && row >= -8 && row <= 6;
    }

    function validateLevel(level, full = true) {
        const issues = [];
        const tiles = level?.tiles ?? [];

        if (!level || typeof level !== 'object') {
            return { ok: false, issues: [makeIssue(null, 'ERROR', 'structure', '无效 JSON 结构')], errors: 1, warnings: 0 };
        }

        if (!Number.isFinite(level.levelId) || level.levelId < 1) {
            issues.push(makeIssue(level, 'ERROR', 'levelId', 'levelId 必须是正整数'));
        }

        for (const t of tiles) {
            if (!t) continue;
            if (t.type === 'spitter') {
                issues.push(makeIssue(level, 'ERROR', 'spitter', '含吐牌机', [t.id]));
            }
            if (typeof t.spitterOrder === 'number') {
                issues.push(makeIssue(level, 'ERROR', 'spitterOrder', '含吐牌机队列', [t.id]));
            }
        }

        if ((level.discs ?? []).length > 0) {
            issues.push(makeIssue(level, 'ERROR', 'discs', '含盖子/圆盘数据'));
        }

        if (level.rotation != null) {
            issues.push(makeIssue(level, 'ERROR', 'rotation', '含旋转机制'));
        }

        for (const s of level.specialTiles ?? []) {
            if (s?.type !== 'dark') {
                issues.push(makeIssue(level, 'ERROR', 'specialType', `非法 specialTiles 类型「${s?.type}」`));
            }
        }

        const exportCheck = LevelDocument.validateDailyExport(level);
        for (const msg of exportCheck.errors) {
            issues.push(makeIssue(level, 'ERROR', 'dailyExport', msg));
        }

        const ids = new Set();
        for (const t of tiles) {
            if (!t || !LevelDocument.isDailyTile(t)) continue;
            if (!Number.isFinite(t.id)) {
                issues.push(makeIssue(level, 'ERROR', 'id', '存在非法 id'));
                continue;
            }
            if (ids.has(t.id)) {
                issues.push(makeIssue(level, 'ERROR', 'dupId', `重复 id=${t.id}`, [t.id]));
            }
            ids.add(t.id);
        }

        let playable = 0;
        const typeCount = new Map();
        for (const t of tiles) {
            if (!LevelDocument.isDailyTile(t)) continue;
            if (!Number.isFinite(t.layer) || t.layer < 0 || t.layer > MAX_LAYER) {
                issues.push(makeIssue(level, 'ERROR', 'layer', `牌 id=${t.id} layer 须在 0～${MAX_LAYER}`, [t.id]));
            }
            if (!Number.isFinite(t.row) || !Number.isFinite(t.col) || !inBounds(t.row, t.col)) {
                issues.push(makeIssue(level, 'ERROR', 'coord', `牌 id=${t.id} row/col 超出合法范围`, [t.id]));
            }
            if (t.typeId == null || !Number.isFinite(t.typeId)) {
                issues.push(makeIssue(level, 'ERROR', 'typeId', `牌 id=${t.id} typeId 非法`, [t.id]));
            } else if (t.typeId < MIN_TYPE_ID || t.typeId > MAX_TYPE_ID) {
                issues.push(makeIssue(level, 'ERROR', 'typeIdRange', `牌 id=${t.id} typeId=${t.typeId} 超出 1～31`, [t.id]));
            }
            playable++;
            if (Number.isFinite(t.typeId)) typeCount.set(t.typeId, (typeCount.get(t.typeId) ?? 0) + 1);
        }

        if (playable % 2 !== 0) {
            issues.push(makeIssue(level, 'ERROR', 'evenCount', `可消牌数 ${playable} 不是偶数`));
        }

        for (const [tid, n] of typeCount) {
            if (n % 2 !== 0) {
                issues.push(makeIssue(level, 'ERROR', 'typePair', `typeId=${tid} 出现 ${n} 次（奇数）`));
            }
        }

        const expectedPairs = LevelDocument.computeTotalPairs(level);
        if (level.totalPairs !== expectedPairs) {
            issues.push(makeIssue(level, 'ERROR', 'totalPairs', `totalPairs=${level.totalPairs} 与推算 ${expectedPairs} 不一致`));
        }

        for (let i = 0; i < tiles.length; i++) {
            const a = tiles[i];
            if (!a || !LevelDocument.isDailyTile(a)) continue;
            for (let j = i + 1; j < tiles.length; j++) {
                const b = tiles[j];
                if (!b || !LevelDocument.isDailyTile(b)) continue;
                if (a.layer === b.layer && a.row === b.row && a.col === b.col) {
                    issues.push(makeIssue(level, 'ERROR', 'overlap', `同层同坐标 id=${a.id} 与 id=${b.id}`, [a.id, b.id]));
                }
                if (a.layer === b.layer && footprintsOverlap(a.row, a.col, b.row, b.col)) {
                    issues.push(makeIssue(level, 'ERROR', 'footprint', `同层半身位重叠 id=${a.id} 与 id=${b.id}`, [a.id, b.id]));
                }
            }
        }

        const errors = issues.filter((x) => x.severity === 'ERROR').length;
        const warnings = issues.filter((x) => x.severity === 'WARNING').length;
        if (full) {
            issues.push(makeIssue(level, 'INFO', 'stats', `可消牌 ${playable}，${typeCount.size} 种花色，${errors} 错误，${warnings} 警告`));
        }

        return { ok: errors === 0, issues, errors, warnings };
    }

    return { validateLevel, footprintsOverlap, TILE_SPAN, MAX_LAYER, MIN_TYPE_ID, MAX_TYPE_ID };
});
