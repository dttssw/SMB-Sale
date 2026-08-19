export default function Header({ today }) {
  return (
    <header className="header">
      <div className="header-left">
        <div className="logo">💼</div>
        <div>
          <h1>SMB 销售工作台</h1>
          <div className="subtitle">在约到期 · 新客跟进 · 金额看板 · 材料库</div>
        </div>
      </div>
      <div className="header-right">
        <span className="today-chip">📅 {today}</span>
      </div>
    </header>
  );
}
