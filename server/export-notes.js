// 导出全部备注（现存 + 已归档）为 JSON，供周报 / 复盘使用。
// 用法：
//   npm run notes:export                       → 导出全部
//   npm run notes:export -- --customer=<id>    → 只导出某个客户（含其全部项目备注）
//   npm run notes:export -- --project=<id>     → 只导出某个项目
//   npm run notes:export -- --since=2026-11-01 → 只导出该日期之后（按 createdAt）
// 兼容旧调用：npm run notes:export -- <customerId>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVE_FILE = path.join(__dirname, 'data', 'archive', 'notes-archive.jsonl');
const OUT_DIR = path.join(__dirname, 'data', 'export');

const args = process.argv.slice(2);
const flag = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
};
const positional = args.find((a) => !a.startsWith('--'));

const customerId = flag('customer') || positional || '';
const projectId = flag('project');
const since = flag('since');

const live = db.prepare(`SELECT * FROM notes ORDER BY createdAt ASC`).all();
const archived = fs.existsSync(ARCHIVE_FILE)
  ? fs
      .readFileSync(ARCHIVE_FILE, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  : [];

// 归档与现存可能因「写盘成功但删库失败」而重复，按 id 去重；现存版本优先
const dedup = new Map();
for (const n of [...archived, ...live]) dedup.set(n.id, n);

// 备注的归属对象：项目备注看 projectId，客户级备注看 customerId
const projects = new Map(db.prepare(`SELECT id, name, customerId, status, category FROM projects`).all().map((p) => [p.id, p]));
const customers = new Map(db.prepare(`SELECT id, name FROM customers`).all().map((c) => [c.id, c]));

let all = [...dedup.values()]
  .map((n) => {
    const pid = n.projectId || '';
    const proj = pid ? projects.get(pid) : null;
    const ownerId = n.customerType === 'customer' ? n.customerId : proj?.customerId || n.customerId || '';
    return {
      ...n,
      projectId: pid,
      projectName: proj?.name || '',
      projectStatus: proj?.status || '',
      projectCategory: proj?.category || '',
      ownerCustomerId: ownerId,
      customerName: customers.get(ownerId)?.name || '',
    };
  })
  .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

if (customerId) {
  const targetName = customers.get(customerId)?.name;
  all = all.filter((n) => n.ownerCustomerId === customerId || (targetName && n.customerName === targetName));
}
if (projectId) all = all.filter((n) => n.projectId === projectId);
if (since) all = all.filter((n) => String(n.createdAt) >= since);

const scope = projectId ? `project-${projectId}` : customerId ? `customer-${customerId}` : 'all';
fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, `notes-${scope}-${new Date().toISOString().slice(0, 10)}.json`);
fs.writeFileSync(out, JSON.stringify(all, null, 2), 'utf8');

const levelCount = { project: 0, customer: 0 };
for (const n of all) levelCount[n.projectId ? 'project' : 'customer'] += 1;
console.log(
  `✅ 导出 ${all.length} 条备注（项目级 ${levelCount.project} / 客户级 ${levelCount.customer}；现存 ${live.length} 行 + 归档 ${archived.length} 行，已去重）→ ${out}`
);
