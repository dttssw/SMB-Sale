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
  'PS人天服务',
];

export const PROJECT_STATUS = {
  active: '项目跟进',
  watching: '长期观察',
  won: '已签项目',
  lost: 'Lost 项目',
};

// 续约提醒窗口（天）：只用于提醒与自动创建续约项目，不删除项目。
export const RENEW_WINDOW_DAYS = 60;
