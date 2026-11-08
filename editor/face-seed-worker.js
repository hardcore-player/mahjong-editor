/* 花色种子池 Worker：与主线程同一套 generator / 合格线，只把重活挪出 UI 线程 */
/* global GEN */
importScripts('generator.js?v=561');

var cancelled = false;

self.onmessage = function (ev) {
  var msg = ev.data || {};
  if (msg.type === 'cancel') {
    cancelled = true;
    return;
  }
  if (msg.type !== 'start') return;
  cancelled = false;

  var api = self.GEN || globalThis.GEN;
  if (!api || typeof api.generateFaceSeedPool !== 'function') {
    self.postMessage({
      type: 'done',
      cancelled: true,
      result: {
        faceSeeds: [],
        geoKey: '',
        target: msg.target | 0,
        attempts: 0,
        excellent: 0,
        qualified: 0,
        ok: false,
        cancelled: true,
        error: 'GEN missing in worker'
      }
    });
    return;
  }

  var level = { tiles: msg.tiles || [] };
  var result = api.generateFaceSeedPool(level, msg.target, {
    seed: msg.seed,
    maxWallAttempts: msg.maxWallAttempts,
    fastAbort: true,
    shouldCancel: function () { return cancelled; },
    onProgress: function (p) {
      self.postMessage({
        type: 'progress',
        have: p.have,
        target: p.target,
        attempts: p.attempts,
        excellent: p.excellent,
        qualified: p.qualified
      });
    }
  });

  self.postMessage({
    type: 'done',
    cancelled: cancelled || !!(result && result.cancelled),
    result: result
  });
};
