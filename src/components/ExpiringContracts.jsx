import Badge from './Badge.jsx';
import { daysUntil, formatDate } from '../utils/date.js';
import { formatMoney } from '../utils/format.js';

function statusOf(expiryDate) {
  const d = daysUntil(expiryDate);
  if (d < 0) return { label: `已逾期 ${-d} 天`, tone: 'danger' };
  if (d === 0) return { label: '今日到期', tone: 'danger' };
  if (d <= 30) return { label: `还剩 ${d} 天`, tone: 'warn' };
  if (d <= 90) return { label: '90天内到期', tone: 'info' };
  return { label: '正常在约', tone: 'ok' };
}

export default function ExpiringContracts({ contracts, onAdd, onView }) {
  const sorted = [...contracts].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  const overdue = sorted.filter((c) => daysUntil(c.expiryDate) < 0).length;
  const exp30 = sorted.filter((c) => {
    const d = daysUntil(c.expiryDate);
    return d >= 0 && d <= 30;
  }).length;
  const exp90 = sorted.filter((c) => {
    const d = daysUntil(c.expiryDate);
    return d > 30 && d <= 90;
  }).length;

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>📋 在约客户 · 到期时间</h2>
          <p className="panel-desc">按订阅到期日排序，优先触达即将到期的客户，确保续约不流失</p>
        </div>
        <button className="btn btn-primary" onClick={onAdd}>
          ＋ 新增在约客户
        </button>
      </div>
      <div className="stat-pills">
        <span className="pill pill-danger">已到期 {overdue}</span>
        <span className="pill pill-warn">30天内到期 {exp30}</span>
        <span className="pill pill-info">90天内到期 {exp90}</span>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>客户名称</th>
              <th>产品</th>
              <th className="num">合同金额</th>
              <th className="num">到期时间</th>
              <th>状态</th>
              <th className="ops">操作</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => {
              const st = statusOf(c.expiryDate);
              return (
                <tr key={c.id}>
                  <td>
                    <a className="link-name" onClick={() => onView(c)} title="查看客户详情">
                      {c.name}
                    </a>
                    <div className="cell-sub">{c.contact || '—'}</div>
                  </td>
                  <td>
                    <span className="plan-tag">{c.plan}</span>
                  </td>
                  <td className="num strong">{formatMoney(c.contractAmount)}</td>
                  <td className="num">{formatDate(c.expiryDate)}</td>
                  <td>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </td>
                  <td className="ops">
                    <button className="link-btn" onClick={() => onView(c)}>
                      详情
                    </button>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  暂无在约客户，点击右上角新增
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
