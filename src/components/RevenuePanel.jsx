import { useMemo } from 'react';
import useFitScroll, { useViewport } from '../hooks/useViewportFit.js';
import Icon from './icons.jsx';
import { formatDate, monthOf, todayStr } from '../utils/date.js';
import { formatMoney, sumBy } from '../utils/format.js';

export default function RevenuePanel({ deals, onAdd }) {
  const { totalNew, monthNew, newCount, recent } = useMemo(() => {
    const newDeals = deals.filter((d) => d.type !== 'renewal');
    const totalNew = sumBy(newDeals, 'amount');
    const monthKey = monthOf(todayStr());
    const monthNew = sumBy(newDeals.filter((d) => monthOf(d.date) === monthKey), 'amount');
    const recent = [...newDeals].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
    return { totalNew, monthNew, newCount: newDeals.length, recent };
  }, [deals]);
  // 按窗口高度自适应：成交明细的高度跟着窗口大小走
  const viewport = useViewport();
  const { panelRef, scrollRef, maxHeight } = useFitScroll(viewport.height, [recent.length]);

  return (
    <section className="panel" ref={panelRef}>
      <div className="panel-head">
        <div>
          <h2>成交金额</h2>
          <p className="panel-desc">回顾即可——New 客户转为在约时自动计入新签金额</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onAdd}>
          <Icon name="plus" />
          记录
        </button>
      </div>

      <div className="mini-stats compact">
        <div className="mini-stat">
          <span className="dot dot-new" /> 本月 <b>{formatMoney(monthNew)}</b>
        </div>
        <div className="mini-stat">
          累计 <b>{formatMoney(totalNew)}</b>
        </div>
        <div className="mini-stat">
          笔数 <b>{newCount}</b>
        </div>
      </div>

      <div
        className="table-wrap fit-scroll"
        ref={scrollRef}
        style={maxHeight > 0 ? { '--fit-max': `${maxHeight}px` } : undefined}
      >
        <table className="table">
          <thead>
            <tr>
              <th className="num">日期</th>
              <th>客户</th>
              <th className="num">金额</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((d) => (
              <tr key={d.id}>
                <td className="num">{formatDate(d.date)}</td>
                <td>
                  <span className="cell-main">{d.customer}</span>
                </td>
                <td className="num strong">{formatMoney(d.amount)}</td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr>
                <td colSpan={3} className="empty">
                  <div className="empty-state">
                    <p>暂无成交记录，New 客户转为在约时自动计入，也可手动记录一笔</p>
                    <button type="button" className="btn btn-secondary" onClick={onAdd}>
                      <Icon name="plus" />
                      记录成交金额
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
