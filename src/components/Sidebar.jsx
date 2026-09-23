import Icon from './icons.jsx';

/**
 * 左侧导航：固定 240px（≤980px 收成 64px 图标条）。
 * 激活态＝--surface-2 底 + 左侧 2px 反白指示条，不再有渐变与光晕。
 */
export default function Sidebar({ sections, active, onSelect, badges = {} }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-mark">
          <Icon name="briefcase" size={20} />
        </span>
        <span className="sidebar-brand-text">
          <span className="sidebar-title">SMB 销售工作台</span>
          <span className="sidebar-sub">Sales Workbench</span>
        </span>
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
              aria-current={active === s.key ? 'page' : undefined}
            >
              <span className="nav-icon">
                <Icon name={s.icon} />
              </span>
              <span className="nav-label">{s.label}</span>
              {showBadge ? <span className="nav-badge">{count > 99 ? '99+' : count}</span> : null}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
