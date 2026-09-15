// 导出全部备注（现存 + 已归档）为 JSON，供周报 / 复盘使用。
// 用法：npm run notes:export                 → 导出全部
//      npm run notes:export -- <customerId>  → 只导出某个客户
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVE_FILE = path.join(__dirname, 'data', 'archive', 'notes-archive.jsonl');
const OUT_DIR = path.join(__dirname, 'data', 'export');

const cid = process.argv[2] || '';
const live = db.prepare(`SELECT * FROM notes ORDER BY createdAt ASC`).all();
const archived = fs.existsSync(ARCHIVE_FILE)
  ? fs.readFileSync(ARCHIVE_FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];

// 归档与现存可能因「写盘成功但删库失败」而重复，按 id 去重
const dedup = new Map();
for (const n of [...live, ...archived]) dedup.set(n.id, n);
let all = [...dedup.values()].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
if (cid) all = all.filter((n) => n.customerId === cid);

fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, `notes-${new Date().toISOString().slice(0, 10)}.json`);
fs.writeFileSync(out, JSON.stringify(all, null, 2), 'utf8');
console.log(`✅ 导出 ${all.length} 条备注（现存 ${live.length} 行 + 归档 ${archived.length} 行，已去重）→ ${out}`);
