// SKU 多值工具
// 数据库/接口里的 skus 可能是数组，也可能是 JSON 数组文本（如 '["Duo","PS人天服务"]'）；
// 历史记录只有单个 plan 字段，这里统一回退成 [plan]，让表单与详情都能拿到完整列表。
export function parseSkus(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === 'string') return [parsed];
    } catch {
      // 纯文本（历史单值）直接当一条 SKU
      return [text];
    }
  }
  return [];
}

// 去空白、去重、保持选择顺序（第一条即主 SKU）
export function cleanSkus(list) {
  const out = [];
  for (const item of parseSkus(list)) {
    const sku = String(item ?? '').trim();
    if (sku && !out.includes(sku)) out.push(sku);
  }
  return out;
}

// 行记录的全部 SKU：优先 skus，历史数据回退为 [plan]
export function skusOf(record) {
  const list = cleanSkus(record?.skus);
  if (list.length) return list;
  const plan = String(record?.plan ?? '').trim();
  return plan ? [plan] : [];
}
