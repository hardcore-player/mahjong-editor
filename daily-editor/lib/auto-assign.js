/**
 * @deprecated 请使用 DailySolvableFill.generateSolvableTypeIds
 * 保留模块名以兼容旧引用
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./solvable-fill.js'));
    } else {
        root.DailyAutoAssign = factory(root.DailySolvableFill);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (SolvableFill) {
    'use strict';

    function autoAssignTypeIds(level, opts = {}) {
        const result = SolvableFill.generateSolvableTypeIds(level, opts);
        if (!result.ok) throw new Error(result.error || '生成失败');
        const tiles = SolvableFill.getDailyTiles(level);
        for (let i = 0; i < tiles.length; i++) {
            tiles[i].typeId = result.assigned[i];
        }
        return { seed: result.seed, assigned: tiles.length, solution: result.solution };
    }

    return { autoAssignTypeIds, mulberry32: SolvableFill.makeRng };
});
