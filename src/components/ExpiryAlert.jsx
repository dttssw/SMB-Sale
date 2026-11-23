import Badge from './Badge.jsx';
import Icon from './icons.jsx';
import { daysUntil, formatDate } from '../utils/date.js';
import { formatMoney } from '../utils/format.js';
import { skusOf } from '../utils/sku.js';
import { RENEW_WINDOW_DAYS } from '../data/constants.js';

function daysBadge(days) {
  if (days < 0) return { label: `已逾期 ${-days} 天`, tone: 'danger' };
  if (days === 0) return { label: '今天到期', tone: 'danger' };
  if (days <= 7) return { label: `${days} 天后到期`, tone: 'danger' };
  if (days <= 30) return { label: `${days} 天后到期`, tone: 'warn' };
  return { label: `${days} 天后到期`, tone: 'info' };
}

export default function ExpiryAlert({ projects, onView, onRenew }) {
  const signed = projects.filter((project) => project.status === 'won');
  const expiring = signed
    .map((project) => ({ ...project, days: daysUntil(project.expiryDate) }))
    .filter((project) => project.days != null && project.days <= RENEW_WINDOW_DAYS)
    .sort((a, b) => a.days - b.days);

  if (expiring.length === 0) {
    return (
      <section className="panel expiry-alert calm">
        <div className="expiry-alert-head">
          <span className="expiry-alert-icon">
            <Icon name="check" />
          </span>
          <div>
            <strong>已签项目状态稳定</strong>
            <span>
              共 {signed.length} 个已签项目，暂无 {RENEW_WINDOW_DAYS} 天内到期的续约风险
            </span>
          </div>
        </div>
      </section>
    );
  }

  const overdue = expiring.filter((project) => project.days < 0).length;
  return (
    <section className="panel expiry-alert">
      <div className="expiry-alert-head">
        <span className="expiry-alert-icon">
          <Icon name="bell" />
        </span>
        <div>
          <strong>已签项目即将到期，可以安排续约了</strong>
          <span>
            {expiring.length} 个项目将在 {RENEW_WINDOW_DAYS} 天内到期
            {overdue ? `，其中 ${overdue} 个已到期` : ''}
          </span>
        </div>
      </div>
      <div className="expiry-alert-list">
        {expiring.map((project) => {
          const badge = daysBadge(project.days);
          const skuText = skusOf(project).join(' / ') || '—';
          return (
            <div
              key={project.id}
              className="expiry-alert-item row-clickable"
              onClick={(e) => {
                if (e.target.closest('button, a, input, select, textarea, label')) return;
                onView(project);
              }}
            >
              <div className="expiry-alert-item-main">
                <button type="button" className="link-name" onClick={() => onView(project)}>
                  {project.name}
                </button>
                <div className="cell-sub">
                  {project.customerName} · {skuText} · {formatMoney(project.contractAmount)} · {formatDate(project.expiryDate)} 到期
                </div>
              </div>
              <Badge tone={badge.tone}>{badge.label}</Badge>
              <div className="expiry-alert-item-ops">
                <span className="row-chevron">
                  <Icon name="chevronRight" />
                </span>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => onRenew(project)}>
                  新建续约
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
