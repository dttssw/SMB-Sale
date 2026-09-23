import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 统一使用中国时区（UTC+8）：SQLite datetime('now') 存的是 UTC，备注的 [HH:MM] 标记与“今天”判断
// 都依赖服务器进程时区。这里无条件强制 +08:00（即使部署环境 TZ=UTC 也会覆盖），
// 避免备注时间比本地慢/快数小时，并保证与前端浏览器（中国时区）显示一致。
process.env.TZ = 'Asia/Shanghai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'smb.db');

/**
 * multer/busboy 解析 multipart 时，文件原始文件名默认按 latin1 解码，
 * 中文等非 ASCII 文件名会变成乱码（如「产品报价.pdf」→「äº§åä¼°ä»·.pdf」）。
 * 这里按 latin1 → UTF-8 重新解码还原；若重解码出现替换符，说明原名本身就是合法 UTF-8，则原样保留。
 */
export function toUtf8(name) {
  if (!name) return name;
  const decoded = Buffer.from(String(name), 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? String(name) : decoded;
}

/**
 * 客户名称规范化：客户主档以「名称」作为同一家公司的唯一身份标识，
 * 因此统一去掉首尾空白、把连续空白折叠为一个空格
 * （避免「阿里巴巴科技 」「阿里巴巴科技」或「阿里 巴巴」被当成不同客户）。
 * 所有写入 customers.name 的地方都必须先经过这里。
 */
export function normalizeCustomerName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}

// 自动创建数据目录（数据库文件首次启动时生成，不预置任何演示数据）
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS contracts (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    plan           TEXT NOT NULL,
    contact        TEXT DEFAULT '',
    contractAmount REAL NOT NULL,
    startDate      TEXT NOT NULL,
    expiryDate     TEXT NOT NULL,
    note           TEXT DEFAULT '',
    createdAt      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS prospects (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    stage          TEXT NOT NULL,
    contact        TEXT DEFAULT '',
    expectedAmount REAL NOT NULL,
    lastFollowUp   TEXT,
    nextFollowUp   TEXT,
    category       TEXT DEFAULT 'new',   -- 'new' | 'renew'
    contractId     TEXT DEFAULT '',      -- renew 跟进所关联的在约客户 id
    expiryDate     TEXT,                 -- renew 跟进对应的在约到期时间（冗余，便于展示）
    plan           TEXT DEFAULT '',      -- renew 跟进的产品（与在约记录同步，用于自动补建在约）
    note           TEXT DEFAULT '',
    createdAt      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS deals (
    id        TEXT PRIMARY KEY,
    customer  TEXT NOT NULL,
    type      TEXT NOT NULL,
    amount    REAL NOT NULL,
    date      TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS partners (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    contact   TEXT DEFAULT '',
    note      TEXT DEFAULT '',
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS materials (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,      -- 原始文件名
    storedName TEXT NOT NULL,      -- 服务器存储文件名（随机生成，唯一）
    mime       TEXT DEFAULT '',    -- MIME 类型
    size       INTEGER NOT NULL,   -- 文件大小（字节）
    ext        TEXT DEFAULT '',    -- 小写扩展名
    note       TEXT DEFAULT '',    -- 备注
    createdAt  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notes (
    id           TEXT PRIMARY KEY,
    customerType TEXT NOT NULL,      -- 'contract' | 'prospect' | 'partner'
    customerId   TEXT NOT NULL,      -- 关联客户 id
    content      TEXT NOT NULL,      -- 备注内容
    createdAt    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_notes_customer ON notes(customerType, customerId);

  CREATE TABLE IF NOT EXISTS worklogs (
    id        TEXT PRIMARY KEY,
    content   TEXT NOT NULL,      -- 当天的工作内容 / 记录
    date      TEXT NOT NULL,      -- 归属日期 YYYY-MM-DD（默认当天）
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 客户主档：同一家公司在「跟进 / 在约」板块共享同一条记录，杜绝复制粘贴
  CREATE TABLE IF NOT EXISTS customers (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,      -- 客户名称（统一主档，同一家公司一份）
    contact   TEXT DEFAULT '',    -- 联系人（统一主档）
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// 迁移：移除旧版本遗留的「负责人」（owner）字段（SQLite >= 3.35 支持 DROP COLUMN，幂等）
for (const table of ['contracts', 'prospects']) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.some((c) => c.name === 'owner')) {
    db.exec(`ALTER TABLE ${table} DROP COLUMN owner`);
    console.log(`✅ 已从 ${table} 表移除遗留字段 owner`);
  }
}

// 迁移：修复材料库历史乱码文件名 / 备注（旧版本 multipart 文件名按 latin1 解码导致）
const materials = db.prepare(`SELECT id, name, note FROM materials`).all();
let repaired = 0;
for (const row of materials) {
  const name = toUtf8(row.name);
  const note = toUtf8(row.note || '');
  if (name !== row.name || note !== (row.note || '')) {
    db.prepare(`UPDATE materials SET name = ?, note = ? WHERE id = ?`).run(name, note, row.id);
    repaired++;
  }
}
if (repaired > 0) {
  console.log(`✅ 已修复 ${repaired} 条材料库乱码文件名/备注`);
}

// 迁移：把旧版「单条备注」迁移到 notes 备注时间线表（按客户去重，幂等）
const migrateNotes = (customerType, table) => {
  const rows = db.prepare(`SELECT id, note FROM ${table} WHERE note IS NOT NULL AND note != ''`).all();
  let moved = 0;
  for (const r of rows) {
    const exists = db.prepare(`SELECT 1 FROM notes WHERE customerType = ? AND customerId = ?`).get(customerType, r.id);
    if (!exists) {
      db.prepare(`INSERT INTO notes (id, customerType, customerId, content) VALUES (?, ?, ?, ?)`).run(
        crypto.randomUUID(),
        customerType,
        r.id,
        r.note
      );
      moved++;
    }
  }
  if (moved > 0) console.log(`✅ 已将 ${moved} 条 ${table} 备注迁移到备注时间线`);
};
migrateNotes('contract', 'contracts');
migrateNotes('prospect', 'prospects');
migrateNotes('partner', 'partners');

// 迁移：跟进客户增加 New/Renew 分类与续约关联字段（现有客户默认均为 New，幂等）
const prospectCols = db.prepare(`PRAGMA table_info(prospects)`).all().map((c) => c.name);
if (!prospectCols.includes('category')) db.exec(`ALTER TABLE prospects ADD COLUMN category TEXT DEFAULT 'new'`);
if (!prospectCols.includes('contractId')) db.exec(`ALTER TABLE prospects ADD COLUMN contractId TEXT DEFAULT ''`);
if (!prospectCols.includes('expiryDate')) db.exec(`ALTER TABLE prospects ADD COLUMN expiryDate TEXT`);
// 迁移：续约跟进角色记录产品。不在约的续约客户会被自动补建在约记录，产品即取自这里（幂等）
if (!prospectCols.includes('plan')) db.exec(`ALTER TABLE prospects ADD COLUMN plan TEXT DEFAULT ''`);

// 迁移：把「同日合并」的历史备注拆分成独立备注，让每条备注都能单独编辑 / 删除（与「今日工作记录」一致）。
// 旧版本会把同一天（本地时区）的多条备注合并成一条，以 [HH:MM] 作为时间标记；新版本取消合并、每条备注独立成行，
// 因此这里把存量合并行拆开，并把 [HH:MM] 标记还原为该条备注的真实时间（写入 createdAt），实现幂等。
export function splitMergedNotes(database = db) {
  const rows = database
    .prepare(`SELECT id, customerType, customerId, content, createdAt FROM notes ORDER BY createdAt ASC`)
    .all();
  const MARKER = /^\[(\d{1,2}):(\d{2})\]\s*(.*)$/;
  let changed = 0;
  for (const r of rows) {
    const lines = String(r.content || '').split('\n');
    const entries = [];
    let cur = null;
    for (const line of lines) {
      const m = line.match(MARKER);
      if (m) {
        cur = { text: m[3].trim(), h: +m[1], mi: +m[2] };
        entries.push(cur);
      } else if (cur) {
        // 无时间标记的行视为上一条备注的续行，归并到该条里
        cur.text = (cur.text ? cur.text + '\n' : '') + line;
      } else {
        cur = { text: line, h: null, mi: null };
        entries.push(cur);
      }
    }
    if (!entries.length || entries.every((e) => e.h == null)) continue; // 无时间标记的原始备注，保持不变

    // 以原备注的本地日期为基准，结合 [HH:MM] 还原各条的真实时间
    const base = new Date(String(r.createdAt).replace(' ', 'T') + 'Z');
    if (Number.isNaN(base.getTime())) continue;
    const y = base.getFullYear();
    const mo = base.getMonth();
    const da = base.getDate();
    const rowsNew = entries.map((e) => {
      let ts = r.createdAt;
      if (e.h != null) ts = new Date(y, mo, da, e.h, e.mi, 0, 0).toISOString().slice(0, 19).replace('T', ' ');
      return { id: crypto.randomUUID(), customerType: r.customerType, customerId: r.customerId, content: e.text, createdAt: ts };
    });
    // 单条且无改动则跳过，避免每次启动都改写
    if (rowsNew.length === 1 && rowsNew[0].content === r.content && rowsNew[0].createdAt === r.createdAt) continue;

    database.transaction(() => {
      database.prepare(`DELETE FROM notes WHERE id = ?`).run(r.id);
      const ins = database.prepare(`INSERT INTO notes (id, customerType, customerId, content, createdAt) VALUES (?, ?, ?, ?, ?)`);
      for (const nr of rowsNew) ins.run(nr.id, nr.customerType, nr.customerId, nr.content, nr.createdAt);
    })();
    changed += rowsNew.length;
  }
  if (changed > 0) console.log(`✅ 已将 ${changed} 条「同日合并」备注拆分为独立备注`);
  return changed;
}
splitMergedNotes();

// 迁移：建立「客户主档」统一档案，让同一家公司在「跟进 / 在约」板块共享同一份资料与备注。
//  - contracts / prospects 通过 customerId 指向 customers（同一家公司的唯一身份）
//  - 备注统一存放到 customerType='customer' 下，按 customerId 汇聚成同一条时间线
//  - 合作伙伴（partners）保持独立档案，不与客户主档关联
const contractColsForCust = db.prepare(`PRAGMA table_info(contracts)`).all().map((c) => c.name);
if (!contractColsForCust.includes('customerId')) db.exec(`ALTER TABLE contracts ADD COLUMN customerId TEXT DEFAULT ''`);
const prospectColsForCust = db.prepare(`PRAGMA table_info(prospects)`).all().map((c) => c.name);
if (!prospectColsForCust.includes('customerId')) db.exec(`ALTER TABLE prospects ADD COLUMN customerId TEXT DEFAULT ''`);

// 客户名唯一：已有同名主档时复用它，只有确实没有同名客户才新建（不再按行各建一条）
const ensureCustomerId = (name, contact) => {
  const clean = normalizeCustomerName(name);
  const exist = db.prepare(`SELECT id FROM customers WHERE name = ? ORDER BY createdAt ASC LIMIT 1`).get(clean);
  if (exist) return exist.id;
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  db.prepare(`INSERT INTO customers (id, name, contact) VALUES (?, ?, ?)`).run(id, clean, contact || '');
  return id;
};

db.transaction(() => {
  // 1) 为没有（或指向已丢失主档的）在约 / 跟进客户补建客户主档并回填 customerId
  const contracts = db.prepare(`SELECT * FROM contracts`).all();
  for (const c of contracts) {
    let cid = c.customerId;
    if (!cid || !db.prepare(`SELECT 1 FROM customers WHERE id = ?`).get(cid)) {
      cid = ensureCustomerId(c.name, c.contact);
      db.prepare(`UPDATE contracts SET customerId = ? WHERE id = ?`).run(cid, c.id);
    }
  }
  const prospects = db.prepare(`SELECT * FROM prospects`).all();
  for (const p of prospects) {
    let cid;
    // 续约跟进（contractId 关联在约客户）→ 与在约客户共用同一个客户主档
    if (p.contractId) {
      const c = db.prepare(`SELECT customerId FROM contracts WHERE id = ?`).get(p.contractId);
      cid = c && c.customerId;
    }
    if (!cid && p.customerId && db.prepare(`SELECT 1 FROM customers WHERE id = ?`).get(p.customerId)) cid = p.customerId;
    if (!cid) cid = ensureCustomerId(p.name, p.contact);
    db.prepare(`UPDATE prospects SET customerId = ? WHERE id = ?`).run(cid, p.id);
  }

  // 2) 以在约客户为准，统一客户主档名称 / 联系人，并同步镜像到所有同 customerId 的角色行
  for (const c of contracts) {
    if (!c.customerId) continue;
    // 客户名唯一：该名称若已被别的客户主档占用则保持原样（避免撞上唯一索引 / 唯一性约束），其余字段照常镜像
    const clash = db.prepare(`SELECT 1 FROM customers WHERE name = ? AND id != ?`).get(c.name, c.customerId);
    if (!clash) db.prepare(`UPDATE customers SET name = ?, contact = ? WHERE id = ?`).run(c.name, c.contact || '', c.customerId);
    db.prepare(`UPDATE contracts SET name = ?, contact = ? WHERE customerId = ?`).run(c.name, c.contact || '', c.customerId);
    db.prepare(`UPDATE prospects SET name = ?, contact = ? WHERE customerId = ?`).run(c.name, c.contact || '', c.customerId);
  }

  // 3) 备注迁移：跟进 / 在约 的备注统一挂到客户主档（customerType='customer'），汇聚为同一条时间线
  const contractNotes = db
    .prepare(`SELECT n.id, c.customerId FROM notes n JOIN contracts c ON n.customerId = c.id WHERE n.customerType = 'contract'`)
    .all();
  for (const n of contractNotes) {
    db.prepare(`UPDATE notes SET customerType = 'customer', customerId = ? WHERE id = ?`).run(n.customerId, n.id);
  }
  const prospectNotes = db
    .prepare(`SELECT n.id, p.customerId FROM notes n JOIN prospects p ON n.customerId = p.id WHERE n.customerType = 'prospect'`)
    .all();
  for (const n of prospectNotes) {
    db.prepare(`UPDATE notes SET customerType = 'customer', customerId = ? WHERE id = ?`).run(n.customerId, n.id);
  }

  // 4) 备注已进入时间线，清空源行的 note 字段，避免 migrateNotes 下次启动重复迁移
  db.prepare(`UPDATE contracts SET note = '' WHERE customerId != '' AND note != ''`).run();
  db.prepare(`UPDATE prospects SET note = '' WHERE customerId != '' AND note != ''`).run();
})();

// 迁移：客户名称唯一化 —— 同一名称 = 同一家公司，同名只允许一条客户主档。
// 历史库里重复录入（新增跟进 / 新建续约时各建一条主档）或改名撞名都会产生同名主档，
// 这里一次性收口：
//  1) 名称规范化（去首尾空白、折叠连续空白），避免「阿里巴巴 」「阿里巴巴」被当成两家公司
//  2) 同名主档合并：contracts / prospects 的 customerId、主档备注（customerType='customer'）统一指向保留的那条，其余删除
//  3) 建立 customers.name 唯一索引，从数据库层面兜住后续重复写入
export function mergeDuplicateCustomers(database = db) {
  const rows = database.prepare(`SELECT id, name, contact, createdAt FROM customers ORDER BY createdAt ASC, id ASC`).all();
  if (!rows.length) return 0;

  const groups = new Map();
  for (const r of rows) {
    const key = normalizeCustomerName(r.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  // 该主档是否已挂在在约 / 跟进角色上（优先保留有角色引用的那条，改动最少）
  const rolesOf = database.prepare(
    `SELECT (SELECT COUNT(*) FROM contracts WHERE customerId = ?) + (SELECT COUNT(*) FROM prospects WHERE customerId = ?) AS c`
  );

  let merged = 0;
  database.transaction(() => {
    for (const [name, list] of groups) {
      const keep = list.find((r) => rolesOf.get(r.id, r.id).c > 0) || list[0];
      for (const dup of list) {
        if (dup.id === keep.id) continue;
        database.prepare(`UPDATE contracts SET customerId = ? WHERE customerId = ?`).run(keep.id, dup.id);
        database.prepare(`UPDATE prospects SET customerId = ? WHERE customerId = ?`).run(keep.id, dup.id);
        database.prepare(`UPDATE notes SET customerId = ? WHERE customerType = 'customer' AND customerId = ?`).run(keep.id, dup.id);
        database.prepare(`DELETE FROM customers WHERE id = ?`).run(dup.id);
        merged += 1;
      }
      // 名称 / 联系人收口：名称统一为规范形态，联系人保留第一个非空值
      const contact = keep.contact || list.map((r) => r.contact).find((v) => v) || '';
      if (name !== keep.name || contact !== (keep.contact || '')) {
        database.prepare(`UPDATE customers SET name = ?, contact = ? WHERE id = ?`).run(name, contact, keep.id);
      }
    }
  })();

  if (merged > 0) console.log(`✅ 已合并 ${merged} 条同名客户主档（客户名唯一）`);
  return merged;
}

mergeDuplicateCustomers();

// 唯一索引：客户名称在数据库层面不可重复（上面的合并已保证存量数据无同名，正常不会失败）
try {
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_name ON customers(name)`);
} catch (err) {
  console.warn('⚠️ 客户名称唯一索引创建失败（仍存在同名客户主档）：', err.message);
}

