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
const TABLES = ['contracts', 'prospects', 'deals', 'partners', 'worklogs'];

const COLUMNS = {
  contracts: ['id', 'name', 'plan', 'contact', 'contractAmount', 'startDate', 'expiryDate', 'note', 'customerId'],
  prospects: ['id', 'name', 'stage', 'contact', 'expectedAmount', 'lastFollowUp', 'nextFollowUp', 'note', 'category', 'contractId', 'expiryDate', 'customerId'],
  deals: ['id', 'customer', 'type', 'amount', 'date'],
  partners: ['id', 'name', 'contact', 'note'],
  worklogs: ['id', 'content', 'date'],
};

const REQUIRED = {
  contracts: ['id', 'name', 'plan', 'contractAmount', 'startDate', 'expiryDate'],
  prospects: ['id', 'name', 'stage', 'expectedAmount'],
  deals: ['id', 'customer', 'type', 'amount', 'date'],
  partners: ['id', 'name'],
  worklogs: ['id', 'content', 'date'],
};

const NUMBER_COLS = {
  contracts: ['contractAmount'],
  prospects: ['expectedAmount'],
  deals: ['amount'],
  partners: [],
  worklogs: [],
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

// ---- 客户主档（统一档案）----
// 同一家公司在「跟进 / 在约」板块通过 customerId 指向同一条 customers 记录，
// 使名称 / 联系人 / 备注全局一致，不再复制粘贴。合作伙伴（partners）保持独立档案。
function customerById(id) {
  return db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id);
}

// 把某客户主档的姓名 / 联系人同步镜像到所有指向它的在约 / 跟进角色行，保证各板块看到一致资料
function mirrorCustomer(customerId) {
  const c = customerById(customerId);
  if (!c) return;
  db.prepare(`UPDATE contracts SET name = ?, contact = ? WHERE customerId = ?`).run(c.name, c.contact, customerId);
  db.prepare(`UPDATE prospects SET name = ?, contact = ? WHERE customerId = ?`).run(c.name, c.contact, customerId);
}

// 依据请求体解析 / 创建客户主档，返回该主档的 { customerId, name, contact }。
// 若请求体带 customerId（如由跟进入转在约 / 手动关联），则复用该主档；否则新建。
function attachCustomerIdentity(table, body) {
  const hasName = body && body.name != null;
  const hasContact = body && body.contact != null;
  const name = hasName ? String(body.name).trim() : '';
  const contact = hasContact ? String(body.contact).trim() : '';
  let cid = body && body.customerId ? String(body.customerId) : '';
  if (cid) {
    const c = customerById(cid);
    if (!c) {
      db.prepare(`INSERT INTO customers (id, name, contact) VALUES (?, ?, ?)`).run(cid, name, contact);
    } else {
      const newName = name || c.name;
      const newContact = hasContact ? contact : c.contact;
      if (newName !== c.name || newContact !== c.contact) {
        db.prepare(`UPDATE customers SET name = ?, contact = ? WHERE id = ?`).run(newName, newContact, cid);
      }
    }
  } else {
    cid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    db.prepare(`INSERT INTO customers (id, name, contact) VALUES (?, ?, ?)`).run(cid, name, contact);
  }
  const c = customerById(cid);
  mirrorCustomer(cid);
  return { customerId: cid, name: c.name, contact: c.contact };
}

// ---- 日期 / 备注相关工具（后端本地时区；SQLite datetime('now') 存的是 UTC）----
const pad2 = (n) => String(n).padStart(2, '0');
function dateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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
// 取某客户主档最后一条备注的本地日期 → 其所有跟进角色的上次跟进日期，下次跟进为 3 天后
function lastFollowUpDates(customerId) {
  const last = db
    .prepare(`SELECT createdAt FROM notes WHERE customerType = 'customer' AND customerId = ? ORDER BY createdAt DESC LIMIT 1`)
    .get(customerId);
  if (!last) return null;
  const d = localDateOfDb(last.createdAt);
  if (Number.isNaN(d.getTime())) return null;
  const lf = dateKey(d);
  return { lastFollowUp: lf, nextFollowUp: addDays(lf, 3) };
}
// 重算某客户主档下所有跟进角色的上次/下次跟进日期
function updateFollowUpsForCustomer(customerId) {
  const dates = lastFollowUpDates(customerId);
  if (dates) {
    db.prepare(`UPDATE prospects SET lastFollowUp = ?, nextFollowUp = ? WHERE customerId = ?`).run(
      dates.lastFollowUp,
      dates.nextFollowUp,
      customerId
    );
  }
}
// 更新所有跟进客户的上次/下次跟进日期（以客户主档备注时间线为准）
function reindexProspectFollowUps() {
  const pros = db.prepare(`SELECT id, customerId FROM prospects`).all();
  for (const p of pros) {
    if (!p.customerId) continue;
    const dates = lastFollowUpDates(p.customerId);
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
      // 复用在约客户的客户主档：续约跟进与在约客户共享同一份名称 / 联系人 / 备注
      let cid = c.customerId;
      if (!cid || !customerById(cid)) {
        const identity = attachCustomerIdentity('prospects', { name: c.name, contact: c.contact });
        cid = identity.customerId;
        db.prepare(`UPDATE contracts SET customerId = ?, name = ?, contact = ? WHERE id = ?`).run(cid, c.name, c.contact || '', c.id);
      }
      const cust = customerById(cid) || { name: c.name, contact: c.contact || '' };
      const data = { name: cust.name, contact: cust.contact || '', expectedAmount: c.contractAmount, expiryDate: c.expiryDate };
      if (existing) {
        db.prepare(
          `UPDATE prospects SET name = @name, contact = @contact, expectedAmount = @expectedAmount, expiryDate = @expiryDate, customerId = @customerId WHERE id = @id`
        ).run({ ...data, customerId: cid, id: existing.id });
      } else {
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        db.prepare(
          `INSERT INTO prospects (id, name, stage, contact, expectedAmount, lastFollowUp, nextFollowUp, category, contractId, expiryDate, customerId) VALUES (?, ?, 'negotiation', ?, ?, '', NULL, 'renew', ?, ?, ?)`
        ).run(id, data.name, data.contact, data.expectedAmount, c.id, data.expiryDate, cid);
      }
    }
  }
  // 自动退出：仅删除「由在约客户自动生成」的 Renew 跟进（已关联 contractId），当其关联在约客户不再少于45天到期时移除该跟进角色。
  // 备注属于共享的客户主档时间线，这里只删除角色行、不动 customer 与 notes；手动新建的 Renew 客户（contractId 为空）保留不删。
  const renews = db.prepare(`SELECT * FROM prospects WHERE category = 'renew'`).all();
  for (const r of renews) {
    if (r.contractId && !active.has(r.contractId)) {
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
// customer：客户主档（跟进 / 在约 共用同一条时间线）；partner：合作伙伴独立档案
const NOTE_TYPES = ['contract', 'prospect', 'partner', 'customer'];

// 清理超过 1 个月的旧备注（自动删除；SQLite datetime('now') 为 UTC，与 createdAt 一致）
function purgeOldNotes() {
  try {
    const result = db.prepare(`DELETE FROM notes WHERE createdAt < datetime('now', '-1 month')`).run();
    if (result.changes > 0) console.log(`🧹 已自动清理 ${result.changes} 条超过 1 个月的旧备注`);
    return result.changes;
  } catch (err) {
    console.error('清理旧备注失败：', err.message);
    return 0;
  }
}

// 列表：GET /api/notes?customerType=&customerId=
app.get('/api/notes', (req, res, next) => {
  const { customerType, customerId } = req.query;
  if (!NOTE_TYPES.includes(customerType)) {
    return res.status(400).json({ error: 'customerType 必须为 contract、prospect、partner 或 customer' });
  }
  if (!customerId) return res.status(400).json({ error: '缺少 customerId' });
  purgeOldNotes();
  try {
    const rows = db
      .prepare(`SELECT * FROM notes WHERE customerType = ? AND customerId = ? ORDER BY createdAt DESC`)
      .all(customerType, customerId);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// 新增：POST /api/notes（每条备注独立成行，不再按天合并；时间取自 createdAt）
app.post('/api/notes', (req, res, next) => {
  try {
    const { id, customerType, customerId, content } = req.body || {};
    if (!id) {
      const e = new Error('缺少 id');
      e.status = 400;
      throw e;
    }
    if (!NOTE_TYPES.includes(customerType)) {
      const e = new Error('customerType 必须为 contract、prospect、partner 或 customer');
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
    db.prepare(`INSERT INTO notes (id, customerType, customerId, content) VALUES (?, ?, ?, ?)`).run(
      id,
      customerType,
      customerId,
      text
    );
    const saved = db.prepare(`SELECT * FROM notes WHERE id = ?`).get(id);

    // 客户主档备注：用最后一次添加备注的日期作为该客户下所有跟进角色的上次跟进，下次跟进自动设为3天后
    if (customerType === 'customer') {
      updateFollowUpsForCustomer(customerId);
    }
    res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
});

// 编辑：PUT /api/notes/:id（仅更新内容，保留原时间）
app.put('/api/notes/:id', (req, res, next) => {
  try {
    const { content } = req.body || {};
    if (!content || !String(content).trim()) {
      const e = new Error('备注内容不能为空');
      e.status = 400;
      throw e;
    }
    const text = String(content).trim();
    const result = db.prepare(`UPDATE notes SET content = ? WHERE id = ?`).run(text, req.params.id);
    if (!result.changes) return res.status(404).json({ error: '备注不存在' });
    const saved = db.prepare(`SELECT * FROM notes WHERE id = ?`).get(req.params.id);
    // 客户主档备注：更新备注后同步重算该客户下所有跟进角色的上次/下次跟进日期
    if (saved.customerType === 'customer') {
      updateFollowUpsForCustomer(saved.customerId);
    }
    res.json(saved);
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

// 客户主档客户列表（只读，供统一档案视图使用）：GET /api/customers
app.get('/api/customers', (req, res, next) => {
  try {
    res.json(db.prepare(`SELECT * FROM customers ORDER BY createdAt DESC`).all());
  } catch (err) {
    next(err);
  }
});

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
    let body = req.body || {};
    // 在约 / 跟进统一走客户主档：解析/创建 customers，并让该角色行引用 customerId
    if (table === 'contracts' || table === 'prospects') {
      const identity = attachCustomerIdentity(table, body);
      body = { ...body, customerId: identity.customerId, name: identity.name, contact: identity.contact };
    }
    const row = sanitize(table, body);
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
    let body = { ...existing, ...req.body, id };
    // 编辑在约 / 跟进客户的身份字段（名称/联系人）时，更新客户主档，并同步镜像到所有同 customerId 的角色行
    if (table === 'contracts' || table === 'prospects') {
      const hasIdentityField =
        req.body && (req.body.name !== undefined || req.body.contact !== undefined || req.body.customerId !== undefined);
      if (hasIdentityField) {
        const identity = attachCustomerIdentity(table, body);
        body = { ...body, customerId: identity.customerId, name: identity.name, contact: identity.contact };
      }
    }
    const row = sanitize(table, body);
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

// 删除在约客户：级联清理其关联的 Renew 跟进；仅当该客户主档不再有任何角色时，才连同主档与备注一并删除
function deleteContractCascade(id) {
  const c = db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(id);
  if (!c) return 0;
  const cid = c.customerId;
  db.prepare(`DELETE FROM prospects WHERE category = 'renew' AND contractId = ?`).run(id);
  db.prepare(`DELETE FROM contracts WHERE id = ?`).run(id);
  const remaining = cid
    ? db.prepare(`SELECT (SELECT COUNT(*) FROM contracts WHERE customerId = ?) + (SELECT COUNT(*) FROM prospects WHERE customerId = ?) AS c`).get(cid, cid).c
    : 0;
  if (cid && remaining <= 0) {
    db.prepare(`DELETE FROM notes WHERE customerType = 'customer' AND customerId = ?`).run(cid);
    db.prepare(`DELETE FROM customers WHERE id = ?`).run(cid);
  }
  return 1;
}

// 删除跟进角色：保留共享的客户主档与备注（当客户主档还有其他角色，如已转在约），仅当无任何角色时才一并清理
function deleteProspectCascade(id) {
  const p = db.prepare(`SELECT * FROM prospects WHERE id = ?`).get(id);
  if (!p) return 0;
  const cid = p.customerId;
  db.prepare(`DELETE FROM prospects WHERE id = ?`).run(id);
  const remaining = cid
    ? db.prepare(`SELECT (SELECT COUNT(*) FROM contracts WHERE customerId = ?) + (SELECT COUNT(*) FROM prospects WHERE customerId = ?) AS c`).get(cid, cid).c
    : 0;
  if (cid && remaining <= 0) {
    db.prepare(`DELETE FROM notes WHERE customerType = 'customer' AND customerId = ?`).run(cid);
    db.prepare(`DELETE FROM customers WHERE id = ?`).run(cid);
  }
  return 1;
}

// 删除：DELETE /api/:table/:id
app.delete('/api/:table/:id', (req, res, next) => {
  const table = req.params.table;
  const id = req.params.id;
  if (!NOT_FOUND(table)) return res.status(404).json({ error: '未知资源' });
  try {
    let changes = 0;
    if (table === 'contracts') changes = deleteContractCascade(id);
    else if (table === 'prospects') changes = deleteProspectCascade(id);
    else if (table === 'partners') {
      changes = db.prepare(`DELETE FROM partners WHERE id = ?`).run(id).changes;
      if (changes) db.prepare(`DELETE FROM notes WHERE customerType = 'partner' AND customerId = ?`).run(id);
    } else {
      changes = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id).changes;
    }
    if (!changes) return res.status(404).json({ error: '记录不存在' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// 材料库文件静态托管：PDF / 图片 / HTML / SVG 支持在线预览。
// 说明：HTML/SVG 内可嵌入脚本（XSS 风险），前端刻意用沙箱 iframe（sandbox="" 禁用脚本与同源）加载，
// 后端此处放开内联渲染（不再强制 attachment），使 /uploads/ 下的 html/svg 能以 inline 方式拉到内容供沙箱预览。
const INLINE_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.html', '.htm', '.svg']);
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

// 启动时清理一次超过 1 个月的旧备注
purgeOldNotes();

app.listen(PORT, () => {
  console.log(`✅ SMB 销售工作台 API 已启动：http://localhost:${PORT}`);
  console.log(`   数据库文件：server/data/smb.db`);
  console.log(`   服务器时区：${Intl.DateTimeFormat().resolvedOptions().timeZone} · ${new Date().toString()}`);
});
