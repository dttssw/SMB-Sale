import Badge from './Badge.jsx';
import { stageOf } from '../data/constants.js';
import { daysUntil, formatDate, todayStr } from '../utils/date.js';
import { formatMoney } from '../utils/format.js';

export default function ProspectList({ prospects, onAdd, onEdit, onDelete }) {
  const today = todayStr();
  const sorted = [...prospects].sort((a, b) =>
    (a.nextFollowUp || '9999-12-31').localeCompare(b.nextFollowUp || '9999-12-31')
  );
  const overdue = prospects.filter((p) => p.nextFollowUp && daysUntil(p.nextFollowUp) < 0).length;
  const dueToday = prospects.filter((p) => p.nextFollowUp === today).length;

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>🚀 正在跟进中的新客户</h2>
          <p className="panel-desc">按下次跟进时间排序，逾期未跟进的客户优先处理</p>
        </div>
        <button className="btn btn-primary" onClick={onAdd}>
          ＋ 新增跟进客户
        </button>
      </div>
      <div className="stat-pills">
        <span className="pill pill-danger">逾期未跟进 {overdue}</span>
        <span className="pill pill-info">今日需跟进 {dueToday}</span>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>客户名称</th>
              <th>负责人</th>
              <th>跟进阶段</th>
              <th className="num">预计金额</th>
              <th className="num">上次跟进</th>
              <th className="num">下次跟进</th>
              <th className="ops">操作</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const stage = stageOf(p.stage);
              const next = p.nextFollowUp ? daysUntil(p.nextFollowUp) : null;
              return (
                <tr key={p.id}>
                  <td>
                    <div className="cell-main">{p.name}</div>
                    <div className="cell-sub">{p.contact || '—'}</div>
                  </td>
                  <td>
                    <span className="owner">{p.owner}</span>
                  </td>
                  <td>
                    <Badge tone={stage.tone}>{stage.label}</Badge>
                  </td>
                  <td className="num strong">{formatMoney(p.expectedAmount)}</td>
                  <td className="num">{formatDate(p.lastFollowUp)}</td>
                  <td className="num">
                    {p.nextFollowUp ? formatDate(p.nextFollowUp) : '—'}
                    {next != null && next < 0 && <div className="cell-sub danger-text">已逾期 {-next} 天</div>}
                    {next === 0 && <div className="cell-sub warn-text">今天跟进</div>}
                  </td>
                  <td className="ops">
                    <button className="link-btn" onClick={() => onEdit(p)}>
                      编辑
                    </button>
                    <button className="link-btn danger" onClick={() => onDelete(p.id)}>
                      删除
                    </button>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  暂无跟进中的新客户，点击右上角新增
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
