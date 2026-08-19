import Database from 'better-sqlite3';
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
