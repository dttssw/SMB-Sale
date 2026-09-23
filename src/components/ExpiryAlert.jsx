import Badge from './Badge.jsx';
import Icon from './icons.jsx';
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

/**
 * 临期在约提醒：标准面板 + 左侧 3px 状态竖条表达告警级别，
 * 不再用渐变底 / emoji 图标；状态色只落在 Badge 的 6px 圆点上。
 */
export default function ExpiryAlert({ contracts, onView, onRenew }) {
  const expiring = contracts
    .map((c) => ({ ...c, days: daysUntil(c.expiryDate) }))
    .filter((c) => c.days != null && c.days <= RENEW_WINDOW_DAYS)
    .sort((a, b) => a.days - b.days);

  if (expiring.length === 0) {
    return (
      <section className="panel expiry-alert calm">
        <div className="expiry-alert-head">
          <span className="expiry-alert-icon">
            <Icon name="check" />
          </span>
          <div>
            <strong>在约客户状态稳定</strong>
            <span>
              共 {contracts.length} 家，暂无 {RENEW_WINDOW_DAYS} 天内到期的临期风险，无需额外操心
            </span>
          </div>
        </div>
      </section>
    );
  }

  const overdue = expiring.filter((c) => c.days < 0).length;

  // 整行可点：点在「续约」按钮等交互控件上、或刚拖选过文字时不触发
  const handleRowClick = (e, row) => {
    if (e.target.closest('button, a, input, select, textarea, label')) return;
    if (window.getSelection()?.toString()) return;
    onView(row);
  };

  return (
    <section className="panel expiry-alert">
      <div className="expiry-alert-head">
        <span className="expiry-alert-icon">
          <Icon name="bell" />
        </span>
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
            <div key={c.id} className="expiry-alert-item row-clickable" onClick={(e) => handleRowClick(e, c)}>
              <div className="expiry-alert-item-main">
                <button type="button" className="link-name" onClick={() => onView(c)} title={`${c.name} · 查看客户详情`}>
                  {c.name}
                </button>
                <div className="cell-sub">
                  {c.plan} · {formatMoney(c.contractAmount)} · {formatDate(c.expiryDate)} 到期
                </div>
              </div>
              <Badge tone={b.tone}>{b.label}</Badge>
              <div className="expiry-alert-item-ops">
                <span className="row-chevron">
                  <Icon name="chevronRight" />
                </span>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => onRenew(c)}>
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
