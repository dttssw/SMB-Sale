import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    customerType TEXT NOT NULL,      -- 'contract' | 'prospect'
    customerId   TEXT NOT NULL,      -- 关联客户 id
    content      TEXT NOT NULL,      -- 备注内容
    createdAt    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_notes_customer ON notes(customerType, customerId);
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

// 迁移：跟进客户增加 New/Renew 分类与续约关联字段（现有客户默认均为 New，幂等）
const prospectCols = db.prepare(`PRAGMA table_info(prospects)`).all().map((c) => c.name);
if (!prospectCols.includes('category')) db.exec(`ALTER TABLE prospects ADD COLUMN category TEXT DEFAULT 'new'`);
if (!prospectCols.includes('contractId')) db.exec(`ALTER TABLE prospects ADD COLUMN contractId TEXT DEFAULT ''`);
if (!prospectCols.includes('expiryDate')) db.exec(`ALTER TABLE prospects ADD COLUMN expiryDate TEXT`);

// 迁移：把「同一天（本地时区）内」的多条备注合并为一条，以 [HH:MM] 作为时间标记（幂等）
// 说明：POST /api/notes 只在「新增备注」且「当天」时自动合并；历史已存在的同日多条备注
// 不会被合并。此迁移在每次服务启动时对存量补做一次归并，让任意环境都能用统一的时间线格式。
export function mergeNotesByDay(database = db) {
  const pad = (n) => String(n).padStart(2, '0');
  const localDateOf = (createdAt) => new Date(String(createdAt).replace(' ', 'T') + 'Z');
  const dayKey = (d) =>
    Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // 按 createdAt 升序取，保证组内保持时间顺序；保留组内最早一条作为合并载体（createdAt 自然成为当天节点）
  const rows = database.prepare(`SELECT id, customerType, customerId, content, createdAt FROM notes ORDER BY createdAt ASC`).all();
  const groups = new Map();
  for (const r of rows) {
    const day = dayKey(localDateOf(r.createdAt));
    if (!day) continue;
    const key = `${r.customerType}|${r.customerId}|${day}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  let mergedCount = 0;
  for (const arr of groups.values()) {
    if (arr.length <= 1) continue; // 单条无需合并，保留原样
    const keep = arr[0];
    const lines = arr.map((r) => {
      const d = localDateOf(r.createdAt);
      const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      const text = String(r.content || '').trim();
      // 新逻辑生成的备注已带 [HH:MM] 标记，原样保留，避免重复标注
      const body = /^\[\d{1,2}:\d{2}\]\s/.test(text) ? text : `[${hm}] ${text}`;
      return body;
    });
    database.prepare(`UPDATE notes SET content = ? WHERE id = ?`).run(lines.join('\n'), keep.id);
    for (const r of arr.slice(1)) database.prepare(`DELETE FROM notes WHERE id = ?`).run(r.id);
    mergedCount += arr.length - 1;
  }
  if (mergedCount > 0) console.log(`✅ 已合并 ${mergedCount} 条同日历史备注（按 [HH:MM] 标准归并为一条）`);
  return mergedCount;
}
mergeNotesByDay();

