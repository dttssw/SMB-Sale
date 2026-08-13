import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const DIST_DIR = path.join(__dirname, '..', 'dist');

const app = express();
app.use(cors());
app.use(express.json());

// ---- 表结构与字段白名单（表名只允许取自白名单，杜绝注入） ----
const TABLES = ['contracts', 'prospects', 'deals'];

const COLUMNS = {
  contracts: ['id', 'name', 'owner', 'plan', 'contact', 'contractAmount', 'startDate', 'expiryDate', 'note'],
  prospects: ['id', 'name', 'owner', 'stage', 'contact', 'expectedAmount', 'lastFollowUp', 'nextFollowUp', 'note'],
  deals: ['id', 'customer', 'type', 'amount', 'date'],
};

const REQUIRED = {
  contracts: ['id', 'name', 'owner', 'plan', 'contractAmount', 'startDate', 'expiryDate'],
  prospects: ['id', 'name', 'owner', 'stage', 'expectedAmount'],
  deals: ['id', 'customer', 'type', 'amount', 'date'],
};

const NUMBER_COLS = {
  contracts: ['contractAmount'],
  prospects: ['expectedAmount'],
  deals: ['amount'],
};

const NOT_FOUND = (table) => TABLES.includes(table);

function sanitize(table, body) {
  const allowed = COLUMNS[table];
  const row = {};
  for (const key of allowed) {
    if (body[key] !== undefined && body[key] !== null) row[key] = body[key];
  }
  for (const key of REQUIRED[table]) {
    if (row[key] === undefined || row[key] === null || row[key] === '') {
      const err = new Error(`缺少必填字段: ${key}`);
      err.status = 400;
      throw err;
    }
  }
  for (const key of NUMBER_COLS[table]) {
    row[key] = Number(row[key]);
    if (!Number.isFinite(row[key])) {
      const err = new Error(`字段 ${key} 必须是数字`);
      err.status = 400;
      throw err;
    }
  }
  return row;
}

function findRow(table, id) {
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
}

// 健康检查：GET /api/health（需放在泛型 :table 路由之前）
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---- REST API ----

// 列表：GET /api/:table
app.get('/api/:table', (req, res, next) => {
  const table = req.params.table;
  if (!NOT_FOUND(table)) return res.status(404).json({ error: '未知资源' });
  try {
    res.json(db.prepare(`SELECT * FROM ${table} ORDER BY createdAt DESC`).all());
  } catch (err) {
    next(err);
  }
});

// 新增：POST /api/:table
app.post('/api/:table', (req, res, next) => {
  const table = req.params.table;
  if (!NOT_FOUND(table)) return res.status(404).json({ error: '未知资源' });
  try {
    const row = sanitize(table, req.body || {});
    const keys = Object.keys(row);
    const placeholders = keys.map((k) => `@${k}`).join(', ');
    db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`).run(row);
    res.status(201).json(findRow(table, row.id));
  } catch (err) {
    next(err);
  }
});

// 更新：PUT /api/:table/:id（支持部分字段更新，与现有记录合并后校验）
app.put('/api/:table/:id', (req, res, next) => {
  const table = req.params.table;
  const id = req.params.id;
  if (!NOT_FOUND(table)) return res.status(404).json({ error: '未知资源' });
  try {
    const existing = findRow(table, id);
    if (!existing) return res.status(404).json({ error: '记录不存在' });
    const row = sanitize(table, { ...existing, ...req.body, id });
    const sets = COLUMNS[table]
      .filter((k) => k in row)
      .map((k) => `${k} = @${k}`)
      .join(', ');
    db.prepare(`UPDATE ${table} SET ${sets} WHERE id = @id`).run(row);
    res.json(findRow(table, id));
  } catch (err) {
    next(err);
  }
});

// 删除：DELETE /api/:table/:id
app.delete('/api/:table/:id', (req, res, next) => {
  const table = req.params.table;
  const id = req.params.id;
  if (!NOT_FOUND(table)) return res.status(404).json({ error: '未知资源' });
  try {
    const result = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    if (!result.changes) return res.status(404).json({ error: '记录不存在' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// 清空全部业务数据：DELETE /api/data
app.delete('/api/data', (req, res, next) => {
  try {
    db.transaction(() => {
      for (const table of TABLES) db.prepare(`DELETE FROM ${table}`).run();
    })();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// 生产模式：若存在 dist 构建产物则一并托管前端
if (fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  app.use(express.static(DIST_DIR));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

// 统一错误处理
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || '服务器错误' });
});

app.listen(PORT, () => {
  console.log(`✅ SMB 销售工作台 API 已启动：http://localhost:${PORT}`);
  console.log(`   数据库文件：server/data/smb.db`);
});
