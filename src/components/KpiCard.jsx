import Icon from './icons.jsx';

/** KPI 卡：20px 线性图标 + 28px 数值；状态色只出现在标签旁的 6px 圆点上 */
export default function KpiCard({ label, value, unit, icon, tone, sub, money }) {
  return (
    <div className={`kpi-card${tone ? ` tone-${tone}` : ''}`}>
      <span className="kpi-icon">
        <Icon name={icon} size={20} />
      </span>
      <div className="kpi-info">
        <div className="kpi-label">
          <span>{label}</span>
          {tone ? <span className="kpi-dot" /> : null}
        </div>
        <div className={`kpi-value${money ? ' money' : ''}`}>
          {value}
          {unit ? <span className="kpi-unit">{unit}</span> : null}
        </div>
        {sub ? <div className="kpi-sub">{sub}</div> : null}
      </div>
    </div>
  );
}
