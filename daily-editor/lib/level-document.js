/**
 * LevelDocument — 每日高难关卡数据层（仅普通牌 + 暗牌）
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LevelDocument = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const TILE_SPAN = 2;
    const MAX_LAYER = 30;
    const MIN_TYPE_ID = 1;
    const MAX_TYPE_ID = 31;

    function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function isSpitterBody(t) {
        return t && t.type === 'spitter';
    }

    function isSpitterQueue(t) {
        return t && typeof t.spitterOrder === 'number';
    }

    function isDailyTile(t) {
        return t && !isSpitterBody(t) && !isSpitterQueue(t);
    }

    function computeTotalPairs(level) {
        let n = 0;
        for (const t of level.tiles ?? []) {
            if (isDailyTile(t)) n++;
        }
        return Math.floor(n / 2);
    }

    function normalizeFaceId(typeId) {
        if (!Number.isFinite(typeId)) return null;
        const n = Math.trunc(typeId);
        if (n >= MIN_TYPE_ID && n <= MAX_TYPE_ID) return n;
        return ((n - 1) % MAX_TYPE_ID) + 1;
    }

    function checkImportAllowed(json) {
        if (!json || typeof json !== 'object') {
            return { ok: false, message: '无效 JSON 文件，无法导入。' };
        }

        for (const t of json.tiles ?? []) {
            if (!t) continue;
            if (t.type === 'spitter') {
                return { ok: false, message: '每日高难关卡只支持普通牌和暗牌，该文件包含吐牌机，无法编辑。' };
            }
            if (typeof t.spitterOrder === 'number') {
                return { ok: false, message: '每日高难关卡只支持普通牌和暗牌，该文件包含吐牌机队列，无法编辑。' };
            }
        }

        if ((json.discs ?? []).length > 0) {
            return { ok: false, message: '每日高难关卡只支持普通牌和暗牌，该文件包含盖子/圆盘，无法编辑。' };
        }

        if (json.rotation != null) {
            return { ok: false, message: '每日高难关卡只支持普通牌和暗牌，该文件包含旋转机制，无法编辑。' };
        }

        for (const s of json.specialTiles ?? []) {
            if (!s) continue;
            if (s.type !== 'dark') {
                const label = s.type || '未知';
                return { ok: false, message: `每日高难关卡只支持普通牌和暗牌，该文件包含未知特殊机制「${label}」，无法编辑。` };
            }
        }

        return { ok: true };
    }

    function buildSpecialTilesFromTiles(tiles) {
        const specials = [];
        for (const t of tiles ?? []) {
            if (!isDailyTile(t) || !t.isDark) continue;
            specials.push({
                type: 'dark',
                id: t.id,
                layer: t.layer,
                row: t.row,
                col: t.col,
            });
        }
        return specials;
    }

    function normalizeImportJson(json) {
        const out = deepClone(json);
        const darkById = new Map();
        const darkByPos = new Map();

        for (const s of out.specialTiles ?? []) {
            if (s?.type === 'dark') {
                if (s.id != null) darkById.set(s.id, s);
                darkByPos.set(`${s.layer},${s.row},${s.col}`, s);
            }
        }

        for (const t of out.tiles ?? []) {
            if (!isDailyTile(t)) continue;
            if (t.isDark) continue;
            if (darkById.has(t.id) || darkByPos.has(`${t.layer},${t.row},${t.col}`)) {
                t.isDark = true;
            } else if (t.isDark == null) {
                t.isDark = false;
            }
        }

        out.discs = [];
        out.rotation = null;
        out.specialTiles = buildSpecialTilesFromTiles(out.tiles ?? []);
        out.totalPairs = computeTotalPairs(out);
        return out;
    }

    function syncSpecialTiles(level) {
        level.specialTiles = buildSpecialTilesFromTiles(level.tiles ?? []);
    }

    function validateDailyExport(level) {
        const errors = [];
        const tiles = level.tiles ?? [];

        for (const t of tiles) {
            if (!t) continue;
            if (t.type === 'spitter') errors.push('存在吐牌机，无法导出');
            if (typeof t.spitterOrder === 'number') errors.push('存在吐牌机队列，无法导出');
        }

        if ((level.discs ?? []).length > 0) errors.push('存在盖子/圆盘数据，无法导出');
        if (level.rotation != null) errors.push('存在旋转机制，无法导出');

        const tileById = new Map();
        for (const t of tiles) {
            if (isDailyTile(t)) tileById.set(t.id, t);
        }

        const darkIds = new Set();
        for (const s of level.specialTiles ?? []) {
            if (!s) continue;
            if (s.type !== 'dark') {
                errors.push(`specialTiles 含非法类型「${s.type}」`);
                continue;
            }
            if (darkIds.has(s.id)) errors.push(`暗牌 id=${s.id} 重复记录`);
            darkIds.add(s.id);

            const tile = tileById.get(s.id);
            if (!tile) {
                errors.push(`暗牌 id=${s.id} 找不到对应 tile`);
                continue;
            }
            if (tile.layer !== s.layer || tile.row !== s.row || tile.col !== s.col) {
                errors.push(`暗牌 id=${s.id} 坐标与 tile 不一致`);
            }
            if (!tile.isDark) errors.push(`暗牌 id=${s.id} 在 tile 上未标记 isDark`);
        }

        for (const t of tiles) {
            if (isDailyTile(t) && t.isDark) {
                const found = (level.specialTiles ?? []).some((s) => s?.type === 'dark' && s.id === t.id);
                if (!found) errors.push(`tile id=${t.id} 为暗牌但 specialTiles 缺失`);
            }
        }

        return { ok: errors.length === 0, errors };
    }

    class LevelDocument {
        constructor(rawJson) {
            this.raw = normalizeImportJson(rawJson);
            this.sourceFile = null;
            this.editedById = new Map();
            this.addedTiles = [];
            this.deletedIds = new Set();
            this.dirty = false;
        }

        static fromJson(json, sourceFile) {
            const check = checkImportAllowed(json);
            if (!check.ok) throw new Error(check.message);
            const doc = new LevelDocument(json);
            doc.sourceFile = sourceFile || null;
            return doc;
        }

        static tryFromJson(json, sourceFile) {
            const check = checkImportAllowed(json);
            if (!check.ok) return { ok: false, message: check.message };
            return { ok: true, doc: LevelDocument.fromJson(json, sourceFile) };
        }

        getMaxId() {
            let max = 0;
            for (const t of this.raw.tiles ?? []) if (t?.id > max) max = t.id;
            for (const t of this.addedTiles) if (t.id > max) max = t.id;
            return max;
        }

        nextId() {
            return this.getMaxId() + 1;
        }

        markDirty() {
            this.dirty = true;
        }

        mergeEditableFromLayers(layers) {
            const seenIds = new Set();
            const nextByKey = new Map();

            layers.forEach((layer, layerIdx) => {
                if (!layer?.tiles) return;
                for (const key of Object.keys(layer.tiles)) {
                    const cell = layer.tiles[key];
                    if (!cell) continue;
                    const [row, col] = key.split(',').map(Number);
                    const docId = cell._docId;
                    const isDark = cell.type === 'dark';
                    const patch = {
                        layer: layerIdx,
                        row,
                        col,
                        typeId: cell.typeId != null ? cell.typeId : null,
                        isDark,
                    };
                    if (docId != null) {
                        seenIds.add(docId);
                        this.editedById.set(docId, patch);
                    } else {
                        nextByKey.set(`${layerIdx},${row},${col}`, {
                            id: this.nextId(),
                            ...patch,
                        });
                    }
                }
            });

            for (const t of this.raw.tiles ?? []) {
                if (!isDailyTile(t)) continue;
                if (!seenIds.has(t.id) && !this.deletedIds.has(t.id)) {
                    this.deletedIds.add(t.id);
                }
            }

            this.addedTiles = [...nextByKey.values()];

            if (this.editedById.size || this.deletedIds.size || this.addedTiles.length) {
                this.markDirty();
            }
        }

        buildEditableLayers() {
            const layerMap = new Map();
            const ensure = (l) => {
                if (!layerMap.has(l)) layerMap.set(l, { tiles: {}, stacks: {} });
                return layerMap.get(l);
            };

            for (const t of this.raw.tiles ?? []) {
                if (!isDailyTile(t) || this.deletedIds.has(t.id)) continue;
                const patch = this.editedById.get(t.id);
                const view = patch ? { ...t, ...patch } : t;
                const layer = ensure(view.layer);
                const key = `${view.row},${view.col}`;
                layer.tiles[key] = {
                    type: view.isDark ? 'dark' : 'normal',
                    typeId: view.typeId != null ? view.typeId : null,
                    _docId: t.id,
                };
            }

            for (const t of this.addedTiles) {
                const layer = ensure(t.layer);
                const key = `${t.row},${t.col}`;
                layer.tiles[key] = {
                    type: t.isDark ? 'dark' : 'normal',
                    typeId: t.typeId != null ? t.typeId : null,
                    _docId: t.id,
                };
            }

            const nums = [...layerMap.keys()].sort((a, b) => a - b);
            if (!nums.length) return [{ tiles: {}, stacks: {} }];
            const max = Math.max(...nums);
            const layers = [];
            for (let i = 0; i <= max; i++) {
                layers.push(layerMap.get(i) || { tiles: {}, stacks: {} });
            }
            return layers;
        }

        getStats() {
            const tiles = this.exportJson().tiles ?? [];
            let dark = 0;
            let normal = 0;
            const layers = new Set();
            const typeIds = new Set();
            for (const t of tiles) {
                if (!isDailyTile(t)) continue;
                layers.add(t.layer);
                if (t.isDark) dark++;
                else normal++;
                if (Number.isFinite(t.typeId)) typeIds.add(t.typeId);
            }
            return {
                totalTiles: tiles.filter(isDailyTile).length,
                totalPairs: computeTotalPairs({ tiles }),
                layerCount: layers.size,
                typeKindCount: typeIds.size,
                darkCount: dark,
                normalCount: normal,
            };
        }

        exportJson() {
            if (!this.dirty && !this.editedById.size && !this.deletedIds.size && !this.addedTiles.length) {
                const out = deepClone(this.raw);
                syncSpecialTiles(out);
                out.discs = [];
                out.rotation = null;
                out.totalPairs = computeTotalPairs(out);
                const v0 = validateDailyExport(out);
                if (!v0.ok) throw new Error(v0.errors.join('；'));
                return out;
            }

            const out = deepClone(this.raw);
            const result = [];

            for (const orig of out.tiles ?? []) {
                if (this.deletedIds.has(orig.id)) continue;
                if (!isDailyTile(orig)) continue;
                if (this.editedById.has(orig.id)) {
                    const merged = deepClone(orig);
                    Object.assign(merged, this.editedById.get(orig.id));
                    delete merged.faceUp;
                    delete merged.isFree;
                    delete merged._locked;
                    delete merged.isCovered;
                    result.push(merged);
                } else {
                    result.push(deepClone(orig));
                }
            }

            for (const t of this.addedTiles) {
                const copy = deepClone(t);
                delete copy.faceUp;
                delete copy.isFree;
                delete copy._locked;
                delete copy.isCovered;
                result.push(copy);
            }

            out.tiles = result;
            syncSpecialTiles(out);
            out.discs = [];
            out.rotation = null;
            out.totalPairs = computeTotalPairs(out);

            const v = validateDailyExport(out);
            if (!v.ok) throw new Error(v.errors.join('；'));
            return out;
        }

        static semanticEqual(a, b) {
            return JSON.stringify(LevelDocument.canonicalize(a)) === JSON.stringify(LevelDocument.canonicalize(b));
        }

        static canonicalize(obj) {
            if (obj == null || typeof obj !== 'object') return obj;
            if (Array.isArray(obj)) return obj.map(LevelDocument.canonicalize);
            const keys = Object.keys(obj).sort();
            const out = {};
            for (const k of keys) out[k] = LevelDocument.canonicalize(obj[k]);
            return out;
        }
    }

    LevelDocument.TILE_SPAN = TILE_SPAN;
    LevelDocument.MAX_LAYER = MAX_LAYER;
    LevelDocument.MIN_TYPE_ID = MIN_TYPE_ID;
    LevelDocument.MAX_TYPE_ID = MAX_TYPE_ID;
    LevelDocument.computeTotalPairs = computeTotalPairs;
    LevelDocument.isDailyTile = isDailyTile;
    LevelDocument.isSpitterBody = isSpitterBody;
    LevelDocument.isSpitterQueue = isSpitterQueue;
    LevelDocument.checkImportAllowed = checkImportAllowed;
    LevelDocument.normalizeImportJson = normalizeImportJson;
    LevelDocument.validateDailyExport = validateDailyExport;
    LevelDocument.normalizeFaceId = normalizeFaceId;
    LevelDocument.deepClone = deepClone;

    return LevelDocument;
});
