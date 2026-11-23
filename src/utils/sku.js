// SKU 多值工具
// 数据库/接口里的 skus 可能是数组，也可能是 JSON 数组文本（如 '["Duo","PS人天服务"]'）；
// 历史记录只有单个 plan 字段，这里统一回退成 [plan]，让表单与详情都能拿到完整列表。
import { SERVICE_SKU, SKU_PRICE } from '../data/constants.js';

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

// skuQty / skuPrice / skuDiscount 都是「键为 SKU 名」的对象，也可能是 JSON 文本
function parseMapField(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      return {};
    }
  }
  return {};
}

// 标准单价：constants 里写死的基准价，没有基准价的 SKU（BE / PE）返回 null
export function basePriceOf(sku) {
  const price = SKU_PRICE[sku];
  return Number.isFinite(price) && price > 0 ? price : null;
}

// 每条 SKU 的数量：取不到就按 1 计
export function skuQtyOf(record) {
  const map = parseMapField(record?.skuQty);
  const out = {};
  for (const sku of skusOf(record)) {
    const qty = Number(map[sku]);
    out[sku] = Number.isFinite(qty) && qty > 0 ? Math.max(1, Math.round(qty)) : 1;
  }
  return out;
}

// 每条 SKU 的实际单价（用户填的成交单价，不是小计）
export function skuPriceOf(record) {
  const map = parseMapField(record?.skuPrice);
  const out = {};
  for (const sku of skusOf(record)) {
    const raw = map[sku];
    if (raw === '' || raw == null) continue;
    const price = Number(raw);
    if (Number.isFinite(price) && price >= 0) out[sku] = price;
  }
  return out;
}

// 每条 SKU 的折扣（百分比，100 = 不打折）
export function skuDiscountOf(record) {
  const map = parseMapField(record?.skuDiscount);
  const out = {};
  for (const sku of skusOf(record)) {
    const raw = map[sku];
    if (raw === '' || raw == null) continue;
    const discount = Number(raw);
    if (Number.isFinite(discount) && discount >= 0 && discount <= 100) out[sku] = discount;
  }
  return out;
}

export function discountFromPrice(price, base) {
  if (!base || !Number.isFinite(Number(price))) return null;
  return Math.round((Number(price) / base) * 10000) / 100;
}

export function priceFromDiscount(base, discount) {
  if (!base || !Number.isFinite(Number(discount))) return 0;
  return Math.round(base * (Number(discount) / 100) * 100) / 100;
}

// 历史数据没有 skuPrice：把项目已有的总额按标准价占比分摊回每条 SKU，
// 保证「打开旧项目 → 直接保存」不会把历史成交金额改掉。
function allocateLegacyTotal(entries, total) {
  if (!(total > 0) || !entries.length) return entries;
  const gross = entries.reduce((sum, entry) => sum + entry.price * entry.qty, 0);
  if (!(gross > 0) || Math.abs(gross - total) < 0.01) return entries;
  const ratio = total / gross;
  let allocated = 0;
  return entries.map((entry, index) => {
    const isLast = index === entries.length - 1;
    const subtotal = isLast
      ? Math.round((total - allocated) * 100) / 100
      : Math.round(entry.price * entry.qty * ratio * 100) / 100;
    allocated += subtotal;
    const price = entry.qty > 0 ? Math.round((subtotal / entry.qty) * 100) / 100 : 0;
    return { ...entry, price, discount: discountFromPrice(price, entry.base) };
  });
}

// 表单用：[{ sku, qty, base, price, discount }]，与详情展示、接口入参保持同一份顺序
export function skuEntriesOf(record) {
  const qty = skuQtyOf(record);
  const prices = skuPriceOf(record);
  const discounts = skuDiscountOf(record);
  const hasStoredPrice = Object.keys(prices).length > 0;

  const entries = skusOf(record).map((sku) => {
    const base = basePriceOf(sku);
    const stored = prices[sku];
    const price = stored != null ? stored : base ?? 0;
    let discount = discounts[sku];
    if (discount == null) discount = base ? (stored != null ? discountFromPrice(price, base) : 100) : null;
    return { sku, qty: qty[sku], base, price, discount };
  });

  if (hasStoredPrice) return entries;
  const legacyTotal = Number(record?.contractAmount || record?.expectedAmount || 0);
  return allocateLegacyTotal(entries, legacyTotal);
}

// 各条 SKU 的小计合计：Σ 实际单价 × 数量
export function skuTotalOf(entries) {
  const total = (entries || []).reduce((sum, entry) => {
    const price = Number(entry?.price);
    if (!Number.isFinite(price) || price < 0) return sum;
    const qty = Number(entry?.qty);
    const count = Number.isFinite(qty) && qty > 0 ? Math.max(1, Math.round(qty)) : 1;
    return sum + price * count;
  }, 0);
  return Math.round(total * 100) / 100;
}

// 表单提交用：去重、收敛数量与金额，拆成接口需要的四个字段
export function entriesToPayload(entries) {
  const skus = [];
  const skuQty = {};
  const skuPrice = {};
  const skuDiscount = {};
  for (const entry of entries || []) {
    const sku = String(entry?.sku ?? '').trim();
    if (!sku || skus.includes(sku)) continue;
    const qty = Number(entry?.qty);
    const price = Number(entry?.price);
    const discount = Number(entry?.discount);
    skus.push(sku);
    skuQty[sku] = Number.isFinite(qty) && qty > 0 ? Math.max(1, Math.round(qty)) : 1;
    // 金额允许为 0（赠送），但空值不进 map，让后端知道这条还没报价
    if (entry?.price !== '' && entry?.price != null && Number.isFinite(price) && price >= 0) {
      skuPrice[sku] = Math.round(price * 100) / 100;
    }
    if (entry?.discount !== '' && entry?.discount != null && Number.isFinite(discount) && discount >= 0) {
      skuDiscount[sku] = Math.round(discount * 100) / 100;
    }
  }
  return { skus, skuQty, skuPrice, skuDiscount };
}

// 纯服务项目：全部 SKU 都是 PS 人天服务 —— 一次性交付，不设订阅开始 / 到期时间。
// 混选了订阅类 SKU 的项目照旧按订阅项目处理（含 PS 部分只是其中一条）。
export function isServiceOnly(record) {
  const skus = skusOf(record);
  return skus.length > 0 && skus.every((sku) => sku === SERVICE_SKU);
}
