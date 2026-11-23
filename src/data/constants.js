// PS 人天服务是一次性交付的服务类 SKU，不产生订阅期限
export const SERVICE_SKU = 'PS人天服务';

// 项目 SKU：project.skus 为完整数组，展示与编辑共用这一套选项。
export const SKUS = [
  '专业版',
  '旗舰版',
  'BE版',
  'PE版',
  'SaaS专业版',
  'SaaS旗舰版',
  'Duo',
  'Duo Credit',
  SERVICE_SKU,
];

// 每个 SKU 的标准单价（元 / 份），写死在代码里，作为报价的基准价。
// SaaS 版与私有化同价。null 表示没有标准价：BE / PE 这类按项目谈判的 SKU
// 必须手动填实际金额，折扣也就无从反算。
export const SKU_PRICE = {
  专业版: 2399,
  旗舰版: 9988,
  BE版: null,
  PE版: null,
  SaaS专业版: 2399,
  SaaS旗舰版: 9988,
  Duo: 2399,
  'Duo Credit': 1,
  [SERVICE_SKU]: 12000,
};

export const PROJECT_STATUS = {
  active: '项目跟进',
  watching: '长期观察',
  won: '已签项目',
  lost: 'Lost 项目',
};

// 续约提醒窗口（天）：只用于提醒与自动创建续约项目，不删除项目。
export const RENEW_WINDOW_DAYS = 60;
