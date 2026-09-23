import Badge from './Badge.jsx';
import ListTools from './ListTools.jsx';
import Pagination from './Pagination.jsx';
import Icon from './icons.jsx';
import useFitPaging from '../hooks/useFitPaging.js';
import { useViewport } from '../hooks/useViewportFit.js';
import { daysUntil, formatDate } from '../utils/date.js';
import { formatMoney } from '../utils/format.js';
import { RENEW_WINDOW_DAYS } from '../data/constants.js';

const FALLBACK_ROWS = 8; // 首次测量完成前的兜底行数

function statusOf(expiryDate) {
  const d = daysUntil(expiryDate);
  if (d < 0) return { label: `已逾期 ${-d} 天`, tone: 'danger' };
  if (d === 0) return { label: '今日到期', tone: 'danger' };
  if (d <= 30) return { label: `还剩 ${d} 天`, tone: 'warn' };
  if (d <= 90) return { label: '90天内到期', tone: 'info' };
  return { label: '正常在约', tone: 'ok' };
}

export default function ExpiringContracts({ contracts, onView }) {
  const viewport = useViewport();
  const sorted = [...contracts].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  // 与客户跟进同一套逻辑：默认「舒适」布局；每页「自动」= 按当前窗口能完整显示的最多行数
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
  const stableCount = sorted.filter((c) => {
    const d = daysUntil(c.expiryDate);
    return d == null || d > RENEW_WINDOW_DAYS;
  }).length;

  // 整行可点：点在行内其他交互控件上、或刚拖选过文字时不触发
  const handleRowClick = (e, row) => {
    if (e.target.closest('button, a, input, select, textarea, label')) return;
    if (window.getSelection()?.toString()) return;
    onView(row);
  };

  return (
    <section className={`panel${dense ? ' is-dense' : ''}`} ref={panelRef}>
      <div className="panel-head">
        <div>
          <h2>在约客户</h2>
          <p className="panel-desc">在约订阅的参考清单；临期客户已在上方单独提醒，此处稳定客户无需额外操心</p>
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
              <th className="col-opt">产品</th>
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
                <tr key={c.id} className="row-clickable" onClick={(e) => handleRowClick(e, c)}>
                  <td>
                    <button type="button" className="link-name" onClick={() => onView(c)} title={`${c.name} · 查看客户详情`}>
                      {c.name}
                    </button>
                    <div className="cell-sub">{c.contact || '—'}</div>
                  </td>
                  <td className="col-opt">
                    <span className="plan-tag">{c.plan}</span>
                  </td>
                  <td className="num strong">{formatMoney(c.contractAmount)}</td>
                  <td className="num">{formatDate(c.expiryDate)}</td>
                  <td>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </td>
                  <td className="ops">
                    <span className="row-chevron">
                      <Icon name="chevronRight" />
                    </span>
                  </td>
                </tr>
              );
            })}
            {paged.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  <div className="empty-state">
                    <p>暂无在约客户，新增记录后会自动同步临期提醒与续约跟进</p>
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
