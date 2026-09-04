export default function Header({ today, title = 'SMB 销售工作台', icon = '💼', desc = '' }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="topbar-title">
          <span className="topbar-icon">{icon}</span>
          <span>{title}</span>
        </div>
        {desc ? <div className="topbar-desc">{desc}</div> : null}
      </div>
      <div className="topbar-right">
        <span className="today-chip">📅 {today}</span>
      </div>
    </header>
  );
}
