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
