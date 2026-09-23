export const PRODUCTS = ['专业版', '旗舰版', 'BE版', 'PE版', 'SaaS专业版', 'SaaS旗舰版', 'Duo', 'Duo Credit'];

export const STAGES = [
  { key: 'initial', label: '初次沟通', tone: 'info' },
  { key: 'requirement', label: '需求确认', tone: 'violet' },
  { key: 'demo', label: '方案演示', tone: 'primary' },
  { key: 'negotiation', label: '商务谈判', tone: 'warn' },
  { key: 'contract', label: '待签约', tone: 'ok' },
];

export function stageOf(key) {
  return STAGES.find((s) => s.key === key) || STAGES[0];
}

export function productOf(key) {
  return PRODUCTS.includes(key) ? key : PRODUCTS[0];
}

// 续约提醒窗口（天）：默认 60 天（约两个月）。订阅到期日距今 ≤ 该天数即视为「临期」。
// 「续约跟进」板块只存放临期客户（距到期 ≤ 该天数，含已逾期）：
//   距到期更久的在约客户不进续约跟进，只待在「在约客户」板块，等临期时自动带出。
// 修改这一个值会同时影响：总览统计、在约客户列表、临期提醒条、续约跟进列表。
// ⚠️ 后端 server/index.js 的 RENEW_WINDOW_DAYS 必须与本值保持一致（后端不能直接 import 前端模块）。
export const RENEW_WINDOW_DAYS = 60;
