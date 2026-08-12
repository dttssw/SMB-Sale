# SMB 销售工作台

面向中小企业销售团队的销售管理看板，涵盖三大核心场景：

1. **在约客户 · 到期时间** — 查看所有在约客户的合同到期时间，自动分级提醒（已到期 / 30天内到期 / 90天内到期），优先触达防止续约流失。
2. **跟进中的新客户** — 跟进管道管理（初次沟通 → 需求确认 → 方案演示 → 商务谈判 → 待签约），按下次跟进时间排序，标记逾期未跟进客户。
3. **金额看板 · 续约 vs 新签** — 续约金额与新签金额的月度趋势柱状图、占比环形图、最近成交明细，以及本月/累计 KPI。

## 快速开始

```bash
npm install
npm run dev     # 启动开发服务器，默认端口 5173
```

生产构建：

```bash
npm run build
npm run preview
```

## 功能说明

- 所有数据保存在浏览器 localStorage，可新增 / 编辑 / 删除在约客户、跟进客户与成交记录。
- 右上角「重置演示数据」可一键恢复示例数据。
- 数据模型见 `src/data/seed.js`，业务常量（套餐、负责人、跟进阶段）见 `src/data/constants.js`。

## 目录结构

```
src/
├── App.jsx                  # 主页面：状态管理 + KPI + 布局
├── styles.css               # 全局样式
├── components/
│   ├── Header.jsx           # 顶部栏
│   ├── KpiCard.jsx          # KPI 指标卡
│   ├── ExpiringContracts.jsx# 在约客户到期列表
│   ├── ProspectList.jsx     # 跟进新客户列表
│   ├── RevenuePanel.jsx     # 金额看板（图表 + 成交明细）
│   ├── forms.jsx            # 新增/编辑表单
│   ├── Modal.jsx / Badge.jsx
├── data/
│   ├── seed.js              # 演示数据
│   └── constants.js         # 套餐 / 负责人 / 跟进阶段
├── hooks/useLocalStorage.js # localStorage 持久化
└── utils/                   # 日期 / 金额工具
```
