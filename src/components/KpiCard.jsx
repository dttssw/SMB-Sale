export default function KpiCard({ label, value, unit, icon, tone, sub, valueClass }) {
  return (
    <div className={`kpi-card${tone ? ` tone-${tone}` : ''}`}>
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-info">
        <div className="kpi-label">{label}</div>
        <div className={`kpi-value${valueClass ? ` ${valueClass}` : ''}`}>
          {value}
          {unit ? <span className="kpi-unit">{unit}</span> : null}
        </div>
        {sub ? <div className="kpi-sub">{sub}</div> : null}
      </div>
    </div>
  );
}
