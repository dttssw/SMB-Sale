export default function Header({ today }) {
  return (
    <header className="header">
      <div className="header-left">
        <div className="logo">💼</div>
        <div>
          <h1>SMB 销售工作台</h1>
          <div className="subtitle">在约到期 · 跟进客户 · 成交金额 · 合作伙伴 · 材料库</div>
        </div>
      </div>
      <div className="header-right">
        <span className="today-chip">📅 {today}</span>
      </div>
    </header>
  );
}
