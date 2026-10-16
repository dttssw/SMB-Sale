// 板块 ↔ 地址栏哈希 的映射：刷新 / 收藏 / 分享链接都能落回同一个板块。
// 例：#/follow → 'follow'；空哈希、#/、未知值一律回落到总览（HOME_SECTION）。
export const HOME_SECTION = 'home';

// 从哈希里取出板块 key：容忍 '#follow'、'#/follow/'、'#/follow?x=1' 等写法
export function sectionFromHash(hash, sections = [], fallback = HOME_SECTION) {
  const raw = String(hash ?? '');
  const key = raw.replace(/^#\/?/, '').split(/[?#]/)[0].replace(/\/+$/, '').trim();
  return sections.includes(key) ? key : fallback;
}

// 板块 key → 哈希（统一带 '#/' 前缀，便于直接读地址栏）
export function hashForSection(key) {
  return `#/${key}`;
}
