# SMB 销售工作台

面向中小企业销售团队的销售管理看板，涵盖三大核心场景：

1. **在约客户 · 到期时间** — 查看所有在约客户的订阅到期时间，自动分级提醒（已到期 / 30天内到期 / 90天内到期），优先触达防止续约流失。
2. **跟进中的新客户** — 跟进管道管理（初次沟通 → 需求确认 → 方案演示 → 商务谈判 → 待签约），按下次跟进时间排序，标记逾期未跟进客户。
3. **金额看板 · 续约 vs 新签** — 续约金额与新签金额的月度趋势柱状图、占比环形图、最近成交明细，以及本月/累计 KPI。

## 技术架构

- **前端**：React + Vite，通过 `/api` 与后端通信（开发模式下由 Vite 代理转发到 3001 端口）。
- **后端**：Node.js + Express 轻量 REST API。
- **数据库**：SQLite（`better-sqlite3`），文件型轻量数据库，位于 `server/data/smb.db`（首次启动时自动生成，**不预置任何演示数据**）。

## 快速开始

```bash
npm install
npm run dev     # 同时启动后端（3001）与前端开发服务器（5173）
```

也可分开启动：

```bash
npm run server  # 仅启动后端 API（http://localhost:3001）
npm run web     # 仅启动前端（http://localhost:5173）
```

生产构建（构建产物由后端一并托管，单进程运行）：

```bash
npm run build
npm start       # http://localhost:3001
```

## 功能说明

- 所有数据存储在 SQLite 数据库中，可新增 / 编辑 / 删除在约客户、跟进客户与成交记录，改动实时生效。
- 在约客户订阅默认一年：选定订阅开始时间后，订阅到期时间自动设为一年后（前一天），到期时间仍可手动修改。
- 业务常量（套餐、跟进阶段）见 `src/data/constants.js`。

## API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/contracts` / `/api/prospects` / `/api/deals` | 列表 |
| POST | `/api/contracts` / `/api/prospects` / `/api/deals` | 新增 |
| PUT | `/api/contracts/:id` / `/api/prospects/:id` / `/api/deals/:id` | 更新 |
| DELETE | `/api/contracts/:id` / `/api/prospects/:id` / `/api/deals/:id` | 删除 |
| GET | `/api/health` | 健康检查 |

## 目录结构

```
├── server/
│   ├── index.js             # Express API 服务
│   ├── db.js                # SQLite 建库建表（不写入任何演示数据）
│   └── data/smb.db          # 数据库文件（启动后自动生成，已 gitignore）
└── src/
    ├── App.jsx              # 主页面：状态管理 + KPI + 布局
    ├── styles.css           # 全局样式
    ├── api.js               # 后端 API 客户端
    ├── components/
    │   ├── Header.jsx       # 顶部栏
    │   ├── KpiCard.jsx      # KPI 指标卡
    │   ├── ExpiringContracts.jsx# 在约客户到期列表
    │   ├── ProspectList.jsx # 跟进新客户列表
    │   ├── RevenuePanel.jsx # 金额看板（图表 + 成交明细）
    │   ├── forms.jsx        # 新增/编辑表单
    │   ├── Modal.jsx / Badge.jsx
    ├── data/
    │   └── constants.js     # 套餐 / 跟进阶段
    ├── hooks/useDbData.js   # 数据库 CRUD Hook（替代原 localStorage）
    └── utils/               # 日期 / 金额工具
```
