import Badge from './Badge.jsx';
import { daysUntil, formatDate } from '../utils/date.js';
import { formatMoney } from '../utils/format.js';
import { RENEW_WINDOW_DAYS } from '../data/constants.js';

function daysBadge(d) {
  if (d < 0) return { label: `已逾期 ${-d} 天`, tone: 'danger' };
  if (d === 0) return { label: '今天到期', tone: 'danger' };
  if (d <= 7) return { label: `${d} 天后到期`, tone: 'danger' };
  if (d <= 30) return { label: `${d} 天后到期`, tone: 'warn' };
  return { label: `${d} 天后到期`, tone: 'info' };
}

export default function ExpiryAlert({ contracts, onView, onRenew }) {
  const expiring = contracts
    .map((c) => ({ ...c, days: daysUntil(c.expiryDate) }))
    .filter((c) => c.days != null && c.days <= RENEW_WINDOW_DAYS)
    .sort((a, b) => a.days - b.days);

  if (expiring.length === 0) {
    return (
      <div className="expiry-alert calm">
        <div className="expiry-alert-icon">✅</div>
        <div className="expiry-alert-body">
          <strong>在约客户状态稳定</strong>
          <span>共 {contracts.length} 家，暂无 {RENEW_WINDOW_DAYS} 天内到期的临期风险，无需额外操心</span>
        </div>
      </div>
    );
  }

  const overdue = expiring.filter((c) => c.days < 0).length;

  return (
    <section className="expiry-alert">
      <div className="expiry-alert-head">
        <div className="expiry-alert-icon">🔔</div>
        <div>
          <strong>在约客户即将到期，快去跟进续约</strong>
          <span>
            {expiring.length} 家将在 {RENEW_WINDOW_DAYS} 天内到期{overdue ? `，其中 ${overdue} 家已逾期` : ''}，建议优先处理
          </span>
        </div>
      </div>
      <div className="expiry-alert-list">
        {expiring.map((c) => {
          const b = daysBadge(c.days);
          return (
            <div key={c.id} className="expiry-alert-item">
              <div className="expiry-alert-item-main">
                <a className="link-name" onClick={() => onView(c)} title="查看客户详情">
                  {c.name}
                </a>
                <div className="cell-sub">
                  {c.plan} · {formatMoney(c.contractAmount)} · {formatDate(c.expiryDate)} 到期
                </div>
              </div>
              <Badge tone={b.tone}>{b.label}</Badge>
              <div className="expiry-alert-item-ops">
                <button className="link-btn" onClick={() => onView(c)}>
                  查看
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => onRenew(c)}>
                  续约
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
