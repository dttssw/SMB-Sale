import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { db, toUtf8, normalizeCustomerName } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const DIST_DIR = path.join(__dirname, '..', 'dist');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const RENEW_WINDOW_DAYS = 60;
const ACTIVE = 'active';
const WATCHING = 'watching';
const WON = 'won';
const LOST = 'lost';
const STATUSES = [ACTIVE, WATCHING, WON, LOST];
const CATEGORY = ['new', 'renew'];
const SERVICE_SKU = 'PS人天服务';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_UPLOAD_SIZE = 100 * 1024 * 1024;
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
    if (BLOCKED_EXT.has(ext)) return cb(new Error(`不支持上传该类型文件：${ext || '未知'}`));
    cb(null, true);
  },
});

const uid = () => Date.now().toString(36) + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
const trim = (value) => String(value ?? '').trim();
const num = (value, fallback = 0) => {
  if (value === '' || value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function parseSkus(value) {
  if (Array.isArray(value)) return [...new Set(value.map(trim).filter(Boolean))];
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return [...new Set(parsed.map(trim).filter(Boolean))];
      if (typeof parsed === 'string') return [parsed.trim()].filter(Boolean);
    } catch {
      return [value.trim()].filter(Boolean);
    }
  }
  return [];
}

// PS 人天服务是一次性交付，不产生订阅开始 / 到期；只有全部 SKU 都是它时才按服务项目处理
function isServiceOnly(skus) {
  return skus.length > 0 && skus.every((sku) => sku === SERVICE_SKU);
}

// 每条 SKU 的数量：入参可能是对象，也可能是 JSON 文本；只保留当前项目里存在的 SKU，缺省按 1 计
function parseSkuQty(value, skus) {
  let map = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    map = value;
  } else if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) map = parsed;
    } catch {
      map = {};
    }
  }
  const out = {};
  for (const sku of skus) {
    const qty = Number(map[sku]);
    out[sku] = Number.isFinite(qty) && qty > 0 ? Math.max(1, Math.round(qty)) : 1;
  }
  return out;
}

function withSkus(row) {
  if (!row) return row;
  const skus = parseSkus(row.skus);
  return { ...row, skus, skuQty: parseSkuQty(row.skuQty, skus) };
}

const pad2 = (n) => String(n).padStart(2, '0');
function dateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function localToday() {
  return dateKey(new Date());
}
function localDateOfDb(createdAt) {
  return new Date(String(createdAt).replace(' ', 'T') + 'Z');
}
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(y, m - 1, d);
  t.setDate(t.getDate() + days);
  return dateKey(t);
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d);
  const now = new Date();
  return Math.round((target - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}

const PROJECT_SELECT = `
  SELECT
    p.id, p.name, p.customerId, p.partnerId, p.category, p.status, p.contact,
    p.expectedAmount, p.contractAmount, p.skus, p.skuQty,
    p.lastFollowUp, p.nextFollowUp, p.startDate, p.expiryDate,
    p.sourceProjectId, p.lostAt, p.watchedAt, p.createdAt, p.closedAt,
    c.name AS customerName,
    c.contact AS customerContact,
    pa.name AS partnerName,
    sp.name AS sourceProjectName
  FROM projects p
  JOIN customers c ON c.id = p.customerId
  LEFT JOIN partners pa ON pa.id = p.partnerId
  LEFT JOIN projects sp ON sp.id = p.sourceProjectId
`;

function projectById(id) {
  return db.prepare(`${PROJECT_SELECT} WHERE p.id = ?`).get(id);
}

function customerById(id) {
  return db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id);
}

function ensureCustomerExists(id) {
  const customer = id ? customerById(id) : null;
  if (!customer) throw httpError(400, '最终客户不存在，请选择有效客户');
  return customer;
}

function ensurePartnerExists(id) {
  if (!id) return null;
  const partner = db.prepare(`SELECT * FROM partners WHERE id = ?`).get(id);
  if (!partner) throw httpError(400, '合作伙伴不存在，请重新选择');
  return partner;
}

function validateProjectPayload(input, existing = null) {
  const customerId = trim(input.customerId ?? existing?.customerId);
  ensureCustomerExists(customerId);
  const partnerId = trim(input.partnerId ?? existing?.partnerId);
  ensurePartnerExists(partnerId);

  const categoryRaw = input.category !== undefined ? input.category : existing?.category;
  const category = categoryRaw == null || categoryRaw === '' ? null : trim(categoryRaw);
  if (category !== null && !CATEGORY.includes(category)) throw httpError(400, '项目类型只能是 new 或 renew');

  const status = trim(input.status ?? existing?.status ?? ACTIVE);
  if (!STATUSES.includes(status)) throw httpError(400, '项目状态无效');

  const name = trim(input.name ?? existing?.name);
  if (!name) throw httpError(400, '请填写项目名称');
  if (status !== WON && !category) throw httpError(400, '进行中的项目必须选择 new 或 renew 类型');

  const expectedAmount = num(input.expectedAmount ?? existing?.expectedAmount, 0);
  if (expectedAmount < 0) throw httpError(400, '预计金额不能小于 0');

  const skus = parseSkus(input.skus !== undefined ? input.skus : existing?.skus);
  const serviceOnly = isServiceOnly(skus);

  let contractAmount =
    input.contractAmount !== undefined ? input.contractAmount : existing?.contractAmount;
  contractAmount = contractAmount == null || contractAmount === '' ? null : num(contractAmount, NaN);
  const startDate = trim(input.startDate ?? existing?.startDate) || null;
  const expiryDate = trim(input.expiryDate ?? existing?.expiryDate) || null;
  if (status === WON) {
    if (!Number.isFinite(contractAmount) || contractAmount <= 0) throw httpError(400, '已签项目必须填写成交金额');
    // PS 人天服务一次性交付，不校验也不保存订阅期限
    if (!serviceOnly) {
      if (!startDate || !expiryDate) throw httpError(400, '已签项目必须填写订阅开始和到期时间');
      if (startDate > expiryDate) throw httpError(400, '订阅开始时间不能晚于到期时间');
    }
  } else if (status === ACTIVE) {
    contractAmount = null;
    // 续约项目允许带原订阅到期日用于提醒；新签项目不保存合同周期。
    if (category !== 'renew') {
      return {
        name,
        customerId,
        partnerId: partnerId || null,
        category,
        status,
        contact: trim(input.contact ?? existing?.contact),
        expectedAmount,
        contractAmount: null,
        startDate: null,
        expiryDate: null,
        skus,
        skuQty: parseSkuQty(input.skuQty !== undefined ? input.skuQty : existing?.skuQty, skus),
        lastFollowUp: trim(input.lastFollowUp ?? existing?.lastFollowUp) || null,
        nextFollowUp: trim(input.nextFollowUp ?? existing?.nextFollowUp) || null,
      };
    }
  }

  return {
    name,
    customerId,
    partnerId: partnerId || null,
    category,
    status,
    contact: trim(input.contact ?? existing?.contact),
    expectedAmount,
    contractAmount: status === WON ? contractAmount : null,
    startDate: status === WON && !serviceOnly ? startDate : null,
    expiryDate: status === WON && serviceOnly ? null : expiryDate,
    skus,
    skuQty: parseSkuQty(input.skuQty !== undefined ? input.skuQty : existing?.skuQty, skus),
    lastFollowUp: trim(input.lastFollowUp ?? existing?.lastFollowUp) || null,
    nextFollowUp:
      status === WATCHING ? null : trim(input.nextFollowUp ?? existing?.nextFollowUp) || null,
  };
}

function insertProject(input, forced = {}) {
  const row = validateProjectPayload({ ...input, ...forced });
  const id = trim(input.id) || uid();
  if (db.prepare(`SELECT 1 FROM projects WHERE id = ?`).get(id)) throw httpError(409, '项目 id 已存在');
  db.prepare(`
    INSERT INTO projects (
      id, name, customerId, partnerId, category, status, contact,
      expectedAmount, contractAmount, skus, skuQty, lastFollowUp, nextFollowUp,
      startDate, expiryDate, sourceProjectId, lostAt, watchedAt, closedAt, createdAt
    ) VALUES (
      @id, @name, @customerId, @partnerId, @category, @status, @contact,
      @expectedAmount, @contractAmount, @skus, @skuQty, @lastFollowUp, @nextFollowUp,
      @startDate, @expiryDate, @sourceProjectId, NULL, NULL, NULL, @createdAt
    )
  `).run({
    ...row,
    id,
    skus: JSON.stringify(row.skus),
    skuQty: JSON.stringify(row.skuQty || {}),
    sourceProjectId: trim(forced.sourceProjectId) || null,
    createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
  });
  return projectById(id);
}

function customerProjectCounts(customerId) {
  const counts = db
    .prepare(`
      SELECT
        SUM(CASE WHEN status IN ('active', 'watching') THEN 1 ELSE 0 END) AS activeCount,
        SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) AS signedCount,
        COUNT(*) AS totalCount
      FROM projects WHERE customerId = ?
    `)
    .get(customerId);
  return {
    activeProjectCount: Number(counts?.activeCount) || 0,
    signedProjectCount: Number(counts?.signedCount) || 0,
    totalProjectCount: Number(counts?.totalCount) || 0,
  };
}

function updateFollowUpsForProject(projectId) {
  const project = db.prepare(`SELECT id, status FROM projects WHERE id = ?`).get(projectId);
  if (!project) return;
  const last = db
    .prepare(`SELECT createdAt FROM notes WHERE projectId = ? ORDER BY createdAt DESC LIMIT 1`)
    .get(projectId);
  if (!last) {
    db.prepare(`UPDATE projects SET lastFollowUp = NULL, nextFollowUp = NULL WHERE id = ?`).run(projectId);
    return;
  }
  const local = localDateOfDb(last.createdAt);
  if (Number.isNaN(local.getTime())) return;
  const lastFollowUp = dateKey(local);
  const nextFollowUp = project.status === WATCHING ? null : addDays(lastFollowUp, 3);
  db.prepare(`UPDATE projects SET lastFollowUp = ?, nextFollowUp = ? WHERE id = ?`).run(
    lastFollowUp,
    nextFollowUp,
    projectId
  );
}

function syncRenewals() {
  const candidates = db
    .prepare(`
      SELECT p.*
      FROM projects p
      WHERE p.status = 'won'
        AND p.expiryDate IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM projects newer
          WHERE newer.customerId = p.customerId
            AND newer.status = 'won'
            AND newer.expiryDate IS NOT NULL
            AND (
              newer.expiryDate > p.expiryDate
              OR (newer.expiryDate = p.expiryDate AND newer.createdAt > p.createdAt)
            )
        )
        AND NOT EXISTS (
          SELECT 1 FROM projects renewal
          WHERE renewal.sourceProjectId = p.id
        )
      ORDER BY p.expiryDate ASC
    `)
    .all();

  let created = 0;
  const tx = db.transaction(() => {
    for (const project of candidates) {
      if (!isWithinRenewWindow(project.expiryDate)) continue;
      const customer = customerById(project.customerId);
      if (!customer) continue;
      const skus = parseSkus(project.skus);
      insertProject(
        {
          name: `${project.name} · 续约`,
          customerId: project.customerId,
          partnerId: project.partnerId,
          category: 'renew',
          status: ACTIVE,
          contact: project.contact,
          expectedAmount: project.contractAmount || project.expectedAmount || 0,
          skus,
          skuQty: parseSkuQty(project.skuQty, skus),
          lastFollowUp: '',
          nextFollowUp: '',
        },
        { sourceProjectId: project.id, expiryDate: project.expiryDate }
      );
      created += 1;
    }
  });
  tx();
  return { created, renewWindowDays: RENEW_WINDOW_DAYS };
}

function isWithinRenewWindow(expiryDate) {
  const days = daysUntil(expiryDate);
  return days != null && days <= RENEW_WINDOW_DAYS;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---- 材料库 ----
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

app.post('/api/materials', upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) throw httpError(400, '未接收到文件，请选择要上传的文件');
    const originalName = toUtf8(req.file.originalname);
    const ext = path.extname(originalName).toLowerCase();
    const id = uid();
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
    if (req.file) fs.unlink(req.file.path, () => {});
    next(err);
  }
});

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

// ---- 备注归档 ----
const ARCHIVE_DIR = path.join(__dirname, 'data', 'archive');
const ARCHIVE_FILE = path.join(ARCHIVE_DIR, 'notes-archive.jsonl');

function archiveOldNotes() {
  try {
    const rows = db.prepare(`SELECT * FROM notes WHERE createdAt < datetime('now', '-1 month')`).all();
    if (!rows.length) return 0;
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    const payload =
      rows.map((r) => JSON.stringify({ ...r, archivedAt: new Date().toISOString() })).join('\n') + '\n';
    fs.appendFileSync(ARCHIVE_FILE, payload, 'utf8');
    const deleted = db.prepare(`DELETE FROM notes WHERE createdAt < datetime('now', '-1 month')`).run().changes;
    db.exec('VACUUM');
    console.log(`🧹 已归档 ${deleted} 条超过 1 个月的备注`);
    return deleted;
  } catch (err) {
    console.error('归档旧备注失败：', err.message);
    return 0;
  }
}

// ---- 客户备注 ----
// 客户级：projectId 为空；项目级：projectId 有值。合作伙伴仍走 partner。
app.get('/api/notes', (req, res, next) => {
  try {
    const customerType = trim(req.query.customerType);
    const customerId = trim(req.query.customerId);
    const projectId = trim(req.query.projectId);
    if (!['customer', 'partner'].includes(customerType)) {
      throw httpError(400, 'customerType 必须为 customer 或 partner');
    }
    if (!customerId) throw httpError(400, '缺少 customerId');
    archiveOldNotes();
    let rows;
    if (customerType === 'partner') {
      rows = db
        .prepare(`SELECT n.*, NULL AS projectName FROM notes n WHERE n.customerType = 'partner' AND n.customerId = ? ORDER BY n.createdAt DESC`)
        .all(customerId);
    } else if (projectId) {
      const project = projectById(projectId);
      if (!project) throw httpError(404, '项目不存在');
      if (project.customerId !== customerId) throw httpError(400, '项目不属于该客户');
      rows = db
        .prepare(`
          SELECT n.*, p.name AS projectName
          FROM notes n LEFT JOIN projects p ON p.id = n.projectId
          WHERE n.customerType = 'customer' AND n.customerId = ? AND n.projectId = ?
          ORDER BY n.createdAt DESC
        `)
        .all(customerId, projectId);
    } else {
      rows = db
        .prepare(`
          SELECT n.*, p.name AS projectName
          FROM notes n LEFT JOIN projects p ON p.id = n.projectId
          WHERE n.customerType = 'customer' AND n.customerId = ?
          ORDER BY n.createdAt DESC
        `)
        .all(customerId);
    }
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.post('/api/notes', (req, res, next) => {
  try {
    const { id, customerType, customerId, projectId, content } = req.body || {};
    if (!trim(id)) throw httpError(400, '缺少 id');
    if (!['customer', 'partner'].includes(customerType)) throw httpError(400, '备注类型无效');
    if (!trim(customerId)) throw httpError(400, '缺少 customerId');
    if (!trim(content)) throw httpError(400, '备注内容不能为空');
    let linkedProject = null;
    if (customerType === 'customer') {
      ensureCustomerExists(customerId);
      if (trim(projectId)) {
        linkedProject = projectById(trim(projectId));
        if (!linkedProject) throw httpError(404, '项目不存在');
        if (linkedProject.customerId !== customerId) throw httpError(400, '项目不属于该客户');
      }
    }
    db.prepare(`INSERT INTO notes (id, customerType, customerId, projectId, content) VALUES (?, ?, ?, ?, ?)`).run(
      trim(id),
      customerType,
      trim(customerId),
      linkedProject?.id || null,
      trim(content)
    );
    if (linkedProject) updateFollowUpsForProject(linkedProject.id);
    const saved = db
      .prepare(`SELECT n.*, p.name AS projectName FROM notes n LEFT JOIN projects p ON p.id = n.projectId WHERE n.id = ?`)
      .get(trim(id));
    res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
});

app.put('/api/notes/:id', (req, res, next) => {
  try {
    const content = trim(req.body?.content);
    if (!content) throw httpError(400, '备注内容不能为空');
    const result = db.prepare(`UPDATE notes SET content = ? WHERE id = ?`).run(content, req.params.id);
    if (!result.changes) throw httpError(404, '备注不存在');
    const saved = db.prepare(`SELECT * FROM notes WHERE id = ?`).get(req.params.id);
    if (saved.projectId) updateFollowUpsForProject(saved.projectId);
    res.json(saved);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/notes/:id', (req, res, next) => {
  try {
    const saved = db.prepare(`SELECT * FROM notes WHERE id = ?`).get(req.params.id);
    if (!saved) throw httpError(404, '备注不存在');
    db.prepare(`DELETE FROM notes WHERE id = ?`).run(req.params.id);
    if (saved.projectId) updateFollowUpsForProject(saved.projectId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- 客户主档 ----
app.get('/api/customers', (req, res, next) => {
  try {
    const customers = db.prepare(`SELECT * FROM customers ORDER BY createdAt DESC, name ASC`).all();
    res.json(customers.map((c) => ({ ...c, ...customerProjectCounts(c.id) })));
  } catch (err) {
    next(err);
  }
});

app.post('/api/customers', (req, res, next) => {
  try {
    const name = normalizeCustomerName(req.body?.name);
    if (!name) throw httpError(400, '请填写客户名称');
    if (db.prepare(`SELECT 1 FROM customers WHERE name = ?`).get(name)) {
      throw httpError(409, `客户「${name}」已存在`);
    }
    const id = trim(req.body?.id) || uid();
    db.prepare(`INSERT INTO customers (id, name, contact) VALUES (?, ?, ?)`).run(
      id,
      name,
      trim(req.body?.contact)
    );
    res.status(201).json(db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id));
  } catch (err) {
    next(err);
  }
});

app.put('/api/customers/:id', (req, res, next) => {
  try {
    const existing = customerById(req.params.id);
    if (!existing) throw httpError(404, '客户不存在');
    const name = normalizeCustomerName(req.body?.name ?? existing.name);
    if (!name) throw httpError(400, '客户名称不能为空');
    const clash = db.prepare(`SELECT id FROM customers WHERE name = ? AND id != ?`).get(name, existing.id);
    if (clash) throw httpError(409, `客户「${name}」已存在`);
    db.prepare(`UPDATE customers SET name = ?, contact = ? WHERE id = ?`).run(
      name,
      trim(req.body?.contact ?? existing.contact),
      existing.id
    );
    res.json(db.prepare(`SELECT * FROM customers WHERE id = ?`).get(existing.id));
  } catch (err) {
    next(err);
  }
});

app.delete('/api/customers/:id', (req, res, next) => {
  try {
    const existing = customerById(req.params.id);
    if (!existing) throw httpError(404, '客户不存在');
    const count = Number(db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE customerId = ?`).get(existing.id).c);
    if (count > 0) throw httpError(409, `客户「${existing.name}」还有 ${count} 个项目，不能删除`);
    db.transaction(() => {
      db.prepare(`UPDATE deals SET customerId = NULL WHERE customerId = ?`).run(existing.id);
      db.prepare(`DELETE FROM notes WHERE customerType = 'customer' AND customerId = ?`).run(existing.id);
      db.prepare(`DELETE FROM customers WHERE id = ?`).run(existing.id);
    })();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- 项目 ----
app.get('/api/projects', (req, res, next) => {
  try {
    const filters = [];
    const args = [];
    if (trim(req.query.status)) {
      filters.push('p.status = ?');
      args.push(trim(req.query.status));
    }
    if (trim(req.query.category)) {
      filters.push('p.category = ?');
      args.push(trim(req.query.category));
    }
    if (trim(req.query.customerId)) {
      filters.push('p.customerId = ?');
      args.push(trim(req.query.customerId));
    }
    const where = filters.length ? ` WHERE ${filters.join(' AND ')}` : '';
    const rows = db.prepare(`${PROJECT_SELECT}${where} ORDER BY p.createdAt DESC, p.name ASC`).all(...args);
    res.json(rows.map(withSkus));
  } catch (err) {
    next(err);
  }
});

app.get('/api/projects/:id', (req, res, next) => {
  try {
    const project = projectById(req.params.id);
    if (!project) throw httpError(404, '项目不存在');
    res.json(withSkus(project));
  } catch (err) {
    next(err);
  }
});

app.post('/api/projects', (req, res, next) => {
  try {
    const project = insertProject(req.body || {}, { status: ACTIVE });
    res.status(201).json(withSkus(project));
  } catch (err) {
    next(err);
  }
});

app.put('/api/projects/:id', (req, res, next) => {
  try {
    const existing = projectById(req.params.id);
    if (!existing) throw httpError(404, '项目不存在');
    const input = { ...existing, ...(req.body || {}), status: existing.status };
    if (existing.status === WON && trim(input.customerId) !== existing.customerId) {
      throw httpError(400, '已签项目不能更换最终客户');
    }
    const row = validateProjectPayload(input, existing);
    db.prepare(`
      UPDATE projects SET
        name = @name,
        customerId = @customerId,
        partnerId = @partnerId,
        category = @category,
        contact = @contact,
        expectedAmount = @expectedAmount,
        contractAmount = @contractAmount,
        skus = @skus,
        skuQty = @skuQty,
        lastFollowUp = @lastFollowUp,
        nextFollowUp = @nextFollowUp,
        startDate = @startDate,
        expiryDate = @expiryDate
      WHERE id = @id
    `).run({
      ...row,
      id: existing.id,
      skus: JSON.stringify(row.skus),
      skuQty: JSON.stringify(row.skuQty || {}),
    });
    if (existing.status === WON) {
      db.prepare(`UPDATE deals SET amount = ? WHERE projectId = ?`).run(
        Number(row.contractAmount) || 0,
        existing.id
      );
    }
    res.json(withSkus(projectById(existing.id)));
  } catch (err) {
    next(err);
  }
});

app.delete('/api/projects/:id', (req, res, next) => {
  try {
    const existing = projectById(req.params.id);
    if (!existing) throw httpError(404, '项目不存在');
    const deals = Number(db.prepare(`SELECT COUNT(*) AS c FROM deals WHERE projectId = ?`).get(existing.id).c);
    if (deals > 0) throw httpError(409, '该项目已有成交记录，不能删除');
    db.transaction(() => {
      db.prepare(`DELETE FROM notes WHERE projectId = ?`).run(existing.id);
      db.prepare(`UPDATE projects SET sourceProjectId = NULL WHERE sourceProjectId = ?`).run(existing.id);
      db.prepare(`DELETE FROM projects WHERE id = ?`).run(existing.id);
    })();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post('/api/projects/:id/win', (req, res, next) => {
  try {
    const existing = projectById(req.params.id);
    if (!existing) throw httpError(404, '项目不存在');
    if (existing.status === LOST) throw httpError(409, 'Lost 项目需先恢复后才能赢单');
    if (existing.status === WATCHING) throw httpError(409, '长期观察项目需先恢复跟进后才能赢单');

    const body = req.body || {};
    const amount = num(body.contractAmount, 0);
    const startDate = trim(body.startDate);
    const expiryDate = trim(body.expiryDate);
    const skus = body.skus !== undefined ? parseSkus(body.skus) : parseSkus(existing.skus);
    const serviceOnly = isServiceOnly(skus);
    if (amount <= 0) throw httpError(400, '成交金额必须大于 0');
    if (!serviceOnly) {
      if (!startDate || !expiryDate) throw httpError(400, '请选择订阅开始和到期时间');
      if (startDate > expiryDate) throw httpError(400, '订阅开始时间不能晚于到期时间');
    }
    const skuQty = parseSkuQty(body.skuQty !== undefined ? body.skuQty : existing.skuQty, skus);

    const dealId = db.transaction(() => {
      db.prepare(`
        UPDATE projects SET
          status = 'won',
          contractAmount = ?,
          startDate = ?,
          expiryDate = ?,
          skus = ?,
          skuQty = ?,
          nextFollowUp = NULL,
          lostAt = NULL,
          watchedAt = NULL,
          closedAt = NULL
        WHERE id = ?
      `).run(
        amount,
        serviceOnly ? null : startDate,
        serviceOnly ? null : expiryDate,
        JSON.stringify(skus),
        JSON.stringify(skuQty),
        existing.id
      );

      const oldDeal = db.prepare(`SELECT * FROM deals WHERE projectId = ?`).get(existing.id);
      if (oldDeal) return oldDeal.id;
      const id = uid();
      db.prepare(`
        INSERT INTO deals (id, customer, type, amount, date, projectId, customerId)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        existing.customerName,
        existing.category === 'renew' ? 'renewal' : 'new',
        amount,
        localToday(),
        existing.id,
        existing.customerId
      );
      return id;
    })();
    res.json({ project: withSkus(projectById(existing.id)), dealId, dealCreated: !!dealId });
  } catch (err) {
    next(err);
  }
});

app.post('/api/projects/:id/renew', (req, res, next) => {
  try {
    const source = projectById(req.params.id);
    if (!source) throw httpError(404, '项目不存在');
    if (source.status !== WON) throw httpError(409, '只有已签项目才能新建续约');
    if (isServiceOnly(parseSkus(source.skus))) {
      throw httpError(409, 'PS 人天服务是一次性交付，没有订阅期限，不需要续约');
    }
    const activeRenew = db
      .prepare(`SELECT id FROM projects WHERE sourceProjectId = ? AND status IN ('active', 'watching') LIMIT 1`)
      .get(source.id);
    if (activeRenew) throw httpError(409, '这个已签项目已有进行中的续约项目');
    const body = req.body || {};
    const skus = body.skus !== undefined ? parseSkus(body.skus) : parseSkus(source.skus);
    const renewal = insertProject(
      {
        id: body.id || uid(),
        name: trim(body.name) || `${source.name} · 续约`,
        customerId: source.customerId,
        partnerId: body.partnerId !== undefined ? body.partnerId : source.partnerId,
        category: 'renew',
        status: ACTIVE,
        contact: body.contact ?? source.contact,
        expectedAmount:
          body.expectedAmount !== undefined
            ? body.expectedAmount
            : source.contractAmount || source.expectedAmount || 0,
        skus,
        skuQty: body.skuQty !== undefined ? body.skuQty : parseSkuQty(source.skuQty, skus),
        lastFollowUp: body.lastFollowUp || '',
        nextFollowUp: body.nextFollowUp || '',
        expiryDate: body.expiryDate || source.expiryDate,
      },
      { sourceProjectId: source.id }
    );
    res.status(201).json(withSkus(renewal));
  } catch (err) {
    next(err);
  }
});

function changeProjectStatus(id, target) {
  const existing = projectById(id);
  if (!existing) throw httpError(404, '项目不存在');
  if (existing.status === WON && target === LOST) throw httpError(409, '已签项目不能标记为 Lost');
  const today = localToday();
  if (target === LOST) {
    db.prepare(`
      UPDATE projects SET status = 'lost', lostAt = ?, watchedAt = NULL, closedAt = ?, nextFollowUp = NULL
      WHERE id = ?
    `).run(today, today, id);
  } else if (target === WATCHING) {
    if (existing.status !== ACTIVE) throw httpError(409, '只有进行中的项目才能转为长期观察');
    db.prepare(`
      UPDATE projects SET status = 'watching', watchedAt = ?, lostAt = NULL, closedAt = NULL, nextFollowUp = NULL
      WHERE id = ?
    `).run(today, id);
  } else {
    db.prepare(`
      UPDATE projects SET status = 'active', lostAt = NULL, watchedAt = NULL, closedAt = NULL
      WHERE id = ?
    `).run(id);
  }
  return withSkus(projectById(id));
}

app.post('/api/projects/:id/lost', (req, res, next) => {
  try {
    res.json(changeProjectStatus(req.params.id, LOST));
  } catch (err) {
    next(err);
  }
});

app.post('/api/projects/:id/watch', (req, res, next) => {
  try {
    res.json(changeProjectStatus(req.params.id, WATCHING));
  } catch (err) {
    next(err);
  }
});

app.post('/api/projects/:id/restore', (req, res, next) => {
  try {
    const project = projectById(req.params.id);
    if (!project) throw httpError(404, '项目不存在');
    if (![LOST, WATCHING].includes(project.status)) throw httpError(409, '该项目不需要恢复');
    res.json(changeProjectStatus(project.id, ACTIVE));
  } catch (err) {
    next(err);
  }
});

app.post('/api/sync/renewals', (req, res, next) => {
  try {
    res.json({ ok: true, ...syncRenewals() });
  } catch (err) {
    next(err);
  }
});

// ---- 成交 ----
const DEAL_SELECT = `
  SELECT d.*, p.name AS projectName, c.name AS customerName
  FROM deals d
  LEFT JOIN projects p ON p.id = d.projectId
  LEFT JOIN customers c ON c.id = d.customerId
`;

app.get('/api/deals', (req, res, next) => {
  try {
    res.json(db.prepare(`${DEAL_SELECT} ORDER BY d.date DESC, d.createdAt DESC`).all());
  } catch (err) {
    next(err);
  }
});

app.post('/api/deals', (req, res, next) => {
  try {
    const projectId = trim(req.body?.projectId);
    if (!projectId) throw httpError(400, '请选择成交对应的已签项目');
    const project = projectById(projectId);
    if (!project) throw httpError(404, '项目不存在');
    if (project.status !== WON) throw httpError(409, '只有已签项目才能记录成交');
    if (db.prepare(`SELECT 1 FROM deals WHERE projectId = ?`).get(projectId)) {
      throw httpError(409, '该项目已有一条成交记录');
    }
    const amount = num(req.body?.amount, project.contractAmount);
    if (amount <= 0) throw httpError(400, '成交金额必须大于 0');
    const date = trim(req.body?.date) || localToday();
    const id = trim(req.body?.id) || uid();
    db.prepare(`
      INSERT INTO deals (id, customer, type, amount, date, projectId, customerId)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      project.customerName,
      project.category === 'renew' ? 'renewal' : 'new',
      amount,
      date,
      project.id,
      project.customerId
    );
    res.status(201).json(db.prepare(`${DEAL_SELECT} WHERE d.id = ?`).get(id));
  } catch (err) {
    next(err);
  }
});

app.put('/api/deals/:id', (req, res, next) => {
  try {
    const existing = db.prepare(`SELECT * FROM deals WHERE id = ?`).get(req.params.id);
    if (!existing) throw httpError(404, '成交记录不存在');
    const amount = num(req.body?.amount ?? existing.amount, 0);
    if (amount <= 0) throw httpError(400, '成交金额必须大于 0');
    db.prepare(`UPDATE deals SET amount = ?, date = ? WHERE id = ?`).run(
      amount,
      trim(req.body?.date) || existing.date,
      existing.id
    );
    res.json(db.prepare(`${DEAL_SELECT} WHERE d.id = ?`).get(existing.id));
  } catch (err) {
    next(err);
  }
});

app.delete('/api/deals/:id', (req, res, next) => {
  try {
    const result = db.prepare(`DELETE FROM deals WHERE id = ?`).run(req.params.id);
    if (!result.changes) throw httpError(404, '成交记录不存在');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- 合作伙伴与工作记录 ----
const SIMPLE_TABLES = {
  partners: ['id', 'name', 'note'],
  worklogs: ['id', 'content', 'date'],
};

app.get('/api/:table', (req, res, next) => {
  const table = req.params.table;
  if (!SIMPLE_TABLES[table]) return res.status(404).json({ error: '未知资源' });
  try {
    const rows = db.prepare(`SELECT * FROM ${table} ORDER BY createdAt DESC`).all();
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.post('/api/:table', (req, res, next) => {
  const table = req.params.table;
  const columns = SIMPLE_TABLES[table];
  if (!columns) return res.status(404).json({ error: '未知资源' });
  try {
    const body = req.body || {};
    const id = trim(body.id) || uid();
    if (!id) throw httpError(400, '缺少 id');
    if (table === 'partners' && !trim(body.name)) throw httpError(400, '请填写合作伙伴名称');
    if (table === 'worklogs' && (!trim(body.content) || !trim(body.date))) {
      throw httpError(400, '工作记录内容和日期不能为空');
    }
    const row = { id };
    for (const key of columns) {
      if (key === 'id') continue;
      row[key] = trim(body[key]);
    }
    const keys = Object.keys(row);
    db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map((k) => `@${k}`).join(', ')})`).run(row);
    res.status(201).json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
  } catch (err) {
    next(err);
  }
});

app.put('/api/:table/:id', (req, res, next) => {
  const table = req.params.table;
  const columns = SIMPLE_TABLES[table];
  if (!columns) return res.status(404).json({ error: '未知资源' });
  try {
    const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!existing) throw httpError(404, '记录不存在');
    const body = req.body || {};
    const row = { id: existing.id };
    for (const key of columns) {
      if (key === 'id') continue;
      row[key] = body[key] !== undefined ? trim(body[key]) : existing[key] || '';
    }
    db.prepare(
      `UPDATE ${table} SET ${columns.filter((c) => c !== 'id').map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`
    ).run(row);
    res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(existing.id));
  } catch (err) {
    next(err);
  }
});

app.delete('/api/:table/:id', (req, res, next) => {
  const table = req.params.table;
  if (!SIMPLE_TABLES[table]) return res.status(404).json({ error: '未知资源' });
  try {
    const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!existing) throw httpError(404, '记录不存在');
    db.transaction(() => {
      if (table === 'partners') {
        db.prepare(`UPDATE projects SET partnerId = NULL WHERE partnerId = ?`).run(existing.id);
        db.prepare(`DELETE FROM notes WHERE customerType = 'partner' AND customerId = ?`).run(existing.id);
      }
      db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(existing.id);
    })();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.use(
  '/uploads',
  (req, res, next) => {
    const inlineExt = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.html', '.htm', '.svg']);
    if (!inlineExt.has(path.extname(req.path).toLowerCase())) res.setHeader('Content-Disposition', 'attachment');
    next();
  },
  express.static(UPLOAD_DIR)
);

if (fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  app.use(express.static(DIST_DIR));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  const status = err.status || (err instanceof multer.MulterError ? 400 : 500);
  let message = err.message || '服务器错误';
  if (err instanceof multer.MulterError) {
    message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `文件大小超出限制（最大 ${Math.round(MAX_UPLOAD_SIZE / 1024 / 1024)}MB）`
        : '文件上传失败，请重试';
  }
  if (status >= 500) console.error(err);
  res.status(status).json({ error: message });
});

export function startServer(port = PORT) {
  archiveOldNotes();
  try {
    const summary = syncRenewals();
    if (summary.created) console.log(`✅ 已自动创建 ${summary.created} 个续约项目`);
  } catch (err) {
    console.error('续约项目同步失败：', err.message);
  }
  return app.listen(port, () => {
    console.log(`✅ SMB 销售工作台 API 已启动：http://localhost:${port}`);
    console.log(`   数据库文件：${process.env.SMB_DB_FILE || path.join(__dirname, 'data', 'smb.db')}`);
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) startServer();

export { app, syncRenewals, updateFollowUpsForProject };
