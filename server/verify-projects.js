import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smb-project-verify-'));
const dbFile = path.join(dir, 'legacy.db');

const legacy = new Database(dbFile);
legacy.pragma('journal_mode = WAL');
legacy.exec(`
  CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, contact TEXT DEFAULT '', createdAt TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE partners (id TEXT PRIMARY KEY, name TEXT NOT NULL, note TEXT DEFAULT '', createdAt TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE contracts (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, plan TEXT NOT NULL, contact TEXT DEFAULT '',
    contractAmount REAL NOT NULL, startDate TEXT NOT NULL, expiryDate TEXT NOT NULL,
    note TEXT DEFAULT '', skus TEXT DEFAULT '[]', status TEXT DEFAULT 'active', lostAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')), customerId TEXT DEFAULT ''
  );
  CREATE TABLE prospects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, stage TEXT NOT NULL, contact TEXT DEFAULT '',
    expectedAmount REAL NOT NULL, lastFollowUp TEXT, nextFollowUp TEXT, category TEXT DEFAULT 'new',
    contractId TEXT DEFAULT '', expiryDate TEXT, plan TEXT DEFAULT '', skus TEXT DEFAULT '[]',
    status TEXT DEFAULT 'active', lostAt TEXT, watchedAt TEXT,
    note TEXT DEFAULT '', createdAt TEXT NOT NULL DEFAULT (datetime('now')), customerId TEXT DEFAULT ''
  );
  CREATE TABLE notes (
    id TEXT PRIMARY KEY, customerType TEXT NOT NULL, customerId TEXT NOT NULL,
    content TEXT NOT NULL, createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE deals (
    id TEXT PRIMARY KEY, customer TEXT NOT NULL, type TEXT NOT NULL,
    amount REAL NOT NULL, date TEXT NOT NULL, createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE worklogs (id TEXT PRIMARY KEY, content TEXT NOT NULL, date TEXT NOT NULL, createdAt TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE materials (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, storedName TEXT NOT NULL, mime TEXT DEFAULT '',
    size INTEGER NOT NULL, ext TEXT DEFAULT '', note TEXT DEFAULT '', createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
legacy.prepare(`INSERT INTO customers (id, name, contact) VALUES ('cust-old', '旧客户', '王总')`).run();
legacy.prepare(`INSERT INTO partners (id, name) VALUES ('partner-old', '旧合作伙伴')`).run();
legacy.prepare(`INSERT INTO contracts (id, name, plan, contact, contractAmount, startDate, expiryDate, skus, status, customerId) VALUES ('contract-won', '旧客户', '旗舰版', '王总', 100000, '2026-01-01', '2030-12-31', '["旗舰版"]', 'active', 'cust-old')`).run();
legacy.prepare(`INSERT INTO contracts (id, name, plan, contact, contractAmount, startDate, expiryDate, skus, status, customerId) VALUES ('contract-lost', '旧客户', '专业版', '王总', 50000, '2025-01-01', '2028-12-31', '["专业版"]', 'lost', 'cust-old')`).run();
legacy.prepare(`INSERT INTO prospects (id, name, stage, contact, expectedAmount, category, contractId, plan, skus, status, customerId) VALUES ('prospect-new', '旧客户', 'demo', '王总', 80000, 'new', '', '旗舰版', '["旗舰版"]', 'active', 'cust-old')`).run();
legacy.prepare(`INSERT INTO prospects (id, name, stage, contact, expectedAmount, category, contractId, plan, skus, status, customerId) VALUES ('prospect-renew', '旧客户', 'negotiation', '王总', 100000, 'renew', 'contract-won', '旗舰版', '["旗舰版"]', 'active', 'cust-old')`).run();
legacy.prepare(`INSERT INTO notes (id, customerType, customerId, content) VALUES ('note-legacy-role', 'prospect', 'prospect-new', '旧角色备注')`).run();
legacy.prepare(`INSERT INTO notes (id, customerType, customerId, content) VALUES ('note-legacy-customer', 'customer', 'cust-old', '旧客户备注')`).run();
legacy.prepare(`INSERT INTO deals (id, customer, type, amount, date) VALUES ('deal-legacy', '旧客户', 'new', 100000, '2026-01-01')`).run();
legacy.close();

process.env.SMB_DB_FILE = dbFile;
const dbModule = await import('./db.js');
const { db } = dbModule;
const { startServer } = await import('./index.js');

assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM projects`).get().c, 4);
assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE status = 'won'`).get().c, 1);
assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE status = 'lost'`).get().c, 1);
assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE status = 'active'`).get().c, 2);
assert.equal(
  db.prepare(`SELECT sourceProjectId FROM projects WHERE id = 'prospect-renew'`).get().sourceProjectId,
  'contract-won'
);
assert.equal(
  db.prepare(`SELECT customerType FROM notes WHERE id = 'note-legacy-role'`).get().customerType,
  'customer'
);
assert.equal(db.prepare(`SELECT projectId FROM notes WHERE id = 'note-legacy-role'`).get().projectId, null);
assert.equal(db.prepare(`SELECT customerId FROM deals WHERE id = 'deal-legacy'`).get().customerId, 'cust-old');

const server = startServer(0);
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

async function request(pathname, options = {}) {
  const res = await fetch(base + pathname, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}
const post = (pathname, body = {}) => request(pathname, { method: 'POST', body: JSON.stringify(body) });
const put = (pathname, body = {}) => request(pathname, { method: 'PUT', body: JSON.stringify(body) });
const del = (pathname) => request(pathname, { method: 'DELETE' });

const customer = await post('/customers', { id: 'cust-a', name: '多项目客户', contact: '李总' });
assert.equal(customer.status, 201);
const partner = await post('/partners', { id: 'partner-a', name: '合作伙伴 A' });
assert.equal(partner.status, 201);

const project1 = await post('/projects', {
  id: 'proj-1',
  name: '项目一',
  customerId: 'cust-a',
  partnerId: 'partner-a',
  category: 'new',
  expectedAmount: 120000,
  skus: ['旗舰版'],
  lastFollowUp: '2026-01-01',
  nextFollowUp: '2026-12-01',
});
assert.equal(project1.status, 201, JSON.stringify(project1.body));
const project2 = await post('/projects', {
  id: 'proj-2',
  name: '项目二',
  customerId: 'cust-a',
  partnerId: 'partner-a',
  category: 'new',
  expectedAmount: 80000,
  skus: ['专业版'],
  lastFollowUp: '2026-02-01',
  nextFollowUp: '2026-12-02',
});
assert.equal(project2.status, 201);

let projects = (await request(`/projects?customerId=cust-a`)).body;
assert.equal(projects.length, 2);
assert.equal(projects[0].customerName, '多项目客户');
assert.equal(projects[0].partnerName, '合作伙伴 A');

const won1 = await post('/projects/proj-1/win', {
  contractAmount: 125000,
  startDate: '2026-11-01',
  expiryDate: '2027-10-31',
  skus: ['旗舰版'],
});
assert.equal(won1.status, 200, JSON.stringify(won1.body));
assert.equal(won1.body.project.status, 'won');
const wonAgain = await post('/projects/proj-1/win', {
  contractAmount: 125000,
  startDate: '2026-11-01',
  expiryDate: '2027-10-31',
  skus: ['旗舰版'],
});
assert.equal(wonAgain.status, 200);
assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM deals WHERE projectId = 'proj-1'`).get().c, 1);
assert.equal((await request(`/projects?customerId=cust-a&status=active`)).body.length, 1);

const renewal = await post('/projects/proj-1/renew', { name: '项目一续约', expectedAmount: 125000 });
assert.equal(renewal.status, 201, JSON.stringify(renewal.body));
assert.equal(renewal.body.category, 'renew');
assert.equal(renewal.body.sourceProjectId, 'proj-1');
const duplicateRenewal = await post('/projects/proj-1/renew', {});
assert.equal(duplicateRenewal.status, 409);

const note = await post('/notes', {
  id: 'note-project-2',
  customerType: 'customer',
  customerId: 'cust-a',
  projectId: 'proj-2',
  content: '项目二今天完成方案演示',
});
assert.equal(note.status, 201);
const project2AfterNote = (await request('/projects/proj-2')).body;
assert.notEqual(project2AfterNote.lastFollowUp, '2026-02-01');
const project1AfterNote = (await request('/projects/proj-1')).body;
assert.equal(project1AfterNote.lastFollowUp, '2026-01-01');

const customerNote = await post('/notes', {
  id: 'note-customer-level',
  customerType: 'customer',
  customerId: 'cust-a',
  content: '客户级备注，不应改变项目跟进日',
});
assert.equal(customerNote.status, 201);
assert.equal((await request('/projects/proj-2')).body.lastFollowUp, project2AfterNote.lastFollowUp);
const aggregate = (await request('/notes?customerType=customer&customerId=cust-a')).body;
assert.ok(aggregate.some((row) => row.id === 'note-project-2' && row.projectName === '项目二'));

assert.equal((await post('/projects/proj-2/watch')).body.status, 'watching');
assert.equal((await request('/projects/proj-1')).body.status, 'won');
assert.equal((await post('/projects/proj-2/restore')).body.status, 'active');
assert.equal((await post('/projects/proj-2/lost')).body.status, 'lost');
assert.equal((await request('/projects/proj-1')).body.status, 'won');
assert.equal((await post('/projects/proj-2/restore')).body.status, 'active');

const customerList = (await request('/customers')).body;
const multi = customerList.find((row) => row.id === 'cust-a');
assert.equal(multi.activeProjectCount, 2);
assert.equal(multi.signedProjectCount, 1);

assert.equal((await del('/partners/partner-a')).status, 200);
assert.equal((await request('/projects/proj-2')).body.partnerId, null);
assert.equal((await del('/customers/cust-a')).status, 409);
assert.equal((await del('/projects/proj-1')).status, 409);

const sync1 = await post('/sync/renewals');
const sync2 = await post('/sync/renewals');
assert.equal(sync1.status, 200);
assert.equal(sync2.status, 200);
assert.equal(sync2.body.created, 0);
assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE sourceProjectId = 'proj-1'`).get().c, 1);

server.close();
db.close();

const child = spawnSync(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    `const m=await import('./db.js'); const rows=m.db.prepare(\"select name from sqlite_master where type='table'\").all().map(r=>r.name); console.log(JSON.stringify({tables:rows, projects:m.db.prepare('select count(*) c from projects').get().c, legacy:m.db.prepare(\"select count(*) c from sqlite_master where type='table' and name in ('contracts','prospects')\").get().c})); m.db.close();`,
  ],
  { cwd: path.join(process.cwd(), 'server'), env: { ...process.env, SMB_DB_FILE: dbFile }, encoding: 'utf8' }
);
assert.equal(child.status, 0, child.stderr);
const restart = JSON.parse(child.stdout.trim());
assert.equal(restart.projects, 7);
assert.equal(restart.legacy, 0);
assert.ok(restart.tables.includes('legacy_contracts'));
assert.ok(restart.tables.includes('legacy_prospects'));

console.log(
  JSON.stringify(
    {
      ok: true,
      migrated: { contracts: 2, prospects: 2, projects: 4 },
      api: {
        multiProject: true,
        isolatedWin: true,
        isolatedNotes: true,
        isolatedWatchLostRestore: true,
        idempotentWin: true,
        idempotentRenewalSync: true,
        partnerSetNull: true,
        protectedCustomerDelete: true,
      },
      restart,
      dbFile,
    },
    null,
    2
  )
);

fs.rmSync(dir, { recursive: true, force: true });
