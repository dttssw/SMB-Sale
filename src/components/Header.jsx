export default function Header({ today, onReset }) {
  return (
    <header className="header">
      <div className="header-left">
        <div className="logo">💼</div>
        <div>
          <h1>SMB 销售工作台</h1>
          <div className="subtitle">在约到期 · 新客跟进 · 金额看板</div>
        </div>
      </div>
      <div className="header-right">
        <span className="today-chip">📅 {today}</span>
        {onReset && (
          <button className="btn btn-ghost" onClick={onReset}>
            重置演示数据
          </button>
        )}
      </div>
    </header>
  );
}
