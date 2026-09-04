import KpiCard from './KpiCard.jsx';
import ExpiryAlert from './ExpiryAlert.jsx';
import { formatMoney } from '../utils/format.js';

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

// 今日聚焦：根据数据给出一句既是鼓励又体谅疲惫的动态文案
function focusLine(stats) {
  if (stats.followDue > 0)
    return `今天有 ${stats.followDue} 家客户需要你跟进，先从最紧的开始，一件一件来。`;
  if (stats.expiring > 0)
    return `有 ${stats.expiring} 家在约客户临近到期，安顿好他们，今天就很值得。`;
  if (stats.todayWork > 0)
    return `已经记下 ${stats.todayWork} 条工作，稳步推进，这样的节奏就很好。`;
  return '今天从从容容，正好理一理手头的事，给接下来的冲刺留足空间。';
}

export default function Home({ stats, contracts, today, onView, onRenew }) {
  return (
    <section className="home">
      <div className="hero">
        <div className="hero-orb orb-a" />
        <div className="hero-orb orb-b" />
        <div className="hero-orb orb-c" />
        <div className="hero-inner">
          <div className="hero-eyebrow">
            <span className="hero-dot" />
            {today} · 你的销售工作台
          </div>

          <h1 className="hero-title">
            {greeting()}，辛苦了 <span className="hero-wave">☕</span>
          </h1>
          <p className="hero-lede">欢迎回到 SMB 销售工作台，陪你跑好今天的每一单。</p>

          <div className="hero-moods">
            <div className="mood-chip positive">
              <div className="mood-icon">🌱</div>
              <div>
                <div className="mood-label">积极的一面</div>
                <div className="mood-text">
                  每一次跟进都在悄悄积累复利——坚持的人，运气不会太差。
                </div>
              </div>
            </div>

            <div className="mood-chip weary">
              <div className="mood-icon">☕</div>
              <div>
                <div className="mood-label">疲惫的一面</div>
                <div className="mood-text">
                  当然，累是常态。业绩再亮眼，也换不回你的好觉与好心情。
                </div>
              </div>
            </div>
          </div>

          <div className="hero-focus">
            <span className="hero-focus-ico">🔎</span>
            <span>{focusLine(stats)}</span>
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard
          label="今日需跟进"
          value={stats.followDue}
          unit="家"
          icon="🎯"
          tone={stats.followDue > 0 ? 'danger' : 'ok'}
          sub={`逾期 ${stats.overdueFollow} · 今日 ${stats.dueTodayFollow}`}
        />
        <KpiCard
          label="临期在约"
          value={stats.expiring}
          unit="家"
          icon="🔔"
          tone={stats.expiring > 0 ? 'warn' : 'ok'}
          sub={`已到期 ${stats.overdueContracts} · 30天内 ${stats.exp30}`}
        />
        <KpiCard
          label="今日记录"
          value={stats.todayWork}
          unit="条"
          icon="📝"
          tone="violet"
          sub="今天做了什么"
        />
        <KpiCard
          label="本月成交"
          value={formatMoney(stats.monthNew)}
          icon="💰"
          valueClass="money"
          sub={`累计 ${formatMoney(stats.newTotal)}`}
        />
      </div>

      <ExpiryAlert contracts={contracts} onView={onView} onRenew={onRenew} />
    </section>
  );
}
