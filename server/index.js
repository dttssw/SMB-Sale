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
const TABLES = ['contracts', 'prospects', 'deals'];

const COLUMNS = {
  contracts: ['id', 'name', 'plan', 'contact', 'contractAmount', 'startDate', 'expiryDate', 'note'],
  prospects: ['id', 'name', 'stage', 'contact', 'expectedAmount', 'lastFollowUp', 'nextFollowUp', 'note'],
  deals: ['id', 'customer', 'type', 'amount', 'date'],
};

const REQUIRED = {
  contracts: ['id', 'name', 'plan', 'contractAmount', 'startDate', 'expiryDate'],
  prospects: ['id', 'name', 'stage', 'expectedAmount'],
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
});
