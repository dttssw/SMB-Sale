const contract = (id, name, owner, plan, contact, contractAmount, startDate, expiryDate) => ({
  id,
  name,
  owner,
  plan,
  contact,
  contractAmount,
  startDate,
  expiryDate,
});

const prospect = (id, name, owner, stage, contact, expectedAmount, lastFollowUp, nextFollowUp, note) => ({
  id,
  name,
  owner,
  stage,
  contact,
  expectedAmount,
  lastFollowUp,
  nextFollowUp,
  note,
});

const deal = (id, customer, type, amount, date) => ({ id, customer, type, amount, date });

export function getSeedContracts() {
  return [
    contract('c1', '杭州云启科技有限公司', '王小明', '企业版', '张经理', 25800, '2025-08-01', '2026-08-28'),
    contract('c2', '成都锦程餐饮管理有限公司', '李婷婷', '专业版', '刘总', 15600, '2025-08-10', '2026-08-20'),
    contract('c3', '苏州华辰精密制造', '李婷婷', '专业版', '陈工', 12900, '2025-08-05', '2026-08-05'),
    contract('c4', '上海蓝湾设计事务所', '李婷婷', '专业版', '周设计师', 13500, '2025-07-31', '2026-07-31'),
    contract('c5', '南京天泽国际贸易', '王小明', '旗舰版', '吴总', 42800, '2025-09-10', '2026-09-10'),
    contract('c6', '宁波海通物流', '赵磊', '标准版', '郑经理', 8900, '2025-10-15', '2026-10-15'),
    contract('c7', '武汉智创教育', '赵磊', '企业版', '黄校长', 23800, '2026-01-31', '2027-01-31'),
    contract('c8', '重庆优佳超市连锁', '王小明', '标准版', '孙店长', 9900, '2025-12-31', '2026-12-31'),
  ];
}

export function getSeedProspects() {
  return [
    prospect('p1', '无锡鼎盛机械', '李婷婷', 'negotiation', '钱总', 32000, '2026-08-10', '2026-08-14', '客户对价格仍有疑虑，准备二次报价方案'),
    prospect('p2', '合肥云帆科技', '王小明', 'demo', '赵总', 19800, '2026-08-08', '2026-08-15', '已完成方案演示，等待内部评审'),
    prospect('p3', '青岛蓝谷生物', '赵磊', 'requirement', '孙博士', 24600, '2026-08-06', '2026-08-18', '需要补充数据安全相关材料'),
    prospect('p4', '长沙星城网络', '王小明', 'initial', '周总', 12800, '2026-08-11', '2026-08-13', '首次沟通，客户关注移动端体验'),
    prospect('p5', '西安丝路供应链', '赵磊', 'negotiation', '高总', 45600, '2026-08-09', '2026-08-14', '商务条款接近一致，预计本月签约'),
    prospect('p6', '天津海河教育', '李婷婷', 'contract', '冯校长', 8900, '2026-08-05', '2026-08-12', '已进入合同审批流程，催办中'),
  ];
}

export function getSeedDeals() {
  return [
    deal('d1', '杭州云启科技有限公司', 'renewal', 21800, '2026-01-12'),
    deal('d2', '宁波海通物流', 'new', 8900, '2026-01-20'),
    deal('d3', '武汉智创教育', 'new', 23800, '2026-02-15'),
    deal('d4', '南京天泽国际贸易', 'renewal', 39800, '2026-02-28'),
    deal('d5', '成都锦程餐饮管理有限公司', 'new', 15600, '2026-03-10'),
    deal('d6', '苏州华辰精密制造', 'renewal', 11900, '2026-03-22'),
    deal('d7', '上海蓝湾设计事务所', 'new', 13500, '2026-04-08'),
    deal('d8', '重庆优佳超市连锁', 'renewal', 8900, '2026-04-25'),
    deal('d9', '无锡鼎盛机械', 'new', 32000, '2026-05-14'),
    deal('d10', '杭州云启科技有限公司', 'renewal', 25800, '2026-05-30'),
    deal('d11', '合肥云帆科技', 'new', 19800, '2026-06-11'),
    deal('d12', '成都锦程餐饮管理有限公司', 'renewal', 14800, '2026-06-28'),
    deal('d13', '西安丝路供应链', 'new', 45600, '2026-07-09'),
    deal('d14', '武汉智创教育', 'renewal', 22800, '2026-07-25'),
    deal('d15', '长沙星城网络', 'new', 12800, '2026-08-06'),
    deal('d16', '南京天泽国际贸易', 'renewal', 42800, '2026-08-11'),
  ];
}
