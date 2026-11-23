import Badge from './Badge.jsx';
import ListTools from './ListTools.jsx';
import Pagination from './Pagination.jsx';
import Icon from './icons.jsx';
import useFitPaging from '../hooks/useFitPaging.js';
import { useViewport } from '../hooks/useViewportFit.js';
import { daysUntil, formatDate } from '../utils/date.js';
import { formatMoney } from '../utils/format.js';
import { skuEntriesOf, isServiceOnly } from '../utils/sku.js';
import { RENEW_WINDOW_DAYS } from '../data/constants.js';

const FALLBACK_ROWS = 8;

function statusOf(project) {
  if (isServiceOnly(project)) return { label: '一次性交付', tone: 'info' };
  const days = daysUntil(project.expiryDate);
  if (days == null) return { label: '未设置到期', tone: 'info' };
  if (days < 0) return { label: `已到期 ${-days} 天`, tone: 'danger' };
  if (days === 0) return { label: '今日到期', tone: 'danger' };
  if (days <= 30) return { label: `还剩 ${days} 天`, tone: 'warn' };
  if (days <= 90) return { label: '90天内到期', tone: 'info' };
  return { label: '正常在约', tone: 'ok' };
}

export default function SignedProjects({ projects, onView, onCustomer, onRenew }) {
  const viewport = useViewport();
  const sorted = [...projects].sort((a, b) =>
    (a.expiryDate || '9999-12-31').localeCompare(b.expiryDate || '9999-12-31')
  );
  const {
    panelRef,
    scrollRef,
    maxHeight,
    dense,
    setDense,
    perPage,
    setPerPage,
    autoRows,
    pageSize,
    page,
    setPage,
    slicePage,
  } = useFitPaging({ count: sorted.length, viewportHeight: viewport.height, fallbackRows: FALLBACK_ROWS });
  const paged = slicePage(sorted);
  const stableCount = sorted.filter(
    (project) => !isServiceOnly(project) && daysUntil(project.expiryDate) > RENEW_WINDOW_DAYS
  ).length;
  const expiringCount = sorted.filter((project) => {
    if (isServiceOnly(project)) return false;
    const days = daysUntil(project.expiryDate);
    return days != null && days <= RENEW_WINDOW_DAYS;
  }).length;
  const serviceCount = sorted.filter((project) => isServiceOnly(project)).length;

  const handleRowClick = (e, row) => {
    if (e.target.closest('button, a, input, select, textarea, label')) return;
    if (window.getSelection()?.toString()) return;
    onView(row);
  };

  return (
    <section className={`panel${dense ? ' is-dense' : ''}`} ref={panelRef}>
      <div className="panel-head">
        <div>
          <h2>已签项目</h2>
          <p className="panel-desc">项目赢单后进入这里，保留成交金额和订阅信息；到期只代表需要续约，不会自动变成 Lost</p>
        </div>
        <ListTools
          dense={dense}
          onDenseChange={setDense}
          perPage={perPage}
          onPerPageChange={setPerPage}
          autoRows={autoRows}
        />
      </div>
      <div className="stat-pills">
        <span className="pill pill-info">已签 {sorted.length} 个项目</span>
        <span className="pill pill-ok">正常稳定 {stableCount}</span>
        <span className="pill pill-warn">临期 / 已到期 {expiringCount}</span>
        {serviceCount > 0 && <span className="pill pill-info">一次性交付 {serviceCount}</span>}
      </div>
      <div
        className="table-wrap fit-scroll"
        ref={scrollRef}
        style={maxHeight > 0 ? { '--fit-max': `${maxHeight}px` } : undefined}
      >
        <table className="table">
          <thead>
            <tr>
              <th>项目 / 最终客户</th>
              <th className="col-opt">合作伙伴</th>
              <th className="col-opt">类型</th>
              <th className="col-opt">SKU</th>
              <th className="num">成交金额</th>
              <th className="num">订阅周期</th>
              <th>状态</th>
              <th className="ops">操作</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((project) => {
              const status = statusOf(project);
              const serviceOnly = isServiceOnly(project);
              const entries = skuEntriesOf(project);
              return (
                <tr key={project.id} className="row-clickable" onClick={(e) => handleRowClick(e, project)}>
                  <td>
                    <button
                      type="button"
                      className="link-name"
                      onClick={() => onView(project)}
                      title={`${project.name} · 查看项目详情`}
                    >
                      {project.name}
                    </button>
                    <div className="cell-sub">
                      <button type="button" className="link-btn" onClick={() => onCustomer(project)}>
                        {project.customerName}
                      </button>
                    </div>
                  </td>
                  <td className="col-opt">{project.partnerName || '—'}</td>
                  <td className="col-opt">{project.category === 'renew' ? '续约' : project.category === 'new' ? '新签' : '历史'}</td>
                  <td className="col-opt">
                    <span className="sku-tags">
                      <span className="plan-tag">
                        {entries[0]?.sku || '—'}
                        {entries[0] && <i className="sku-qty-tag">×{entries[0].qty}</i>}
                      </span>
                      {entries.length > 1 && (
                        <span
                          className="plan-tag sku-more"
                          title={entries.map((entry) => `${entry.sku} ×${entry.qty}`).join('、')}
                        >
                          +{entries.length - 1}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="num strong">{formatMoney(project.contractAmount)}</td>
                  <td className="num">
                    {serviceOnly ? '—' : formatDate(project.startDate)}
                    <div className="cell-sub">{serviceOnly ? '无订阅期限' : `至 ${formatDate(project.expiryDate)}`}</div>
                  </td>
                  <td>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </td>
                  <td className="ops">
                    {!serviceOnly && (
                      <button
                        type="button"
                        className="link-btn ok"
                        onClick={() => onRenew(project)}
                        title="从该项目新建一个独立续约项目"
                      >
                        续约
                      </button>
                    )}
                    <span className="row-chevron">
                      <Icon name="chevronRight" />
                    </span>
                  </td>
                </tr>
              );
            })}
            {paged.length === 0 && (
              <tr>
                <td colSpan={8} className="empty">
                  <div className="empty-state">
                    <p>暂无已签项目，项目赢单后会自动进入这里</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} total={sorted.length} perPage={pageSize} onChange={setPage} />
    </section>
  );
}
