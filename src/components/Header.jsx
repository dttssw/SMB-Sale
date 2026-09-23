/**
 * 顶部栏：56px 扁平条（无 sticky 毛玻璃）。
 * 左边只有板块标题 + 一句话说明；右边是日期（11px 英文标签 + 13px 值）。
 */
export default function Header({ today, title = 'SMB 销售工作台', desc = '' }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="topbar-title">{title}</h1>
        {desc ? <p className="topbar-desc">{desc}</p> : null}
      </div>
      <div className="topbar-right">
        <span className="topbar-date">
          <span className="label">Today</span>
          <span className="value">{today}</span>
        </span>
      </div>
    </header>
  );
}
