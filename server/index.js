import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { db, toUtf8 } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const DIST_DIR = path.join(__dirname, '..', 'dist');

// ---- 材料库：上传文件存储目录（已 gitignore，随部署保留） ----
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 上传大小上限：100MB
const MAX_UPLOAD_SIZE = 100 * 1024 * 1024;

// 禁止上传的可执行 / 脚本类型（防止服务器与浏览器侧风险）
const BLOCKED_EXT = new Set([
  '.exe', '.bat', '.cmd', '.com', '.scr', '.msi', '.apk', '.jar',
  '.sh', '.bash', '.ps1', '.vbs', '.js', '.mjs', '.cjs', '.ts',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}-${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXT.has(ext)) {
      return cb(new Error(`不支持上传该类型文件：${ext || '未知'}`));
    }
    cb(null, true);
  },
});

const app = express();
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// ---- 表结构与字段白名单（表名只允许取自白名单，杜绝注入） ----
const TABLES = ['contracts', 'prospects', 'deals', 'partners'];

const COLUMNS = {
  contracts: ['id', 'name', 'plan', 'contact', 'contractAmount', 'startDate', 'expiryDate', 'note'],
  prospects: ['id', 'name', 'stage', 'contact', 'expectedAmount', 'lastFollowUp', 'nextFollowUp', 'note', 'category', 'contractId', 'expiryDate'],
  deals: ['id', 'customer', 'type', 'amount', 'date'],
  partners: ['id', 'name', 'contact', 'note'],
};

const REQUIRED = {
  contracts: ['id', 'name', 'plan', 'contractAmount', 'startDate', 'expiryDate'],
  prospects: ['id', 'name', 'stage', 'expectedAmount'],
  deals: ['id', 'customer', 'type', 'amount', 'date'],
  partners: ['id', 'name'],
};

const NUMBER_COLS = {
  contracts: ['contractAmount'],
  prospects: ['expectedAmount'],
  deals: ['amount'],
  partners: [],
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

// ---- 日期 / 备注相关工具（后端本地时区；SQLite datetime('now') 存的是 UTC）----
const pad2 = (n) => String(n).padStart(2, '0');
function dateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function todayDateKey() {
  const now = new Date();
  return { date: dateKey(now), time: `${pad2(now.getHours())}:${pad2(now.getMinutes())}` };
}
// 把 SQLite 返回的 UTC 时间字符串(YYYY-MM-DD HH:MM:SS) 转成本地 Date
function localDateOfDb(createdAt) {
  return new Date(String(createdAt).replace(' ', 'T') + 'Z');
}
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(y, m - 1, d);
  t.setDate(t.getDate() + days);
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}
// 取某跟进客户最后一条备注的本地日期 → 上次跟进日期，下次跟进为 3 天后
function lastFollowUpDates(prospectId) {
  const last = db
    .prepare(`SELECT createdAt FROM notes WHERE customerType = 'prospect' AND customerId = ? ORDER BY createdAt DESC LIMIT 1`)
    .get(prospectId);
  if (!last) return null;
  const d = localDateOfDb(last.createdAt);
  if (Number.isNaN(d.getTime())) return null;
  const lf = dateKey(d);
  return { lastFollowUp: lf, nextFollowUp: addDays(lf, 3) };
}
// 跟上跟进客户的上次/下次跟进日期（以备注时间线为准）
function reindexProspectFollowUps() {
  const pros = db.prepare(`SELECT id FROM prospects`).all();
  for (const p of pros) {
    const dates = lastFollowUpDates(p.id);
    if (dates) {
      db.prepare(`UPDATE prospects SET lastFollowUp = ?, nextFollowUp = ? WHERE id = ?`).run(
        dates.lastFollowUp,
        dates.nextFollowUp,
        p.id
      );
    }
  }
}
// 续约跟进同步：到期<45天的在约客户自动生成/更新 Renew 跟进；不再接近到期的自动退出
const RENEW_WINDOW_DAYS = 45;
function syncRenewals() {
  const contracts = db.prepare(`SELECT * FROM contracts`).all();
  const active = new Set();
  for (const c of contracts) {
    const d = daysUntil(c.expiryDate);
    if (d != null && d < RENEW_WINDOW_DAYS) {
      active.add(c.id);
      const existing = db.prepare(`SELECT * FROM prospects WHERE category = 'renew' AND contractId = ?`).get(c.id);
      const data = { name: c.name, contact: c.contact || '', expectedAmount: c.contractAmount, expiryDate: c.expiryDate };
      if (existing) {
        db.prepare(
          `UPDATE prospects SET name = @name, contact = @contact, expectedAmount = @expectedAmount, expiryDate = @expiryDate WHERE id = @id`
        ).run({ ...data, id: existing.id });
      } else {
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        db.prepare(
          `INSERT INTO prospects (id, name, stage, contact, expectedAmount, lastFollowUp, nextFollowUp, category, contractId, expiryDate) VALUES (?, ?, 'negotiation', ?, ?, '', NULL, 'renew', ?, ?)`
        ).run(id, data.name, data.contact, data.expectedAmount, c.id, data.expiryDate);
      }
    }
  }
  // 自动退出：仅删除「由在约客户自动生成」的 Renew 跟进（已关联 contractId），当其关联在约客户不存在或不再少于45天到期时清理并删除备注；
  // 手动新建的 Renew 客户（contractId 为空）保留不删
  const renews = db.prepare(`SELECT * FROM prospects WHERE category = 'renew'`).all();
  for (const r of renews) {
    if (r.contractId && !active.has(r.contractId)) {
      db.prepare(`DELETE FROM notes WHERE customerType = 'prospect' AND customerId = ?`).run(r.id);
      db.prepare(`DELETE FROM prospects WHERE id = ?`).run(r.id);
    }
  }
}

// 健康检查：GET /api/health（需放在泛型 :table 路由之前）
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---- 材料库：文件上传 / 列表 / 下载 / 删除（须在泛型 :table 路由之前注册） ----

// 列表：GET /api/materials
app.get('/api/materials', (req, res, next) => {
  try {
    const rows = db
      .prepare(`SELECT id, name, storedName, mime, size, ext, note, createdAt FROM materials ORDER BY createdAt DESC`)
      .all();
    res.json(rows.map((m) => ({ ...m, url: `/uploads/${encodeURIComponent(m.storedName)}` })));
  } catch (err) {
    next(err);
  }
});

// 上传：POST /api/materials（multipart/form-data，字段：file、note）
app.post('/api/materials', upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) {
      const err = new Error('未接收到文件，请选择要上传的文件');
      err.status = 400;
      throw err;
    }
    const originalName = toUtf8(req.file.originalname);
    const ext = path.extname(originalName).toLowerCase();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const note = toUtf8(String(req.body.note || '')).trim();
    db.prepare(
      `INSERT INTO materials (id, name, storedName, mime, size, ext, note) VALUES (@id, @name, @storedName, @mime, @size, @ext, @note)`
    ).run({
      id,
      name: originalName,
      storedName: req.file.filename,
      mime: req.file.mimetype,
      size: req.file.size,
      ext,
      note,
    });
    const saved = db.prepare(`SELECT * FROM materials WHERE id = ?`).get(id);
    res.status(201).json({ ...saved, url: `/uploads/${encodeURIComponent(saved.storedName)}` });
  } catch (err) {
    // 清理已落盘但入库失败的文件
    if (req.file) fs.unlink(req.file.path, () => {});
    next(err);
  }
});

// 下载：GET /api/materials/:id/download（以原始文件名下载）
app.get('/api/materials/:id/download', (req, res, next) => {
  try {
    const m = db.prepare(`SELECT * FROM materials WHERE id = ?`).get(req.params.id);
    if (!m) return res.status(404).json({ error: '文件不存在' });
    const filePath = path.join(UPLOAD_DIR, m.storedName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件已丢失' });
    res.download(filePath, m.name);
  } catch (err) {
    next(err);
  }
});

// 删除：DELETE /api/materials/:id（同时删除磁盘文件）
app.delete('/api/materials/:id', (req, res, next) => {
  try {
    const m = db.prepare(`SELECT * FROM materials WHERE id = ?`).get(req.params.id);
    if (!m) return res.status(404).json({ error: '文件不存在' });
    db.prepare(`DELETE FROM materials WHERE id = ?`).run(req.params.id);
    fs.unlink(path.join(UPLOAD_DIR, m.storedName), () => {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- 客户备注（时间线）路由 ----
const NOTE_TYPES = ['contract', 'prospect', 'partner'];

// 列表：GET /api/notes?customerType=&customerId=
app.get('/api/notes', (req, res, next) => {
  const { customerType, customerId } = req.query;
  if (!NOTE_TYPES.includes(customerType)) {
    return res.status(400).json({ error: 'customerType 必须为 contract、prospect 或 partner' });
  }
  if (!customerId) return res.status(400).json({ error: '缺少 customerId' });
  try {
    const rows = db
      .prepare(`SELECT * FROM notes WHERE customerType = ? AND customerId = ? ORDER BY createdAt DESC`)
      .all(customerType, customerId);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// 新增：POST /api/notes（同一本地日期的备注合并到同一条，每次以 [HH:MM] 作为时间标记前缀）
app.post('/api/notes', (req, res, next) => {
  try {
    const { id, customerType, customerId, content, raw } = req.body || {};
    if (!id) {
      const e = new Error('缺少 id');
      e.status = 400;
      throw e;
    }
    if (!NOTE_TYPES.includes(customerType)) {
      const e = new Error('customerType 必须为 contract、prospect 或 partner');
      e.status = 400;
      throw e;
    }
    if (!customerId) {
      const e = new Error('缺少 customerId');
      e.status = 400;
      throw e;
    }
    if (!content || !String(content).trim()) {
      const e = new Error('备注内容不能为空');
      e.status = 400;
      throw e;
    }
    const text = String(content).trim();

    // raw=true：备注迁移专用，原样写入（不合并、不加时间标记）
    if (raw) {
      db.prepare(`INSERT INTO notes (id, customerType, customerId, content) VALUES (?, ?, ?, ?)`).run(
        id,
        customerType,
        customerId,
        text
      );
      return res.status(201).json(db.prepare(`SELECT * FROM notes WHERE id = ?`).get(id));
    }

    const { date, time } = todayDateKey();
    const marker = `[${time}]`;

    // 找该客户本地日期为今天的最新一条备注，若存在则合并到它（同一天多次备注累积）
    const existing = db
      .prepare(`SELECT * FROM notes WHERE customerType = ? AND customerId = ? ORDER BY createdAt DESC`)
      .all(customerType, customerId);
    let todayNote = null;
    for (const r of existing) {
      const d = localDateOfDb(r.createdAt);
      if (!Number.isNaN(d.getTime()) && dateKey(d) === date) {
        todayNote = r;
        break;
      }
    }

    let saved;
    if (todayNote) {
      const merged = `${todayNote.content}\n${marker} ${text}`;
      db.prepare(`UPDATE notes SET content = ? WHERE id = ?`).run(merged, todayNote.id);
      saved = db.prepare(`SELECT * FROM notes WHERE id = ?`).get(todayNote.id);
    } else {
      db.prepare(`INSERT INTO notes (id, customerType, customerId, content) VALUES (?, ?, ?, ?)`).run(
        id,
        customerType,
        customerId,
        `${marker} ${text}`
      );
      saved = db.prepare(`SELECT * FROM notes WHERE id = ?`).get(id);
    }

    // 若为跟进客户：用最后一次添加备注的日期作为上次跟进，下次跟进自动设为3天后
    if (customerType === 'prospect') {
      const dates = lastFollowUpDates(customerId);
      if (dates) {
        db.prepare(`UPDATE prospects SET lastFollowUp = ?, nextFollowUp = ? WHERE id = ?`).run(
          dates.lastFollowUp,
          dates.nextFollowUp,
          customerId
        );
      }
    }
    res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
});

// 删除：DELETE /api/notes/:id
app.delete('/api/notes/:id', (req, res, next) => {
  try {
    const result = db.prepare(`DELETE FROM notes WHERE id = ?`).run(req.params.id);
    if (!result.changes) return res.status(404).json({ error: '备注不存在' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- 续约跟进同步：到期<45天的在约客户自动生成/更新 Renew 跟进；不再接近到期自动退出 ----
app.post('/api/sync/renewals', (req, res, next) => {
  try {
    syncRenewals();
    reindexProspectFollowUps();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

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
    const result = db.transaction(() => {
      const del = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
      if (del.changes) {
        const type = table === 'contracts' ? 'contract' : table === 'prospects' ? 'prospect' : table === 'partners' ? 'partner' : null;
        if (type) db.prepare(`DELETE FROM notes WHERE customerType = ? AND customerId = ?`).run(type, id);
        // 删除在约客户时，级联清理其自动生成的 Renew 跟进及其备注
        if (table === 'contracts') {
          db.prepare(
            `DELETE FROM notes WHERE customerType = 'prospect' AND customerId IN (SELECT id FROM prospects WHERE category = 'renew' AND contractId = ?)`
          ).run(id);
          db.prepare(`DELETE FROM prospects WHERE category = 'renew' AND contractId = ?`).run(id);
        }
      }
      return del;
    })();
    if (!result.changes) return res.status(404).json({ error: '记录不存在' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// 材料库文件静态托管：支持 PDF / 图片等在线预览；html/svg 等存在脚本风险的类型强制下载而非内联渲染
const INLINE_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp']);
app.use(
  '/uploads',
  (req, res, next) => {
    if (!INLINE_EXT.has(path.extname(req.path).toLowerCase())) {
      res.setHeader('Content-Disposition', 'attachment');
    }
    next();
  },
  express.static(UPLOAD_DIR)
);

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
  const status = err.status || (err instanceof multer.MulterError ? 400 : 500);
  let message = err.message || '服务器错误';
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = `文件大小超出限制（最大 ${Math.round(MAX_UPLOAD_SIZE / 1024 / 1024)}MB）`;
    } else {
      message = '文件上传失败，请重试';
    }
  }
  if (status >= 500) console.error(err);
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`✅ SMB 销售工作台 API 已启动：http://localhost:${PORT}`);
  console.log(`   数据库文件：server/data/smb.db`);
  console.log(`   服务器时区：${Intl.DateTimeFormat().resolvedOptions().timeZone} · ${new Date().toString()}`);
});
