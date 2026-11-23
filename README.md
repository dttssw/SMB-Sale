# SMB 销售工作台

面向中小企业销售团队的一体化销售工作台，围绕**日常记录 + 项目推进**运转。核心模型是 **客户（customers）** 与 **项目（projects）** 分离：一家客户可以并行推进多个项目，一个项目只归属一家最终客户、可选关联一个合作伙伴。所有数据保存在本地 SQLite，前端 React + Vite，后端轻量 Express REST API，单进程即可部署。

## 数据模型

| 表 | 作用 | 关键字段 |
| --- | --- | --- |
| `customers` | 客户主档，名称唯一（规范化后同名即同一家） | `id` `name` `contact` |
| `partners` | 合作伙伴主档（渠道商 / 代理商），只有名称，联系人写在备注里 | `id` `name` |
| `projects` | **唯一的业务推进表**，新签 / 续约、跟进 / 观察 / 已签 / 流失都在这里 | `customerId`（必填）`partnerId`（可选）`category` `status` `skus` `expectedAmount` `contractAmount` `startDate` `expiryDate` `sourceProjectId` |
| `notes` | 备注时间线，客户级（`projectId` 为空）与项目级（`projectId` 有值）两层 | `customerType` `customerId` `projectId` `content` |
| `deals` | 成交记录，一个已签项目最多一条 | `projectId`（唯一）`customerId` `amount` `date` `type` |
| `worklogs` | 每日工作记录 | `content` `date` |
| `materials` | 材料库元数据（文件在 `server/uploads/`） | `storedName` `mime` `size` |

- `status`：`active`（项目跟进）/ `watching`（长期观察）/ `won`（已签项目）/ `lost`（Lost 项目）。
- `category`：`new`（新签）/ `renew`（续约）/ `NULL`（历史迁移过来的已签合同，不再产生新值）。
- `sourceProjectId`：续约项目指回被续约的原已签项目，用于串联历史。
- 外键：`projects.customerId` 为 `ON DELETE RESTRICT`（有项目的客户不能删，接口返回 409）；`projects.partnerId` 为 `ON DELETE SET NULL`（删合作伙伴只解绑，不动项目）。
- 旧库首次启动自动迁移：`contracts` → `won` 项目（旧 lost 合同转为 `lost` 的 `renew` 项目）、`prospects` → `active` / `watching` / `lost` 项目并回填 `sourceProjectId`，旧表重命名为 `legacy_contracts` / `legacy_prospects` 留档，`schema_meta.projects_migrated_v1` 保证只跑一次。

## 核心模块

1. **总览** — 今日需跟进、成交概览等关键数字，配临期提醒（只统计已签项目）。
2. **今日工作** — 按天分组（今天 / 昨天 / 具体日期）形成时间线，默认只展示本周，可切「全部」；支持快速「记一笔」、显示当天条数、逐条删除。
3. **项目跟进** — 主入口。分 **New（新签）/ Renew（续约）** 两个视图，按下次跟进时间排序，标出**逾期未跟进**与**今日需跟进**；同一客户可以同时有多条在跟进项目。
4. **已签项目** — 赢单项目清单，展示成交金额、订阅起止、SKU；`RENEW_WINDOW_DAYS`（默认 60 天）内临期或已逾期的置顶提醒，可一键「创建续约」。
5. **客户名单** — 只维护客户主档：联系人、进行中项目数、已签项目数；点开客户能看到它的全部项目（含已签 / Lost）与客户级备注汇总。
6. **长期观察** — 暂时不需要定时跟进但要留意的项目。转入时清空下次跟进时间，不再进「逾期 / 今日需跟进」；随时可恢复回项目跟进。
7. **Lost 项目** — 未赢单项目归档，按流失时间倒序。lost 只影响这一个项目，同客户的其他项目完全不受影响，可随时恢复。
8. **合作伙伴** — 渠道商 / 代理商主档，只保留名称（多个联系人写进备注时间线），列表带「关联项目」列可看它参与的项目。
9. **成交金额** — 左侧本月 / 累计 / 平均单笔概览，右侧最近成交（项目 / 最终客户），与 `deals` 对齐。
10. **材料库** — 上传产品方案、报价单、合同模板等，支持批量上传、在线预览、下载、删除。

## 状态流转

```
active ──赢单（成交金额 + 订阅起止）──> won ──创建续约──> 新的 active(renew) 项目
  │                                                    sourceProjectId 指向原项目
  ├──长期观察──> watching ──恢复──> active
  └──标记 Lost──> lost     ──恢复──> active
```

- `active` 可以转 `won` / `watching` / `lost`；`watching` / `lost` 可以恢复到 `active`。
- `won` 是终态：不能退回 `active`，也不能直接标 `lost`（要重谈就新建项目）。
- 赢单时自动写一条 `deals`（`type` 按 `category` 落 `new` / `renewal`），重复赢单直接返回已有成交，不会重复计数。
- 续约是**独立的新项目**：原已签项目保留全部历史（成交金额、订阅周期），续约项目记 `sourceProjectId`。续约窗口只用于提醒和自动补建，不会删项目。

## 技术架构

- **前端**：React + Vite，通过 `/api` 与后端通信（开发模式下 Vite 代理转发到 3001 端口）。
- **后端**：Node.js + Express 轻量 REST API。
- **数据库**：SQLite（`better-sqlite3`），文件型数据库，位于 `server/data/smb.db`（首次启动自动生成，不预置演示数据）。环境变量 `SMB_DB_FILE` 可指向其他库文件（验证脚本、临时环境用）。

## 快速开始

```bash
npm install
npm run dev     # 同时启动后端（3001）与前端开发服务器（5173）
```

分开启动：

```bash
npm run server  # 仅后端 API（3001）
npm run web     # 仅前端（5173）
```

生产构建（产物由后端一并托管，单进程运行）：

```bash
npm run build
npm start       # 生产模式运行于 3001
```

迁移与接口验收：

```bash
node server/verify-projects.js
# 自建临时旧库 → 跑迁移 → 起服务 → 验证多项目、赢单隔离、续约防重、备注隔离、状态流转、重启幂等
```

## 功能说明

- **一个客户多个项目**：客户只在「客户名单」维护一份，项目在「项目跟进 / 已签项目 / 长期观察 / Lost 项目」里按状态流转。同一客户同时推进多个项目、其中一个已签约而另一个还在谈，是默认支持的场景。
- **一个项目必须且只有一家最终客户**：`projects.customerId` 非空 + 外键约束；新增项目时可从下拉选已有客户，也可当场新建客户（名称规范化后同名复用，不产生重复主档）。合作伙伴可选，可空。
- **双层备注**：客户级备注（`projectId` 为空）是这家公司的沟通汇总，项目级备注挂在具体项目上。客户详情看到全部备注（带项目名标签），项目详情只看本项目备注。项目备注会刷新**该项目**的跟进时间，不影响同客户其他项目；客户级备注只归档，不改任何项目的跟进时间。
- **跟进时间**：`lastFollowUp` / `nextFollowUp` 存在项目上。项目跟进列表按 `nextFollowUp` 排序，逾期（早于今天）与今日需跟进单独高亮；长期观察与 Lost 项目不参与提醒。
- **赢单**：`POST /api/projects/:id/win` 在一个事务里写项目状态 + 成交金额 + 订阅起止 + `deals`，任一校验失败整体回滚。已签项目必须有成交金额与订阅起止时间。
- **续约**：已签项目在 `RENEW_WINDOW_DAYS` 内（或已逾期）时提醒，也可随时手动续约；生成的续约项目 `category='renew'`、`status='active'`、`sourceProjectId` 指向原项目。同一已签项目已有进行中（`active` / `watching`）的续约项目时，手动续约返回 409；`POST /api/sync/renewals` 则是幂等补建（已有就跳过，不会重复创建）。
- **客户名唯一**：名称先规范化（去首尾空白、连续空白折叠），`idx_customers_name` 唯一索引 + 写入时复用 / 409 双重保证；服务启动会合并历史重复主档（备注、项目、成交一并改指向保留的那条）。
- **删除保护**：客户名下还有项目 → 409；项目已有成交记录 → 409（要删先删成交）；删项目会连带删它的项目级备注，并把指向它的续约项目 `sourceProjectId` 置空；删合作伙伴只把项目的 `partnerId` 置空，项目本身不受影响。
- **多 SKU**：每个项目默认 1 条 SKU，可继续添加（至少保留一条，第一条为主 SKU），完整列表存 `skus`（JSON 数组文本）。选项见 `src/data/constants.js` 的 `SKUS`。
- **订阅周期联动**：选订阅开始时间自动算一年后到期（前一天），选到期时间反推开始时间，双向联动；日期选择器支持直接下拉选年 / 月，改年月自动收敛非法日期（1月31日 → 2月变月末）。
- **列表密度与每页条数**：项目跟进 / 已签项目 / 长期观察 / Lost / 客户名单 / 合作伙伴共用同一套工具栏，默认「舒适」密度，每页默认「自动」（按窗口高度铺满一屏，选择器旁显示「自适应 N 条」），也可手选 8 / 15 / 全部。
- **备注归档**：`notes` 只保留最近 1 个月，更早的追加到 `server/data/archive/notes-archive.jsonl`（JSONL，含原字段 + `archivedAt`），**先确认落盘再从主表删除**。导出用 `npm run notes:export`：
  - `npm run notes:export -- --customer=<customerId>` 该客户的全部备注（含各项目）
  - `npm run notes:export -- --project=<projectId>` 只导某个项目
  - `npm run notes:export -- --since=2026-11-01` 按时间过滤
  - 导出结果带 `projectId` / `projectName` / `projectStatus` / `customerName` / `ownerCustomerId`，客户级备注 `projectId` 为空。
- **材料库**：文件存 `server/uploads/`，元数据存 SQLite；可执行 / 脚本类型（exe、bat、sh、js 等）禁止上传；HTML / SVG 通过沙箱 iframe（`sandbox=""`）隔离预览，PDF / 图片内联预览。
- **常量**：SKU 列表、`PROJECT_STATUS` 文案、`RENEW_WINDOW_DAYS` 见 `src/data/constants.js`；改续约窗口需同步 `server/index.js` 里的同名常量（后端不能直接 import 前端模块）。

## API 一览

### 项目

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/projects?status=&category=&customerId=` | 列表（带 `customerName` / `partnerName` / `sourceProjectName`，`skus` 已解析为数组） |
| GET | `/api/projects/:id` | 单个项目 |
| POST | `/api/projects` | 新建（`name` `customerId` `partnerId?` `category` `status?` `expectedAmount` `skus` `contact` `lastFollowUp` `nextFollowUp` `expiryDate?`；`won` 必须带 `contractAmount` `startDate` `expiryDate`） |
| PUT | `/api/projects/:id` | 更新（支持部分字段，校验规则同上） |
| DELETE | `/api/projects/:id` | 删除项目（连带项目级备注；有成交记录返回 409） |
| POST | `/api/projects/:id/win` | **赢单**：状态置 `won` + 写成交金额 / 订阅周期 + 落 `deals`（事务，重复调用返回已有成交） |
| POST | `/api/projects/:id/renew` | **创建续约项目**：新建 `category='renew'` 的 active 项目并关联 `sourceProjectId`（已有进行中续约项目返回 409） |
| POST | `/api/projects/:id/watch` | **转长期观察**：`status='watching'` + `watchedAt`，清空 `nextFollowUp` |
| POST | `/api/projects/:id/lost` | **标记 Lost**：`status='lost'` + `lostAt`（`won` 项目返回 409） |
| POST | `/api/projects/:id/restore` | **恢复**：`watching` / `lost` 回到 `active` |
| POST | `/api/sync/renewals` | 手动触发续约补建，返回 `{ created, renewWindowDays }`，幂等 |

### 客户 / 合作伙伴 / 成交

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/customers` | 客户列表（附 `activeProjectCount` / `signedProjectCount` / `totalProjectCount`） |
| POST | `/api/customers` | 新建客户（同名规范化后复用，返回该主档） |
| PUT | `/api/customers/:id` | 改名 / 改联系人（撞名返回 409） |
| DELETE | `/api/customers/:id` | 删除客户（名下还有项目返回 409） |
| GET | `/api/partners` | 合作伙伴列表 |
| POST / PUT / DELETE | `/api/partners` / `/api/partners/:id` | 合作伙伴增删改（删除时把 `projects.partnerId` 置空） |
| GET | `/api/deals` | 成交列表（带 `projectId` / `projectName` / `customerName`） |
| POST | `/api/deals` | 新增成交（必须选一个 `won` 项目，同一项目只允许一条，重复返回 409） |
| PUT / DELETE | `/api/deals/:id` | 修改 / 删除成交 |

### 备注 / 工作记录 / 材料

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/notes?customerType=customer&customerId=&projectId=` | 备注列表；`projectId` 为空返回该客户全部备注（带 `projectName`），有值时只返回该项目 |
| POST | `/api/notes` | 新增备注（`id` `customerType` `customerId` `projectId?` `content`；项目级备注刷新该项目跟进时间） |
| PUT / DELETE | `/api/notes/:id` | 修改内容 / 删除 |
| GET | `/api/worklogs` | 工作记录列表 |
| POST | `/api/worklogs` | 新增（`id` `content` `date`） |
| DELETE | `/api/worklogs/:id` | 删除 |
| GET | `/api/materials` | 材料库列表 |
| POST | `/api/materials` | 上传（multipart：`file` + 可选 `note`，单个 ≤ 100MB） |
| GET | `/api/materials/:id/download` | 按原始文件名下载 |
| DELETE | `/api/materials/:id` | 删除（同时删磁盘文件） |
| GET | `/uploads/:storedName` | 材料静态资源 |
| GET | `/api/health` | 健康检查 |

## 目录结构

```
├── server/
│   ├── index.js             # Express API（项目 / 客户 / 合作伙伴 / 成交 / 备注 / 工作记录 / 材料）
│   ├── db.js                # 建表 + 旧数据迁移（projects_migrated_v1）+ 重复客户合并
│   ├── export-notes.js      # 备注导出（现存 + 归档按 id 去重，支持按客户 / 项目 / 日期过滤）
│   ├── verify-projects.js   # 迁移与接口验收脚本（自建临时库，SMB_DB_FILE 隔离）
│   ├── data/smb.db          # 数据库文件（启动自动生成，已 gitignore）
│   ├── data/archive/        # 旧备注归档（JSONL）
│   └── uploads/             # 材料库文件（已 gitignore，部署时保留）
└── src/
    ├── App.jsx              # 主页面：状态管理 + 路由 + 详情弹窗
    ├── api.js               # 后端 API 客户端
    ├── styles.css           # 全局样式
    ├── components/
    │   ├── Home.jsx            # 总览
    │   ├── WorkJournal.jsx     # 今日工作（分天时间线）
    │   ├── ProjectList.jsx     # 项目跟进（New / Renew 双视图）
    │   ├── SignedProjects.jsx  # 已签项目（含续约入口）
    │   ├── ProjectStatusList.jsx # 长期观察 / Lost 项目
    │   ├── CustomerList.jsx    # 客户名单
    │   ├── PartnerList.jsx     # 合作伙伴（含关联项目列）
    │   ├── RevenuePanel.jsx    # 成交金额
    │   ├── MaterialLibrary.jsx # 材料库
    │   ├── Details.jsx         # 项目 / 客户 / 合作伙伴详情
    │   ├── NotesSection.jsx    # 备注时间线（客户级 / 项目级复用）
    │   ├── ExpiryAlert.jsx     # 已签项目临期提醒
    │   ├── ListTools.jsx       # 密度 / 每页 / 分页（各列表共用）
    │   ├── forms.jsx           # 项目 / 客户 / 合作伙伴 / 成交表单
    │   └── Modal.jsx / Badge.jsx / DatePicker.jsx / Pagination.jsx / Sidebar.jsx / Header.jsx / icons.jsx
    ├── data/constants.js    # SKUS / PROJECT_STATUS / RENEW_WINDOW_DAYS
    ├── hooks/               # useDbData / useViewportFit / useFitPaging
    └── utils/               # 日期 / 金额 / SKU 工具
```
