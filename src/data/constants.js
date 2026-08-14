export const PLANS = ['标准版', '专业版', '企业版', '旗舰版'];

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

export function planOf(key) {
  return PLANS.includes(key) ? key : PLANS[1];
}
