import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.TZ = 'Asia/Shanghai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = process.env.SMB_DB_FILE ? path.resolve(process.env.SMB_DB_FILE) : path.join(DATA_DIR, 'smb.db');

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

export function toUtf8(name) {
  if (!name) return name;
  const decoded = Buffer.from(String(name), 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? String(name) : decoded;
}

export function normalizeCustomerName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}

const uid = () => Date.now().toString(36) + crypto.randomUUID().replace(/-/g, '').slice(0, 8);

function parseSkus(row) {
  const raw = row?.skus;
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list.filter(Boolean);
    } catch {
      if (raw.trim()) return [raw.trim()];
    }
  }
  return row?.plan ? [row.plan] : [];
}

export const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    contact   TEXT DEFAULT '',
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS partners (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    note      TEXT DEFAULT '',
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS projects (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    customerId     TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    partnerId      TEXT REFERENCES partners(id) ON DELETE SET NULL,
    category       TEXT,
    status         TEXT NOT NULL DEFAULT 'active',
    contact        TEXT DEFAULT '',
    expectedAmount REAL NOT NULL DEFAULT 0,
    contractAmount REAL,
    skus           TEXT NOT NULL DEFAULT '[]',
    lastFollowUp   TEXT,
    nextFollowUp   TEXT,
    startDate      TEXT,
    expiryDate     TEXT,
    sourceProjectId TEXT REFERENCES projects(id) ON DELETE SET NULL,
    lostAt         TEXT,
    watchedAt      TEXT,
    createdAt      TEXT NOT NULL DEFAULT (datetime('now')),
    closedAt       TEXT,
    CHECK (category IS NULL OR category IN ('new', 'renew')),
    CHECK (status IN ('active', 'watching', 'won', 'lost'))
  );

  CREATE TABLE IF NOT EXISTS deals (
    id         TEXT PRIMARY KEY,
    customer   TEXT NOT NULL,
    type       TEXT NOT NULL,
    amount     REAL NOT NULL,
    date       TEXT NOT NULL,
    createdAt  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS materials (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    storedName TEXT NOT NULL,
    mime       TEXT DEFAULT '',
    size       INTEGER NOT NULL,
    ext        TEXT DEFAULT '',
    note       TEXT DEFAULT '',
    createdAt  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notes (
    id           TEXT PRIMARY KEY,
    customerType TEXT NOT NULL,
    customerId   TEXT NOT NULL,
    content      TEXT NOT NULL,
    createdAt    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS worklogs (
    id        TEXT PRIMARY KEY,
    content   TEXT NOT NULL,
    date      TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS schema_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS _migration_map (
    sourceType TEXT NOT NULL,
    sourceId   TEXT NOT NULL,
    projectId  TEXT,
    customerId TEXT,
    PRIMARY KEY (sourceType, sourceId)
  );

  CREATE INDEX IF NOT EXISTS idx_notes_customer ON notes(customerType, customerId);
  CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customerId);
  CREATE INDEX IF NOT EXISTS idx_projects_partner ON projects(partnerId);
  CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
  CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);
  CREATE INDEX IF NOT EXISTS idx_projects_expiry ON projects(expiryDate);
  CREATE INDEX IF NOT EXISTS idx_projects_source ON projects(sourceProjectId);
`);

function columnsOf(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

function tableExists(table) {
  return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table);
}

function ensureColumn(table, name, definition) {
  if (!tableExists(table)) return;
  if (!columnsOf(table).includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}

ensureColumn('notes', 'projectId', 'TEXT');
ensureColumn('deals', 'projectId', 'TEXT');
ensureColumn('deals', 'customerId', 'TEXT');
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(projectId);
  CREATE INDEX IF NOT EXISTS idx_deals_project ON deals(projectId);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_project_unique
    ON deals(projectId) WHERE projectId IS NOT NULL AND projectId != '';
`);

function findOrCreateCustomer(name, contact = '') {
  const clean = normalizeCustomerName(name);
  if (!clean) throw new Error('客户名称不能为空');
  const existing = db.prepare(`SELECT * FROM customers WHERE name = ? ORDER BY createdAt ASC LIMIT 1`).get(clean);
  if (existing) {
    if (!existing.contact && contact) db.prepare(`UPDATE customers SET contact = ? WHERE id = ?`).run(contact, existing.id);
    return existing.id;
  }
  const id = uid();
  db.prepare(`INSERT INTO customers (id, name, contact) VALUES (?, ?, ?)`).run(id, clean, contact || '');
  return id;
}

function mergeDuplicateCustomers() {
  const rows = db.prepare(`SELECT id, name, contact, createdAt FROM customers ORDER BY createdAt ASC, id ASC`).all();
  const groups = new Map();
  for (const row of rows) {
    const key = normalizeCustomerName(row.name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  let merged = 0;
  for (const [name, list] of groups) {
    const keep = list[0];
    const contact = list.map((r) => r.contact).find(Boolean) || '';
    db.prepare(`UPDATE customers SET name = ?, contact = ? WHERE id = ?`).run(name, contact, keep.id);
    for (const dup of list.slice(1)) {
      db.prepare(`UPDATE notes SET customerId = ? WHERE customerType = 'customer' AND customerId = ?`).run(keep.id, dup.id);
      db.prepare(`UPDATE projects SET customerId = ? WHERE customerId = ?`).run(keep.id, dup.id);
      db.prepare(`UPDATE deals SET customerId = ? WHERE customerId = ?`).run(keep.id, dup.id);
      db.prepare(`UPDATE _migration_map SET customerId = ? WHERE customerId = ?`).run(keep.id, dup.id);
      db.prepare(`DELETE FROM customers WHERE id = ?`).run(dup.id);
      merged += 1;
    }
  }
  return merged;
}

mergeDuplicateCustomers();
try {
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_name ON customers(name)`);
} catch (err) {
  console.warn('⚠️ 客户名称唯一索引创建失败：', err.message);
}

function projectNameFor(customerName, category, status, expiryDate, sku) {
  const kind = status === 'won' ? '已签' : category === 'renew' ? '续约' : '新签';
  const tail = expiryDate ? ` ${String(expiryDate).slice(0, 7)}` : '';
  return `${customerName} · ${sku || 'GitLab'} · ${kind}${tail}`;
}

function mapLegacyId(sourceType, sourceId) {
  return db.prepare(`SELECT * FROM _migration_map WHERE sourceType = ? AND sourceId = ?`).get(sourceType, sourceId);
}

function insertMigratedProject({
  id,
  sourceType,
  sourceId,
  customerId,
  name,
  category,
  status,
  contact,
  expectedAmount,
  contractAmount,
  skus,
  lastFollowUp,
  nextFollowUp,
  startDate,
  expiryDate,
  sourceProjectId,
  lostAt,
  watchedAt,
  closedAt,
  createdAt,
}) {
  let projectId = id || uid();
  if (db.prepare(`SELECT 1 FROM projects WHERE id = ?`).get(projectId)) projectId = uid();
  db.prepare(`
    INSERT INTO projects (
      id, name, customerId, partnerId, category, status, contact,
      expectedAmount, contractAmount, skus, lastFollowUp, nextFollowUp,
      startDate, expiryDate, sourceProjectId, lostAt, watchedAt, createdAt, closedAt
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    projectId,
    name,
    customerId,
    category,
    status,
    contact || '',
    Number(expectedAmount) || 0,
    contractAmount == null || contractAmount === '' ? null : Number(contractAmount),
    JSON.stringify(skus || []),
    lastFollowUp || null,
    nextFollowUp || null,
    startDate || null,
    expiryDate || null,
    sourceProjectId || null,
    lostAt || null,
    watchedAt || null,
    createdAt || new Date().toISOString().slice(0, 19).replace('T', ' '),
    closedAt || null
  );
  db.prepare(`INSERT OR REPLACE INTO _migration_map (sourceType, sourceId, projectId, customerId) VALUES (?, ?, ?, ?)`).run(
    sourceType,
    sourceId,
    projectId,
    customerId
  );
  return projectId;
}

function migrateLegacyTables() {
  const hasContracts = tableExists('contracts');
  const hasProspects = tableExists('prospects');
  if (!hasContracts && !hasProspects) return { contracts: 0, prospects: 0 };

  let contracts = [];
  let prospects = [];
  if (hasContracts) {
    try {
      contracts = db.prepare(`SELECT * FROM contracts ORDER BY createdAt ASC, id ASC`).all();
    } catch (err) {
      console.warn('⚠️ 读取旧 contracts 失败，跳过该表：', err.message);
    }
  }
  if (hasProspects) {
    try {
      prospects = db.prepare(`SELECT * FROM prospects ORDER BY createdAt ASC, id ASC`).all();
    } catch (err) {
      console.warn('⚠️ 读取旧 prospects 失败，跳过该表：', err.message);
    }
  }

  for (const c of contracts) {
    if (mapLegacyId('contract', c.id)) continue;
    const customerId = c.customerId && db.prepare(`SELECT 1 FROM customers WHERE id = ?`).get(c.customerId)
      ? c.customerId
      : findOrCreateCustomer(c.name, c.contact);
    const skus = parseSkus(c);
    const wasLost = c.status === 'lost';
    const status = wasLost ? 'lost' : 'won';
    const category = wasLost ? 'renew' : null;
    insertMigratedProject({
      id: c.id,
      sourceType: 'contract',
      sourceId: c.id,
      customerId,
      name: projectNameFor(c.name, category, wasLost ? 'won' : status, c.expiryDate, skus[0]),
      category,
      status,
      contact: c.contact,
      expectedAmount: c.contractAmount,
      contractAmount: c.contractAmount,
      skus,
      startDate: c.startDate,
      expiryDate: c.expiryDate,
      lostAt: c.lostAt,
      closedAt: wasLost ? c.lostAt : null,
      createdAt: c.createdAt,
    });
  }

  for (const p of prospects) {
    if (mapLegacyId('prospect', p.id)) continue;
    const customerId = p.customerId && db.prepare(`SELECT 1 FROM customers WHERE id = ?`).get(p.customerId)
      ? p.customerId
      : findOrCreateCustomer(p.name, p.contact);
    const skus = parseSkus(p);
    const category = p.category === 'renew' ? 'renew' : 'new';
    const status = p.status === 'lost' ? 'lost' : p.status === 'watching' ? 'watching' : 'active';
    const source = p.contractId ? mapLegacyId('contract', p.contractId) : null;
    insertMigratedProject({
      id: p.id,
      sourceType: 'prospect',
      sourceId: p.id,
      customerId,
      name: projectNameFor(p.name, category, status, p.expiryDate, skus[0]),
      category,
      status,
      contact: p.contact,
      expectedAmount: p.expectedAmount,
      contractAmount: null,
      skus,
      lastFollowUp: p.lastFollowUp,
      nextFollowUp: p.nextFollowUp,
      expiryDate: p.expiryDate,
      sourceProjectId: source?.projectId,
      lostAt: p.lostAt,
      watchedAt: p.watchedAt,
      closedAt: status === 'lost' ? p.lostAt : null,
      createdAt: p.createdAt,
    });
  }

  if (hasContracts || hasProspects) {
    const roleNotes = db
      .prepare(`SELECT id, customerType, customerId FROM notes WHERE customerType IN ('contract', 'prospect')`)
      .all();
    for (const note of roleNotes) {
      const mapped = mapLegacyId(note.customerType, note.customerId);
      if (mapped?.customerId) {
        db.prepare(`UPDATE notes SET customerType = 'customer', customerId = ?, projectId = NULL WHERE id = ?`).run(
          mapped.customerId,
          note.id
        );
      }
    }
  }

  const deals = db.prepare(`SELECT id, customer, customerId FROM deals WHERE projectId IS NULL`).all();
  for (const deal of deals) {
    if (deal.customerId && db.prepare(`SELECT 1 FROM customers WHERE id = ?`).get(deal.customerId)) continue;
    const matches = db.prepare(`SELECT id FROM customers WHERE name = ?`).all(normalizeCustomerName(deal.customer));
    if (matches.length === 1) db.prepare(`UPDATE deals SET customerId = ? WHERE id = ?`).run(matches[0].id, deal.id);
  }

  for (const [source, target] of [
    ['contracts', 'legacy_contracts'],
    ['prospects', 'legacy_prospects'],
  ]) {
    if (!tableExists(source)) continue;
    if (!tableExists(target)) db.exec(`ALTER TABLE ${source} RENAME TO ${target}`);
  }

  return { contracts: contracts.length, prospects: prospects.length };
}

const migrated = db.prepare(`SELECT value FROM schema_meta WHERE key = 'projects_migrated_v1'`).get();
if (!migrated) {
  const run = db.transaction(() => {
    const summary = migrateLegacyTables();
    db.prepare(`INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('projects_migrated_v1', ?)`).run(
      JSON.stringify({ ...summary, at: new Date().toISOString() })
    );
    return summary;
  });
  const summary = run();
  if (summary.contracts || summary.prospects) {
    console.log(`✅ 已迁移旧业务数据：合同 ${summary.contracts} 条、跟进 ${summary.prospects} 条 → projects`);
  }
}
