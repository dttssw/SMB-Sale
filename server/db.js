import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'smb.db');

// 自动创建数据目录（数据库文件首次启动时生成，不预置任何演示数据）
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS contracts (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    owner          TEXT NOT NULL,
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
    owner          TEXT NOT NULL,
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
`);
