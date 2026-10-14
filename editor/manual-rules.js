(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ManualRules = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var KEY_SUIT = 100;
  var HONORS = ['东', '西', '南', '北', '中', '发', '白'];
  var NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

  function suitMeta(id) {
    id = Number(id);
    if (id === KEY_SUIT) return { id: id, label: '钥匙', name: '钥匙', color: '#a16207', group: 'key' };
    if (id >= 1 && id <= 9) return { id: id, label: NUMS[id - 1] + '万', name: NUMS[id - 1] + '万', color: '#c0392b', group: 'wan' };
    if (id >= 10 && id <= 18) return { id: id, label: NUMS[id - 10] + '条', name: NUMS[id - 10] + '条', color: '#1e7a34', group: 'tiao' };
    if (id >= 19 && id <= 27) return { id: id, label: NUMS[id - 19] + '筒', name: NUMS[id - 19] + '筒', color: '#1d4e89', group: 'tong' };
    if (id >= 28 && id <= 34) {
      var name = HONORS[id - 28];
      return { id: id, label: name, name: name, color: (id === 32 || id === 33) ? '#c0392b' : '#2a2520', group: 'honor' };
    }
    return { id: id, label: String(id), name: '花色' + id, color: '#333', group: 'other' };
  }

  function isPlayable(tile) {
    return tile && tile.type !== 'spitter' && tile.type !== 'spitterQueue';
  }

  return { KEY_SUIT: KEY_SUIT, suitMeta: suitMeta, isPlayable: isPlayable };
});
