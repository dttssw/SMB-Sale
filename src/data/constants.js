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
