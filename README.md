# SMB 销售工作台

面向中小企业销售团队的销售管理看板，涵盖三大核心场景：

1. **在约客户 · 到期时间** — 查看所有在约客户的订阅到期时间，自动分级提醒（已到期 / 30天内到期 / 90天内到期），优先触达防止续约流失。
2. **跟进中的新客户** — 跟进管道管理（初次沟通 → 需求确认 → 方案演示 → 商务谈判 → 待签约），按下次跟进时间排序，标记逾期未跟进客户。
3. **金额看板 · 续约 vs 新签** — 续约金额与新签金额的月度趋势柱状图、占比环形图、最近成交明细，以及本月/累计 KPI。
4. **材料库** — 上传产品方案、报价单、合同模板等资料（PDF / PPT / Word / Excel / HTML / 图片 / 压缩包等），支持多文件批量上传、在线预览（PDF/图片）、下载与删除。

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
npm run server  # 仅启动后端 API（端口 3001）
npm run web     # 仅启动前端（端口 5173）
```

生产构建（构建产物由后端一并托管，单进程运行）：

```bash
npm run build
npm start       # 生产模式运行于端口 3001
```

## 功能说明

- 所有数据存储在 SQLite 数据库中，可新增 / 编辑 / 删除在约客户、跟进客户与成交记录，改动实时生效。
- 跟进中的新客户可一键**转为在约客户**：点击操作栏「转为在约」，表单自动带入客户名称、联系人、预计金额与备注（订阅默认一年），保存后该客户移入在约列表并从跟进列表中移除。
- 在约客户订阅默认一年：选定**订阅开始时间**后，到期时间自动设为一年后（前一天）；反向，选定**订阅到期时间**后，开始时间自动设为一年前（加一天），双向自动联动。
- 材料库文件存储在 `server/uploads/`（已 gitignore），文件元数据存于 SQLite，可批量上传、预览、下载与删除；可执行/脚本类型（exe、bat、sh、js 等）禁止上传，html/svg 等含脚本风险的类型以附件方式下载而非内联渲染。
- 业务常量（套餐、跟进阶段）见 `src/data/constants.js`。

## API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/contracts` / `/api/prospects` / `/api/deals` | 列表 |
| POST | `/api/contracts` / `/api/prospects` / `/api/deals` | 新增 |
| PUT | `/api/contracts/:id` / `/api/prospects/:id` / `/api/deals/:id` | 更新 |
| DELETE | `/api/contracts/:id` / `/api/prospects/:id` / `/api/deals/:id` | 删除 |
| GET | `/api/materials` | 材料库列表 |
| POST | `/api/materials` | 上传材料（multipart，字段 `file` + 可选 `note`，单个 ≤ 100MB） |
| GET | `/api/materials/:id/download` | 以原始文件名下载材料 |
| DELETE | `/api/materials/:id` | 删除材料（同时删除磁盘文件） |
| GET | `/uploads/:storedName` | 材料静态资源（PDF/图片可在线预览） |
| GET | `/api/health` | 健康检查 |

## 目录结构

```
├── server/
│   ├── index.js             # Express API 服务（含材料库上传/下载）
│   ├── db.js                # SQLite 建库建表（不写入任何演示数据）
│   ├── data/smb.db          # 数据库文件（启动后自动生成，已 gitignore）
│   └── uploads/             # 材料库上传文件（已 gitignore，部署时保留）
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
    │   ├── MaterialLibrary.jsx # 材料库（上传/预览/下载/删除）
    │   ├── forms.jsx        # 新增/编辑表单
    │   ├── Modal.jsx / Badge.jsx
    ├── data/
    │   └── constants.js     # 套餐 / 跟进阶段
    ├── hooks/useDbData.js   # 数据库 CRUD Hook（替代原 localStorage）
    └── utils/               # 日期 / 金额工具
```

## MCP 集成（GitHub / GitLab）

本仓库通过 VS Code 的 MCP 服务器让 AI 助手直接操作 GitHub 与内网 GitLab（Issue / PR / MR / Pipeline 等），配置见 `.vscode/mcp.json`：

| 服务 | 类型 | 说明 |
| --- | --- | --- |
| `github` | 远程 HTTP + OAuth | GitHub 官方 MCP Server。首次连接时 VS Code 自动弹出浏览器 OAuth 授权，无需手动配置 Token |
| `gitlab` | 本地 stdio | `@zereight/mcp-gitlab`，连接内网 GitLab，通过 Personal Access Token 认证 |

### 首次使用

1. 一次性安装 GitLab MCP 服务器（仅本机需要）：

   ```bash
   npm install -g @zereight/mcp-gitlab
   ```

2. 在 VS Code 打开本仓库，命令面板（`Cmd+Shift+P`）执行 **MCP: List Servers** 查看连接状态。

3. 连接 GitLab 时 VS Code 会弹出输入框，填入内网 GitLab 的 Personal Access Token：

   - 在 GitLab 个人设置页中创建 Personal Access Token
   - scope 至少勾选 `read_api`（只读）；如需通过 AI 创建分支 / MR / 合并等写操作，勾选 `api`

4. GitHub 首次连接时按提示在浏览器中完成 OAuth 授权即可。

### 注意事项

- **网络**：内网 GitLab 需当前机器与其网络互通（同一内网或 VPN），否则 GitLab MCP 连接失败；GitHub 远程 MCP 需可访问 GitHub 官方服务。
- **安全**：GitLab Token 不会写入任何文件，`.vscode/mcp.json` 通过 `${input:gitlab-token}` 在连接时提示输入。
- **只读模式**：如需只读，把 `.vscode/mcp.json` 中 `GITLAB_READ_ONLY_MODE` 改为 `"true"`。
- **git remote 保留**：`origin`（GitHub）与 `gitlab`（内网 GitLab）仍用于实际的代码推送 / 拉取；MCP 负责平台侧操作，两者互补。
- 若 VS Code 提示找不到 `zereight-mcp-gitlab`，用 `which zereight-mcp-gitlab` 获取绝对路径并更新 `.vscode/mcp.json` 中的 `command`。

