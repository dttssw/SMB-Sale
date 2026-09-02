import { useState } from 'react';
import Badge from './Badge.jsx';
import Pagination from './Pagination.jsx';
import { stageOf } from '../data/constants.js';
import { daysUntil, formatDate, todayStr } from '../utils/date.js';
import { formatMoney } from '../utils/format.js';

const PER_PAGE = 5;

function ProspectTable({ items, isRenew, today, onView }) {
  const [page, setPage] = useState(1);
  const sorted = [...items].sort((a, b) =>
    (a.nextFollowUp || '9999-12-31').localeCompare(b.nextFollowUp || '9999-12-31')
  );
  const cols = isRenew ? 5 : 5;

  const pages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const cur = Math.min(page, pages);
  const paged = sorted.slice((cur - 1) * PER_PAGE, cur * PER_PAGE);

  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>客户</th>
              {!isRenew && <th>阶段</th>}
              <th className="num">预估金额</th>
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
                  <td className="num">
                    {p.nextFollowUp ? formatDate(p.nextFollowUp) : '—'}
                    {next != null && next < 0 && <div className="cell-sub danger-text">逾期 {-next} 天</div>}
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

const VARIANTS = {
  new: {
    title: '正在跟进的新客户',
    tag: 'NEW',
    isRenew: false,
    desc: '按下一次跟进时间排序，逾期未跟进的客户优先处理',
    addLabel: '＋ 新增跟进',
  },
  renew: {
    title: '续约跟进',
    tag: 'RENEW',
    isRenew: true,
    desc: '临期在约自动带出，也可手动新建；续约完成后自动退出',
    addLabel: '＋ 新建续约',
  },
};

export default function ProspectList({ prospects, variant, onAdd, onView }) {
  const today = todayStr();
  const v = VARIANTS[variant] || VARIANTS.new;
  const items = prospects.filter((p) => (v.isRenew ? p.category === 'renew' : p.category !== 'renew'));
  const overdue = items.filter((p) => p.nextFollowUp && daysUntil(p.nextFollowUp) < 0).length;
  const dueToday = items.filter((p) => p.nextFollowUp === today).length;

  return (
    <section className={`follow-panel follow-${variant === 'renew' ? 'renew' : 'new'}`}>
      <header className="follow-head">
        <div className="follow-head-main">
          <div className="follow-title">
            <h2>{v.title}</h2>
            <span className="follow-tag">{v.tag}</span>
          </div>
          <span className="follow-count">{items.length} 家</span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={onAdd}>
          {v.addLabel}
        </button>
      </header>
      <p className="follow-desc">{v.desc}</p>
      <div className="stat-pills">
        <span className="pill pill-danger">逾期未跟进 {overdue}</span>
        <span className="pill pill-info">今日需跟进 {dueToday}</span>
      </div>
      <ProspectTable items={items} isRenew={v.isRenew} today={today} onView={onView} />
    </section>
  );
}
