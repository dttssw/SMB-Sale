import { useState } from 'react';
import Badge from './Badge.jsx';
import Pagination from './Pagination.jsx';
import useFitScroll, { useViewport } from '../hooks/useViewportFit.js';
import { daysUntil, formatDate } from '../utils/date.js';
import { formatMoney } from '../utils/format.js';

const PER_PAGE = 5; // 兜底：自动测量完成前的每页条数

function statusOf(expiryDate) {
  const d = daysUntil(expiryDate);
  if (d < 0) return { label: `已逾期 ${-d} 天`, tone: 'danger' };
  if (d === 0) return { label: '今日到期', tone: 'danger' };
  if (d <= 30) return { label: `还剩 ${d} 天`, tone: 'warn' };
  if (d <= 90) return { label: '90天内到期', tone: 'info' };
  return { label: '正常在约', tone: 'ok' };
}

export default function ExpiringContracts({ contracts, onView }) {
  const [page, setPage] = useState(1);
  // 按窗口高度自适应：卡片高度、每页条数都跟着窗口大小走
  const viewport = useViewport();
  const sorted = [...contracts].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  const { panelRef, scrollRef, maxHeight, rows } = useFitScroll(viewport.height, [sorted.length]);
  const perPage = rows > 0 ? rows : PER_PAGE;

  const pages = Math.max(1, Math.ceil(sorted.length / perPage));
  const cur = Math.min(page, pages);
  const paged = sorted.slice((cur - 1) * perPage, cur * perPage);
  const stableCount = sorted.filter((c) => {
    const d = daysUntil(c.expiryDate);
    return d == null || d > 45;
  }).length;

  return (
    <section className="panel" ref={panelRef}>
      <div className="panel-head">
        <div>
          <h2>📋 在约客户</h2>
          <p className="panel-desc">在约订阅的参考清单；临期客户已在上方单独提醒，此处稳定客户无需额外操心</p>
        </div>
      </div>
      <div className="stat-pills">
        <span className="pill pill-info">在约 {sorted.length} 家</span>
        <span className="pill pill-ok">正常稳定 {stableCount} 家</span>
      </div>
      <div
        className="table-wrap fit-scroll"
        ref={scrollRef}
        style={maxHeight > 0 ? { '--fit-max': `${maxHeight}px` } : undefined}
      >
        <table className="table">
          <thead>
            <tr>
              <th>客户名称</th>
              <th>产品</th>
              <th className="num">合同金额</th>
              <th className="num">到期时间</th>
              <th>状态</th>
              <th className="ops">操作</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((c) => {
              const st = statusOf(c.expiryDate);
              return (
                <tr key={c.id}>
                  <td>
                    <a className="link-name" onClick={() => onView(c)} title="查看客户详情">
                      {c.name}
                    </a>
                    <div className="cell-sub">{c.contact || '—'}</div>
                  </td>
                  <td>
                    <span className="plan-tag">{c.plan}</span>
                  </td>
                  <td className="num strong">{formatMoney(c.contractAmount)}</td>
                  <td className="num">{formatDate(c.expiryDate)}</td>
                  <td>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </td>
                  <td className="ops">
                    <button className="link-btn" onClick={() => onView(c)}>
                      详情
                    </button>
                  </td>
                </tr>
              );
            })}
            {paged.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  暂无在约客户
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={cur} total={sorted.length} perPage={perPage} onChange={setPage} />
    </section>
  );
}
