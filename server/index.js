import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { db, toUtf8, normalizeCustomerName } from './db.js';

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
  prospects: ['id', 'name', 'stage', 'contact', 'expectedAmount', 'lastFollowUp', 'nextFollowUp', 'note', 'category', 'contractId', 'expiryDate', 'plan', 'customerId'],
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
// 客户名唯一：名称即身份标识（同一名称 = 同一家公司），同名只允许一条 customers 记录。
function customerById(id) {
  return db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id);
}

// 按名称查已有客户主档（名称已规范化，直接用等值匹配）
function findCustomerByName(name) {
  const clean = normalizeCustomerName(name);
  if (!clean) return null;
  return db.prepare(`SELECT * FROM customers WHERE name = ? ORDER BY createdAt ASC LIMIT 1`).get(clean);
}

// 客户名 / 客户档案冲突统一用 409 + 可读提示返回（前端弹窗与页头横幅都会展示）
function conflict(message) {
  const e = new Error(message);
  e.status = 409;
  return e;
}

// 客户名唯一：改名撞到别的客户时直接拒绝，避免出现两条同名主档（备注时间线也会被拆散）
function assertCustomerNameFree(name, selfId) {
  const clash = db
    .prepare(`SELECT id, name FROM customers WHERE name = ? AND id != ? ORDER BY createdAt ASC LIMIT 1`)
    .get(normalizeCustomerName(name), String(selfId || ''));
  if (clash) {
    throw conflict(`客户名称「${clash.name}」已存在（客户名唯一）：请直接在已有客户上编辑，或换一个名称`);
  }
}

// 把某客户主档的姓名 / 联系人同步镜像到所有指向它的在约 / 跟进角色行，保证各板块看到一致资料
function mirrorCustomer(customerId) {
  const c = customerById(customerId);
  if (!c) return;
  db.prepare(`UPDATE contracts SET name = ?, contact = ? WHERE customerId = ?`).run(c.name, c.contact, customerId);
  db.prepare(`UPDATE prospects SET name = ?, contact = ? WHERE customerId = ?`).run(c.name, c.contact, customerId);
}

// 依据请求体解析 / 复用 / 创建客户主档，返回该主档的 { customerId, name, contact }。
// 客户名唯一，优先级：
//  1) 请求体带 customerId（转为在约 / 编辑角色行）→ 复用该主档；原主档已被删除时按名称兜底复用
//  2) 名称已存在（新增客户时同名）→ 直接复用已有主档，不再新建（这正是过去出现同名客户的原因）
//  3) 确实没有同名客户 → 新建主档
function attachCustomerIdentity(table, body) {
  const hasName = body && body.name != null;
  const hasContact = body && body.contact != null;
  const name = hasName ? normalizeCustomerName(body.name) : '';
  const contact = hasContact ? String(body.contact).trim() : '';
  let cid = body && body.customerId ? String(body.customerId) : '';
  let c = cid ? customerById(cid) : null;
  let reusedByName = false;

  if (!c) {
    const same = findCustomerByName(name);
    if (same) {
      // 同名客户：复用已有主档（含其备注时间线），避免同一家公司出现第二条档案
      cid = same.id;
      c = same;
      reusedByName = true;
    } else {
      if (!name) {
        const e = new Error('缺少必填字段: name');
        e.status = 400;
        throw e;
      }
      if (!cid) cid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      db.prepare(`INSERT INTO customers (id, name, contact) VALUES (?, ?, ?)`).run(cid, name, contact);
      c = customerById(cid);
    }
  } else {
    cid = c.id;
  }

  // 客户名唯一：改名撞到别的客户主档时拒绝
  const newName = name || c.name;
  if (newName !== c.name) assertCustomerNameFree(newName, cid);
  // 复用了同名主档时，表单里的空联系人不应覆盖已有联系人（其余情况按表单原样保存）
  const newContact = hasContact ? (reusedByName && !contact ? c.contact : contact) : c.contact;
  if (newName !== c.name || newContact !== (c.contact || '')) {
    db.prepare(`UPDATE customers SET name = ?, contact = ? WHERE id = ?`).run(newName, newContact || '', cid);
  }
  mirrorCustomer(cid);
  const fresh = customerById(cid);
  return { customerId: cid, name: fresh.name, contact: fresh.contact || '' };
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
// ---- 在约 / 续约的统一判断逻辑（新建客户与历史数据共用同一套规则） ----
// 续约窗口（天）：默认 60 天（约两个月）。只有距到期 ≤ 该天数的在约客户才进入「续约跟进」板块。
// ⚠️ 需与前端 src/data/constants.js 的 RENEW_WINDOW_DAYS 保持一致（后端不能直接 import 前端模块）
const RENEW_WINDOW_DAYS = 60;

// 自动补建在约记录时的默认产品（与前端 src/data/constants.js 的 PRODUCTS[0] 保持一致）
const DEFAULT_PLAN = '专业版';

// 与前端 src/utils/date.js 的 oneYearBefore 一致：到期时间 − 1 年 + 1 天（订阅默认一年）
function oneYearBefore(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return dateKey(new Date(y - 1, m - 1, d + 1));
}

// 判定「该客户是否在约」：按 contractId → customerId → 客户名（规范化）依次匹配在约记录
function findContractFor({ contractId, customerId, name } = {}) {
  if (contractId) {
    const byId = db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(contractId);
    if (byId) return byId;
  }
  if (customerId) {
    const byCustomer = db
      .prepare(`SELECT * FROM contracts WHERE customerId = ? ORDER BY expiryDate DESC LIMIT 1`)
      .get(customerId);
    if (byCustomer) return byCustomer;
  }
  const clean = normalizeCustomerName(name);
  if (!clean) return null;
  return db.prepare(`SELECT * FROM contracts WHERE name = ? ORDER BY expiryDate DESC LIMIT 1`).get(clean) || null;
}

// 在约记录是否已进入续约窗口：距到期 ≤ RENEW_WINDOW_DAYS 天（含已逾期）
function isWithinRenewWindow(expiryDate) {
  const d = daysUntil(expiryDate);
  return d != null && d <= RENEW_WINDOW_DAYS;
}

// 建立 / 更新某在约客户对应的「续约跟进」角色。
// 与在约客户共用同一份客户主档：名称、联系人、产品、金额、到期时间都以在约记录为准。
function upsertRenewRole(contract, customerId, extra = {}) {
  const cust = customerById(customerId) || { name: contract.name, contact: contract.contact || '' };
  const data = {
    name: cust.name,
    contact: cust.contact || '',
    expectedAmount: contract.contractAmount,
    plan: contract.plan || '',
    expiryDate: contract.expiryDate,
  };
  const existing = db
    .prepare(
      `SELECT * FROM prospects WHERE category = 'renew' AND (contractId = ? OR customerId = ?) ORDER BY createdAt ASC LIMIT 1`
    )
    .get(contract.id, customerId);
  if (existing) {
    db.prepare(
      `UPDATE prospects SET name = @name, contact = @contact, expectedAmount = @expectedAmount, plan = @plan, expiryDate = @expiryDate, contractId = @contractId, customerId = @customerId WHERE id = @id`
    ).run({ ...data, contractId: contract.id, customerId, id: existing.id });
    return existing.id;
  }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  db.prepare(
    `INSERT INTO prospects (id, name, stage, contact, expectedAmount, lastFollowUp, nextFollowUp, category, contractId, expiryDate, plan, customerId) VALUES (?, ?, 'negotiation', ?, ?, ?, ?, 'renew', ?, ?, ?, ?)`
  ).run(
    id,
    data.name,
    data.contact,
    data.expectedAmount,
    extra.lastFollowUp ?? '',
    extra.nextFollowUp ?? null,
    contract.id,
    data.expiryDate,
    data.plan,
    customerId
  );
  return id;
}

// 自动补建在约记录（用于「不在约」的续约跟进客户）：
// 产品取该续约角色的产品（缺省则第一个）、金额取预计金额、开始时间 = 到期时间前一年。
// 补建后客户即出现在「在约客户」板块，备注时间线仍挂在共享的客户主档上。
function createContractFromRenew(renew) {
  if (!renew.expiryDate) return null;
  const identity = attachCustomerIdentity('contracts', {
    customerId: renew.customerId,
    name: renew.name,
    contact: renew.contact,
  });
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  db.prepare(
    `INSERT INTO contracts (id, name, plan, contact, contractAmount, startDate, expiryDate, customerId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    identity.name,
    renew.plan || DEFAULT_PLAN,
    identity.contact,
    Number(renew.expectedAmount) || 0,
    oneYearBefore(renew.expiryDate),
    renew.expiryDate,
    identity.customerId
  );
  db.prepare(`UPDATE prospects SET customerId = ? WHERE id = ?`).run(identity.customerId, renew.id);
  return db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(id);
}

// 续约跟进同步：新建客户与历史数据共用同一套判断逻辑
//  A) 在约 → 续约跟进：距到期 ≤ RENEW_WINDOW_DAYS 天（约两个月）或已逾期的在约客户自动生成 / 更新 Renew 跟进
//  B) 续约跟进 → 在约：先判定每个续约客户「是否在约」——不在约（历史手动新建的）就按表单信息自动补建在约记录，
//     使其出现在「在约客户」板块；随后只有距到期 ≤ RENEW_WINDOW_DAYS 天的留在续约跟进，
//     距到期更久的从续约跟进退出（客户继续留在在约客户板块，共享备注时间线不受影响）。
function syncRenewals() {
  const summary = { createdContracts: 0, exitedRenew: 0 };

  // A) 在约 → 续约跟进
  for (const c of db.prepare(`SELECT * FROM contracts`).all()) {
    if (!isWithinRenewWindow(c.expiryDate)) continue;
    // 复用在约客户的客户主档：续约跟进与在约客户共享同一份名称 / 联系人 / 备注
    let cid = c.customerId;
    if (!cid || !customerById(cid)) {
      const identity = attachCustomerIdentity('prospects', { name: c.name, contact: c.contact });
      cid = identity.customerId;
      db.prepare(`UPDATE contracts SET customerId = ?, name = ?, contact = ? WHERE id = ?`).run(cid, c.name, c.contact || '', c.id);
    }
    upsertRenewRole(c, cid);
  }

  // B) 续约跟进 → 在约判定 + 续约窗口收口
  for (const r of db.prepare(`SELECT * FROM prospects WHERE category = 'renew'`).all()) {
    const before = findContractFor(r);
    const contract = before || createContractFromRenew(r);
    if (!contract) {
      // 既不在约、又没有续约到期时间 → 无法判定，保持原样（表单必填到期时间，正常不会出现）
      console.warn(`⚠️ 续约跟进客户「${r.name}」缺少续约到期时间，已跳过在约判定`);
      continue;
    }
    if (!before) summary.createdContracts += 1;
    if (!isWithinRenewWindow(contract.expiryDate)) {
      // 距到期还有两个多月 → 只在「在约客户」板块，退出续约跟进（备注挂在共享主档，不会丢）
      db.prepare(`DELETE FROM prospects WHERE id = ?`).run(r.id);
      summary.exitedRenew += 1;
      continue;
    }
    upsertRenewRole(contract, contract.customerId || r.customerId, {
      lastFollowUp: r.lastFollowUp,
      nextFollowUp: r.nextFollowUp,
    });
  }

  // 同一家客户在续约跟进里最多一条（历史重复行的收口，保留最早的那条）
  const seen = new Set();
  for (const row of db
    .prepare(`SELECT id, contractId FROM prospects WHERE category = 'renew' AND contractId != '' ORDER BY createdAt ASC, id ASC`)
    .all()) {
    if (!seen.has(row.contractId)) {
      seen.add(row.contractId);
      continue;
    }
    db.prepare(`DELETE FROM prospects WHERE id = ?`).run(row.id);
    summary.exitedRenew += 1;
  }

  return summary;
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

// 归档超过 1 个月的旧备注（见 archiveOldNotes）
// 备注自动归档：超过 1 个月的备注不再直接删除，而是先追加写入 archive/notes-archive.jsonl，再从 notes 表移除。
// 目的：让 VM 上的 smb.db 体积保持可控，同时不丢失历史沟通记录（续约周期是一年，历史备注是续约谈判的素材）。
const ARCHIVE_DIR = path.join(__dirname, 'data', 'archive');
const ARCHIVE_FILE = path.join(ARCHIVE_DIR, 'notes-archive.jsonl');

function archiveOldNotes() {
  try {
    const rows = db.prepare(`SELECT * FROM notes WHERE createdAt < datetime('now', '-1 month')`).all();
    if (!rows.length) return 0;

    // 先落盘，再删库：宁可归档文件里出现重复行（下面按 id 去重即可），也不能丢数据
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    const payload = rows.map((r) => JSON.stringify({ ...r, archivedAt: new Date().toISOString() })).join('\n') + '\n';
    fs.appendFileSync(ARCHIVE_FILE, payload, 'utf8');

    const del = db.prepare(`DELETE FROM notes WHERE createdAt < datetime('now', '-1 month')`).run();
    // 回收空间：SQLite 删行只把页放回空闲列表、文件不会自动缩小，VACUUM 才会。库很小，耗时毫秒级。
    db.exec('VACUUM');
    console.log(`🧹 已归档 ${del.changes} 条超过 1 个月的备注 → ${ARCHIVE_FILE}`);
    return del.changes;
  } catch (err) {
    console.error('归档旧备注失败：', err.message);
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
  archiveOldNotes();
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

// ---- 续约跟进同步：在约 → 续约跟进（距到期 ≤ RENEW_WINDOW_DAYS 天）＋ 续约跟进客户的在约判定与窗口收口 ----
app.post('/api/sync/renewals', (req, res, next) => {
  try {
    const summary = syncRenewals();
    reindexProspectFollowUps();
    res.json({ ok: true, renewWindowDays: RENEW_WINDOW_DAYS, ...summary });
  } catch (err) {
    next(err);
  }
});

// ---- 新建 / 编辑续约客户：服务端统一执行「在约判定」（须注册在泛型 POST /api/:table 之前） ----
// 1) 判定该客户是否在约（contractId → customerId → 客户名）：
//    在约 → 表单里的产品 / 金额 / 到期时间同步回在约记录（名称、联系人以客户主档为准）
//    不在约 → 用表单信息自动补建一条在约记录，客户随即出现在「在约客户」板块
// 2) 只有距到期 ≤ RENEW_WINDOW_DAYS 天（默认 60 天 ≈ 两个月）的才留在「续约跟进」，
//    距到期更久的自动退出续约跟进（客户继续留在在约客户板块，共享备注时间线不受影响）
app.post('/api/renewals', (req, res, next) => {
  try {
    const body = req.body || {};
    const name = normalizeCustomerName(body.name);
    if (!name) {
      const e = new Error('缺少必填字段: name');
      e.status = 400;
      throw e;
    }
    const amount = Number(body.expectedAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      const e = new Error('预计金额必须是大于 0 的数字');
      e.status = 400;
      throw e;
    }
    if (!body.expiryDate) {
      const e = new Error('缺少必填字段: expiryDate');
      e.status = 400;
      throw e;
    }
    // 编辑已有续约跟进角色时先取出原行：用于复用客户主档与沿用跟进日期
    const existing = body.id ? db.prepare(`SELECT * FROM prospects WHERE id = ?`).get(body.id) : null;

    // 1) 客户主档（客户名唯一 → 同名直接复用同一份名称 / 联系人 / 备注）
    const identity = attachCustomerIdentity('prospects', {
      customerId: existing?.customerId,
      name,
      contact: body.contact,
    });

    // 2) 在约判定
    let contract = findContractFor({
      contractId: existing?.contractId,
      customerId: identity.customerId,
      name: identity.name,
    });
    let createdContract = false;
    const expiryDate = String(body.expiryDate);
    if (contract) {
      // 已是在约客户：把表单里的订阅信息同步回在约记录，两个板块保持一致
      db.prepare(
        `UPDATE contracts SET name = ?, contact = ?, plan = ?, contractAmount = ?, startDate = ?, expiryDate = ? WHERE id = ?`
      ).run(
        identity.name,
        identity.contact,
        body.plan || contract.plan || existing?.plan || DEFAULT_PLAN,
        amount,
        expiryDate === contract.expiryDate ? contract.startDate : oneYearBefore(expiryDate),
        expiryDate,
        contract.id
      );
      contract = db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(contract.id);
    } else {
      // 尚未在约：自动补建在约记录（产品默认第一个、金额取预计金额、开始时间 = 到期时间前一年）
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      db.prepare(
        `INSERT INTO contracts (id, name, plan, contact, contractAmount, startDate, expiryDate, customerId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        identity.name,
        body.plan || existing?.plan || DEFAULT_PLAN,
        identity.contact,
        amount,
        oneYearBefore(expiryDate),
        expiryDate,
        identity.customerId
      );
      contract = db.prepare(`SELECT * FROM contracts WHERE id = ?`).get(id);
      createdContract = true;
    }

    // 3) 续约窗口判定：距到期 ≤ RENEW_WINDOW_DAYS 天才留在「续约跟进」
    const within = isWithinRenewWindow(contract.expiryDate);
    const payload = {
      ok: true,
      customerId: identity.customerId,
      contract,
      createdContract,
      removedFromRenew: false,
      daysLeft: daysUntil(contract.expiryDate),
      renewWindowDays: RENEW_WINDOW_DAYS,
      renew: null,
    };
    if (!within) {
      // 距到期还有两个多月：退出续约跟进，只在「在约客户」板块。
      // 按 contractId / customerId 一并清理（不依赖前端是否回传了续约行 id），避免留下过期角色行。
      const info = db
        .prepare(`DELETE FROM prospects WHERE category = 'renew' AND (contractId = ? OR customerId = ?)`)
        .run(contract.id, identity.customerId);
      payload.removedFromRenew = info.changes > 0;
      return res.status(createdContract ? 201 : 200).json(payload);
    }
    const renewId = upsertRenewRole(contract, identity.customerId, {
      lastFollowUp: body.lastFollowUp ?? existing?.lastFollowUp ?? '',
      nextFollowUp: body.nextFollowUp ?? existing?.nextFollowUp ?? null,
    });
    payload.renew = db.prepare(`SELECT * FROM prospects WHERE id = ?`).get(renewId);
    // 201：本次请求新建了在约记录或续约跟进角色；200：仅在原有记录上更新
    res.status(createdContract || !existing ? 201 : 200).json(payload);
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

// 客户名唯一 → 一家客户在「在约 / 客户跟进 / 续约跟进」里各最多出现一次。
// 同一客户跨板块重复（例如既在客户跟进又在约）会让同一家公司出现两条记录、备注时间线被拆开，因此写入前统一校验。
// excludeId：更新角色行时排除自身。
function assertCustomerRoleFree(table, row, excludeId) {
  const cid = String(row.customerId || '');
  if (!cid) return;
  const skip = excludeId ? ` AND id != ?` : ``;
  const skipArgs = excludeId ? [excludeId] : [];
  if (table === 'contracts') {
    const dup = db.prepare(`SELECT id, name FROM contracts WHERE customerId = ?${skip}`).get(cid, ...skipArgs);
    if (dup) {
      throw conflict(`该客户已有在约记录（${dup.name}），如需延长期限请在详情里使用「续约」`);
    }
    const following = db
      .prepare(`SELECT id, name FROM prospects WHERE customerId = ? AND COALESCE(NULLIF(category, ''), 'new') = 'new'${skip}`)
      .get(cid, ...skipArgs);
    if (following) {
      throw conflict(`客户「${following.name}」仍在客户跟进列表中，请在其详情里使用「转为在约」`);
    }
  }
  if (table === 'prospects') {
    const category = row.category === 'renew' ? 'renew' : 'new';
    const dup = db
      .prepare(`SELECT id, name FROM prospects WHERE customerId = ? AND COALESCE(NULLIF(category, ''), 'new') = ?${skip}`)
      .get(cid, category, ...skipArgs);
    if (dup) {
      throw conflict(
        `客户「${dup.name}」已在「${category === 'renew' ? '续约跟进' : '客户跟进'}」列表中，请直接查看 / 编辑该条记录`
      );
    }
    // 新签跟进不能挂在已是在约客户的公司上（续约由系统按到期时间自动带出 Renew）
    if (category === 'new') {
      const active = db.prepare(`SELECT id, name FROM contracts WHERE customerId = ?${skip}`).get(cid, ...skipArgs);
      if (active) {
        throw conflict(
          `客户「${active.name}」已是在约客户，系统已把它归入「在约客户」板块；距到期 ≤ ${RENEW_WINDOW_DAYS} 天时会自动带出续约跟进，无需重复新增跟进`
        );
      }
    }
  }
}

// 写入角色行（在约 / 跟进）前的统一准备：解析客户主档 + 校验同一客户在各板块的唯一性
function prepareCustomerRole(table, body, excludeId) {
  const row = sanitize(table, body);
  if (table === 'contracts' || table === 'prospects') {
    const identity = attachCustomerIdentity(table, body);
    row.customerId = identity.customerId;
    row.name = identity.name;
    row.contact = identity.contact;
    assertCustomerRoleFree(table, row, excludeId);
  }
  return row;
}

function insertRow(table, row) {
  const keys = Object.keys(row);
  const placeholders = keys.map((k) => `@${k}`).join(', ');
  db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`).run(row);
  return findRow(table, row.id);
}

// 新增：POST /api/:table
app.post('/api/:table', (req, res, next) => {
  const table = req.params.table;
  if (!NOT_FOUND(table)) return res.status(404).json({ error: '未知资源' });
  try {
    const body = req.body || {};
    // 先做字段校验（缺必填字段直接 400），再解析客户主档，避免校验失败时留下一条空档
    const row = prepareCustomerRole(table, body);
    res.status(201).json(insertRow(table, row));
  } catch (err) {
    next(err);
  }
});

// 转为在约：POST /api/prospects/:id/convert（body 为 ContractForm 的字段）
// 「移出跟进 + 建立在约」必须在同一个事务里完成：分两次请求时，若第二步失败会留下「合同已建、跟进还在」的中间态，
// 同一家客户就会同时出现在两个板块。改名 / 同名复用等主档逻辑仍走 prepareCustomerRole（客户名唯一）。
app.post('/api/prospects/:id/convert', (req, res, next) => {
  try {
    const p = db.prepare(`SELECT * FROM prospects WHERE id = ?`).get(req.params.id);
    if (!p) return res.status(404).json({ error: '记录不存在' });
    if (p.category === 'renew') {
      throw conflict('续约跟进客户本身关联着在约合同，不能重复转为在约');
    }
    // 带上原客户主档 id：表单里改了名字也只会给这一份主档改名（备注时间线不丢），撞名则 409
    const body = { ...(req.body || {}), customerId: p.customerId };
    // 新合同用全新 id（沿用旧前端「转为在约」的约定），不复用跟进记录的 id
    const rowId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const convert = db.transaction(() => {
      // 先解除跟进角色（客户主档与共享备注保留，由同一主档承接在约角色），
      // 再解析 / 校验主档：此时该跟进角色已被移除，不会把自己误判成「仍在客户跟进列表中」
      db.prepare(`DELETE FROM prospects WHERE id = ?`).run(p.id);
      const row = prepareCustomerRole('contracts', { ...body, id: rowId });
      insertRow('contracts', row);
    });
    convert();
    res.status(201).json(findRow('contracts', rowId));
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
    // 编辑在约 / 跟进客户的身份字段（名称/联系人）时，更新客户主档，并同步镜像到所有同 customerId 的角色行；
    // 同时按「客户名唯一」重新校验板块归属（排除自身）
    const row = prepareCustomerRole(table, body, id);
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

// 启动时归档一次超过 1 个月的旧备注
archiveOldNotes();

// 启动时对「续约跟进」里的所有客户执行一次在约判定（历史数据收口）：
// 不在约的自动补建在约记录 → 落到「在约客户」板块；距到期超过 RENEW_WINDOW_DAYS 天的从续约跟进退出。
const renewSummary = syncRenewals();
if (renewSummary.createdContracts || renewSummary.exitedRenew) {
  console.log(
    `✅ 续约跟进已在约判定收口：自动补建在约记录 ${renewSummary.createdContracts} 家，退出续约跟进 ${renewSummary.exitedRenew} 家`
  );
}

app.listen(PORT, () => {
  console.log(`✅ SMB 销售工作台 API 已启动：http://localhost:${PORT}`);
  console.log(`   数据库文件：server/data/smb.db`);
  console.log(`   服务器时区：${Intl.DateTimeFormat().resolvedOptions().timeZone} · ${new Date().toString()}`);
});
