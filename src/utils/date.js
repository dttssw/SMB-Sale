const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function parseDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`);
}

export function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = parseDate(dateStr);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function formatCnDate(dateStr) {
  const d = parseDate(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEK_CN[d.getDay()]}`;
}

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = parseDate(dateStr);
  return Math.round((d - today) / 86400000);
}

export function monthOf(dateStr) {
  const d = parseDate(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 订阅默认一年：返回「开始时间 + 1 年 − 1 天」的到期时间。
 * 例如开始时间 2026-08-14 → 到期时间 2027-08-13。
 */
export function oneYearFrom(dateStr) {
  if (!dateStr) return '';
  const d = parseDate(dateStr);
  const next = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate() - 1);
  const m = String(next.getMonth() + 1).padStart(2, '0');
  const day = String(next.getDate()).padStart(2, '0');
  return `${next.getFullYear()}-${m}-${day}`;
}

/**
 * 订阅默认一年（反向联动）：返回「到期时间 − 1 年 + 1 天」的开始时间，
 * 与 oneYearFrom 互为逆运算，天数逻辑完全一致。
 * 例如到期时间 2027-08-25 → 开始时间 2026-08-26。
 */
export function oneYearBefore(dateStr) {
  if (!dateStr) return '';
  const d = parseDate(dateStr);
  const prev = new Date(d.getFullYear() - 1, d.getMonth(), d.getDate() + 1);
  const m = String(prev.getMonth() + 1).padStart(2, '0');
  const day = String(prev.getDate()).padStart(2, '0');
  return `${prev.getFullYear()}-${m}-${day}`;
}

/**
 * 续约：以当前到期时间为基准，订阅开始时间顺延为到期日次日，
 * 订阅到期时间自动往后延长一年（与新开始时间保持「一年 − 一天」）。
 * 例如到期时间 2027-08-13 → 新开始 2027-08-14，新到期 2028-08-13。
 */
export function renewFrom(expiryDate) {
  if (!expiryDate) return { startDate: '', expiryDate: '' };
  const d = parseDate(expiryDate);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const day = String(start.getDate()).padStart(2, '0');
  const startDate = `${start.getFullYear()}-${m}-${day}`;
  return { startDate, expiryDate: oneYearFrom(startDate) };
}

/**
 * 把后端备注时间（SQLite datetime('now') 返回的 UTC 时间，形如 'YYYY-MM-DD HH:MM:SS'）
 * 换算成本地时区，显示为 'YYYY-MM-DD HH:MM'。
 * 直接用 createdAt.slice(0,16) 会把 UTC 当作本地时间，导致比本地慢 8 小时。
 */
export function formatNoteTime(createdAt) {
  if (!createdAt) return '';
  const d = new Date(`${createdAt.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return createdAt.slice(0, 16);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day} ${h}:${min}`;
}
