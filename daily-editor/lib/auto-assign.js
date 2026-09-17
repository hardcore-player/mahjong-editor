/**
 * 花色自动分配 — 保证偶数配对，1～31 正式牌面
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DailyAutoAssign = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0;
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function shuffle(arr, rand) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function autoAssignTypeIds(level, opts = {}) {
        const typeKindCount = Math.min(Math.max(opts.typeKindCount ?? 16, 1), 31);
        const seed = opts.seed ?? Date.now();
        const locked = opts.lockedTypeIds ?? {};
        const rand = mulberry32(seed);

        const tiles = (level.tiles ?? []).filter(
            (t) => t && t.type !== 'spitter' && typeof t.spitterOrder !== 'number',
        );

        const unlocked = [];
        for (const t of tiles) {
            if (locked[t.id] != null) {
                t.typeId = locked[t.id];
            } else {
                unlocked.push(t);
            }
        }

        const pairCount = Math.floor(unlocked.length / 2);
        const pool = [];
        for (let i = 0; i < pairCount; i++) {
            const typeId = (i % typeKindCount) + 1;
            pool.push(typeId, typeId);
        }
        shuffle(pool, rand);

        for (let i = 0; i < unlocked.length; i++) {
            unlocked[i].typeId = pool[i] ?? 1;
        }

        return { seed, assigned: unlocked.length };
    }

    return { autoAssignTypeIds, mulberry32 };
});
