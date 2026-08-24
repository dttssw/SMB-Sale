import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { formatDate, monthOf, todayStr } from '../utils/date.js';
import { formatMoney, sumBy } from '../utils/format.js';

const NEW_COLOR = '#6366f1';

export default function RevenuePanel({ deals, onAdd }) {
  const { monthlyData, totalNew, monthNew, newCount, recent } = useMemo(() => {
    const newDeals = deals.filter((d) => d.type !== 'renewal');
    const monthlyMap = {};
    for (const d of newDeals) {
      const m = monthOf(d.date);
      if (!monthlyMap[m]) monthlyMap[m] = { month: m, amount: 0 };
      monthlyMap[m].amount += d.amount;
    }
    const monthlyData = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));
    const totalNew = sumBy(newDeals, 'amount');
    const monthKey = monthOf(todayStr());
    const monthNew = sumBy(newDeals.filter((d) => monthOf(d.date) === monthKey), 'amount');
    const recent = [...newDeals].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    return { monthlyData, totalNew, monthNew, newCount: newDeals.length, recent };
  }, [deals]);

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>💰 成交金额 · 新签</h2>
          <p className="panel-desc">由「新客户（New）转为在约」时自动记录的新签成交金额</p>
        </div>
        <button className="btn btn-primary" onClick={onAdd}>
          ＋ 记录成交
        </button>
      </div>

      <div className="mini-stats">
        <div className="mini-stat">
          <span className="dot dot-new" /> 新签总额 <b>{formatMoney(totalNew)}</b>
        </div>
        <div className="mini-stat">
          本月新签 <b>{formatMoney(monthNew)}</b>
        </div>
        <div className="mini-stat">
          新签笔数 <b>{newCount}</b>
        </div>
      </div>

      <div className="chart-box">
        <h4 className="chart-title">月度新签成交趋势</h4>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={monthlyData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="month"
              tickFormatter={(m) => `${Number(m.slice(5))}月`}
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
            />
            <YAxis
              tickFormatter={(v) => (v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v)}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              formatter={(v) => formatMoney(v)}
              labelFormatter={(m) => `${m.slice(0, 4)}年${Number(m.slice(5))}月`}
            />
            <Bar dataKey="amount" name="新签金额" fill={NEW_COLOR} radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <h4 className="chart-title">最近成交记录</h4>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="num">签约日期</th>
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
                  暂无新签成交，New 客户转为在约时自动记录
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
