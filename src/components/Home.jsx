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

/**
 * 总览：固定顺序 问候 → KPI 四列 → 临期在约提醒。
 * 原来的 hero 装饰层（光球 / 渐变标题 / 两张卡片）已删除，首屏把版面全留给信息。
 */
export default function Home({ stats, contracts, today, onView, onRenew }) {
  return (
    <section className="home">
      <div className="home-greet">
        <p className="home-hello">
          {greeting()}，辛苦了
          <span className="home-lede">· 欢迎回到 SMB 销售工作台，陪你跑好今天的每一单。</span>
        </p>
        <p className="home-focus">{focusLine(stats)}</p>
      </div>

      <div className="kpi-grid">
        <KpiCard
          label="今日需跟进"
          value={stats.followDue}
          unit="家"
          icon="target"
          tone={stats.followDue > 0 ? 'danger' : 'ok'}
          sub={`逾期 ${stats.overdueFollow} · 今日 ${stats.dueTodayFollow}`}
        />
        <KpiCard
          label="临期在约"
          value={stats.expiring}
          unit="家"
          icon="bell"
          tone={stats.expiring > 0 ? 'warn' : 'ok'}
          sub={`已到期 ${stats.overdueContracts} · 30天内 ${stats.exp30}`}
        />
        <KpiCard
          label="今日记录"
          value={stats.todayWork}
          unit="条"
          icon="journal"
          sub="今天做了什么"
        />
        <KpiCard
          label="本月成交"
          value={formatMoney(stats.monthNew)}
          icon="coins"
          money
          sub={`累计 ${formatMoney(stats.newTotal)}`}
        />
      </div>

      <ExpiryAlert contracts={contracts} onView={onView} onRenew={onRenew} />
    </section>
  );
}
