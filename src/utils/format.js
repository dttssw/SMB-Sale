export function formatMoney(n) {
  return '¥' + (Number(n) || 0).toLocaleString('zh-CN');
}

export function sumBy(arr, key) {
  return arr.reduce((s, item) => s + (Number(item[key]) || 0), 0);
}
