export default function Sidebar({ sections, active, onSelect, today, badges = {} }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="logo">💼</div>
        <div className="sidebar-brand-text">
          <div className="sidebar-title">SMB 销售工作台</div>
          <div className="sidebar-sub">Sales Workbench</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {sections.map((s) => {
          const count = badges[s.key];
          const showBadge = count != null && count > 0;
          return (
            <button
              key={s.key}
              type="button"
              className={`nav-item${active === s.key ? ' active' : ''}`}
              onClick={() => onSelect(s.key)}
              title={s.label}
            >
              <span className="nav-icon">{s.icon}</span>
              <span className="nav-label">{s.label}</span>
              {showBadge ? <span className="nav-badge">{count}</span> : null}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <div className="sidebar-foot-chip">
          <span className="sidebar-foot-ico">📅</span>
          <span>{today}</span>
        </div>
        <div className="sidebar-foot-note">数据存储于本地 SQLite</div>
      </div>
    </aside>
  );
}
