import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import Badge from './Badge.jsx';
import { formatDate, monthOf } from '../utils/date.js';
import { formatMoney, sumBy } from '../utils/format.js';

const COLORS = { renewal: '#10b981', new: '#6366f1' };

export default function RevenuePanel({ deals, onAdd }) {
  const { monthlyData, pieData, totals, recent } = useMemo(() => {
    const monthlyMap = {};
    for (const d of deals) {
      const m = monthOf(d.date);
      if (!monthlyMap[m]) monthlyMap[m] = { month: m, renewalAmount: 0, newAmount: 0 };
      monthlyMap[m][d.type === 'renewal' ? 'renewalAmount' : 'newAmount'] += d.amount;
    }
    const monthlyData = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));
    const renewalTotal = sumBy(deals.filter((d) => d.type === 'renewal'), 'amount');
    const newTotal = sumBy(deals.filter((d) => d.type === 'new'), 'amount');
    const pieData = [
      { name: '续约金额', value: renewalTotal, color: COLORS.renewal },
      { name: '新签金额', value: newTotal, color: COLORS.new },
    ];
    const recent = [...deals].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    return {
      monthlyData,
      pieData,
      totals: { renewalTotal, newTotal, all: renewalTotal + newTotal },
      recent,
    };
  }, [deals]);

  const renewalPct = totals.all > 0 ? Math.round((totals.renewalTotal / totals.all) * 100) : 0;

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>💰 金额看板 · 续约 vs 新签</h2>
          <p className="panel-desc">按签约月份汇总成交金额，掌握续约收入与新客收入结构</p>
        </div>
        <button className="btn btn-primary" onClick={onAdd}>
          ＋ 记录成交
        </button>
      </div>

      <div className="mini-stats">
        <div className="mini-stat">
          <span className="dot dot-renewal" /> 续约总额 <b>{formatMoney(totals.renewalTotal)}</b>
        </div>
        <div className="mini-stat">
          <span className="dot dot-new" /> 新签总额 <b>{formatMoney(totals.newTotal)}</b>
        </div>
        <div className="mini-stat">
          续约率 <b>{renewalPct}%</b>
        </div>
        <div className="mini-stat">
          成交合计 <b>{formatMoney(totals.all)}</b>
        </div>
      </div>

      <div className="revenue-grid">
        <div className="chart-box">
          <h4 className="chart-title">月度成交趋势（续约 vs 新签）</h4>
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
              <Legend />
              <Bar dataKey="renewalAmount" name="续约金额" fill={COLORS.renewal} radius={[4, 4, 0, 0]} maxBarSize={26} />
              <Bar dataKey="newAmount" name="新签金额" fill={COLORS.new} radius={[4, 4, 0, 0]} maxBarSize={26} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-box">
          <h4 className="chart-title">金额占比</h4>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                innerRadius={52}
                outerRadius={82}
                paddingAngle={3}
                strokeWidth={0}
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => formatMoney(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pie-legend">
            {pieData.map((p) => (
              <div key={p.name} className="pie-item">
                <span className="dot" style={{ background: p.color }} />
                <span>{p.name}</span>
                <b>{formatMoney(p.value)}</b>
              </div>
            ))}
          </div>
        </div>
      </div>

      <h4 className="chart-title">最近成交记录</h4>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="num">签约日期</th>
              <th>客户</th>
              <th>类型</th>
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
                <td>
                  <Badge tone={d.type === 'renewal' ? 'ok' : 'primary'}>{d.type === 'renewal' ? '续约' : '新签'}</Badge>
                </td>
                <td className="num strong">{formatMoney(d.amount)}</td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  暂无成交记录，点击右上角记录成交
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
