import { useState } from 'react';
import Badge from './Badge.jsx';
import Pagination from './Pagination.jsx';
import { stageOf } from '../data/constants.js';
import { daysUntil, formatDate, todayStr } from '../utils/date.js';
import { formatMoney } from '../utils/format.js';

const PER_PAGE = 5;

function PanelHead({ title, desc, onAdd, addLabel }) {
  return (
    <div className="panel-head">
      <div>
        <h2>{title}</h2>
        <p className="panel-desc">{desc}</p>
      </div>
      {onAdd && (
        <button className="btn btn-primary" onClick={onAdd}>
          {addLabel || '＋ 新增跟进客户'}
        </button>
      )}
    </div>
  );
}

function ProspectTable({ items, isRenew, today, onView }) {
  const [page, setPage] = useState(1);
  const sorted = [...items].sort((a, b) =>
    (a.nextFollowUp || '9999-12-31').localeCompare(b.nextFollowUp || '9999-12-31')
  );
  const overdue = items.filter((p) => p.nextFollowUp && daysUntil(p.nextFollowUp) < 0).length;
  const dueToday = items.filter((p) => p.nextFollowUp === today).length;
  const cols = 6;

  const pages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const cur = Math.min(page, pages);
  const paged = sorted.slice((cur - 1) * PER_PAGE, cur * PER_PAGE);

  return (
    <>
      <div className="stat-pills">
        <span className="pill pill-danger">逾期未跟进 {overdue}</span>
        <span className="pill pill-info">今日需跟进 {dueToday}</span>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>客户名称</th>
              {!isRenew && <th>跟进阶段</th>}
              <th className="num">预计金额</th>
              <th className="num">上次跟进</th>
              <th className="num">下次跟进</th>
              {isRenew && <th className="num">续约到期</th>}
              <th className="ops">操作</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((p) => {
              const stage = stageOf(p.stage);
              const next = p.nextFollowUp ? daysUntil(p.nextFollowUp) : null;
              return (
                <tr key={p.id}>
                  <td>
                    <a className="link-name" onClick={() => onView(p)} title="查看客户详情">
                      {p.name}
                    </a>
                    <div className="cell-sub">{p.contact || '—'}</div>
                  </td>
                  {!isRenew && (
                    <td>
                      <Badge tone={stage.tone}>{stage.label}</Badge>
                    </td>
                  )}
                  <td className="num strong">{formatMoney(p.expectedAmount)}</td>
                  <td className="num">{formatDate(p.lastFollowUp)}</td>
                  <td className="num">
                    {p.nextFollowUp ? formatDate(p.nextFollowUp) : '—'}
                    {next != null && next < 0 && <div className="cell-sub danger-text">已逾期 {-next} 天</div>}
                    {next === 0 && <div className="cell-sub warn-text">今天跟进</div>}
                  </td>
                  {isRenew && <td className="num">{formatDate(p.expiryDate)}</td>}
                  <td className="ops">
                    <button className="link-btn" onClick={() => onView(p)}>
                      详情
                    </button>
                  </td>
                </tr>
              );
            })}
            {paged.length === 0 && (
              <tr>
                <td colSpan={cols} className="empty">
                  {isRenew ? '暂无续约跟进客户，点击右上角新建' : '暂无跟进中的新客户，点击右上角新增'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={cur} total={sorted.length} perPage={PER_PAGE} onChange={setPage} />
    </>
  );
}

export default function ProspectList({ prospects, onAdd, onAddRenew, onView }) {
  const today = todayStr();
  const newItems = prospects.filter((p) => p.category !== 'renew');
  const renewItems = prospects.filter((p) => p.category === 'renew');

  return (
    <div className="prospect-grid">
      <section className="panel">
        <PanelHead
          title="🚀 正在跟进的新客户（New）"
          desc="按下次跟进时间排序，逾期未跟进的客户优先处理"
          onAdd={onAdd}
        />
        <ProspectTable items={newItems} isRenew={false} today={today} onView={onView} />
      </section>
      <section className="panel">
        <PanelHead
          title="🔁 续约跟进（Renew）"
          desc="由到期少于45天的在约客户自动生成，也可手动新建；续约完成后自动退出"
          onAdd={onAddRenew}
          addLabel="＋ 新建 Renew 客户"
        />
        <ProspectTable items={renewItems} isRenew today={today} onView={onView} />
      </section>
    </div>
  );
}
