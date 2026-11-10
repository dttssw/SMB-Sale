import ListTools from './ListTools.jsx';
import Pagination from './Pagination.jsx';
import Icon from './icons.jsx';
import useFitPaging from '../hooks/useFitPaging.js';
import { useViewport } from '../hooks/useViewportFit.js';
import { stageOf } from '../data/constants.js';
import { formatDate, todayStr } from '../utils/date.js';
import { formatMoney } from '../utils/format.js';
import { skusOf } from '../utils/sku.js';

const FALLBACK_ROWS = 8; // 首次测量完成前的兜底行数

// 表格只渲染「当前页」的数据：密度、每页条数、高度自适应由 useFitPaging + ListTools 统一处理
function WatchTable({ items, onView, onRestore, scrollRef, maxHeight }) {
  // 客户 / 阶段 / SKU / 预估金额 / 上次跟进 / 转入观察 / 操作
  const colCount = 7;

  // 整行可点：点在行内其他交互控件上、或刚拖选过文字时不触发
  const handleRowClick = (e, row) => {
    if (e.target.closest('button, a, input, select, textarea, label')) return;
    if (window.getSelection()?.toString()) return;
    onView(row);
  };

  return (
    <div
      className="table-wrap follow-table-wrap fit-scroll"
      ref={scrollRef}
      style={maxHeight > 0 ? { '--fit-max': `${maxHeight}px` } : undefined}
    >
      <table className="table">
        <thead>
          <tr>
            <th>客户</th>
            <th>阶段</th>
            <th>SKU</th>
            <th className="num">预估金额</th>
            <th className="num">上次跟进</th>
            <th className="num">转入观察</th>
            <th className="ops">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => {
            const skus = skusOf(p);
            return (
              <tr key={p.id} className="row-clickable" onClick={(e) => handleRowClick(e, p)}>
                <td>
                  <button type="button" className="link-name" onClick={() => onView(p)} title={`${p.name} · 查看客户详情`}>
                    {p.name}
                  </button>
                  <div className="cell-sub">{p.contact || '—'}</div>
                </td>
                <td>
                  <span className="badge badge-info">{stageOf(p.stage).label}</span>
                </td>
                <td>
                  <span className="sku-tags">
                    <span className="plan-tag">{skus[0] || '—'}</span>
                    {skus.length > 1 && (
                      <span className="plan-tag sku-more" title={skus.join('、')}>
                        +{skus.length - 1}
                      </span>
                    )}
                  </span>
                </td>
                <td className="num strong">{formatMoney(p.expectedAmount)}</td>
                <td className="num">{formatDate(p.lastFollowUp)}</td>
                <td className="num">
                  {formatDate(p.watchedAt)}
                  <div className="cell-sub">不设定时跟进</div>
                </td>
                <td className="ops">
                  <button
                    type="button"
                    className="link-btn ok"
                    onClick={() => onRestore(p)}
                    title="恢复到「客户跟进」，重新按下一次跟进时间安排"
                  >
                    恢复跟进
                  </button>
                  <span className="row-chevron">
                    <Icon name="chevronRight" />
                  </span>
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={colCount} className="empty">
                <div className="empty-state">
                  <p>暂无长期观察客户：在「客户跟进 → 正在跟进的新客户」里点「长期观察」即可转入</p>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 长期观察页：不需要定时跟进、但需要长期留意的客户收在这里。
 * 数据仍来自同一份客户主档与同一条跟进记录（prospects.status = 'watching'），
 * 只是状态位：档案、SKU、金额与备注时间线保持原样，随时可以「恢复跟进」。
 */
export default function WatchList({ prospects, onView, onRestore }) {
  const viewport = useViewport();
  // 最近转入的排在最前：watchedAt 倒序（历史数据没有 watchedAt 时排在最后）
  const sorted = [...prospects].sort(
    (a, b) => (b.watchedAt || '').localeCompare(a.watchedAt || '') || a.name.localeCompare(b.name, 'zh')
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
  } = useFitPaging({
    count: sorted.length,
    viewportHeight: viewport.height,
    deps: [],
    fallbackRows: FALLBACK_ROWS,
  });
  const paged = slicePage(sorted);
  const monthKey = todayStr().slice(0, 7);
  const monthWatched = sorted.filter((p) => (p.watchedAt || '').slice(0, 7) === monthKey).length;

  return (
    <section ref={panelRef} className={`follow-panel watch-panel${dense ? ' is-dense' : ''}`}>
      <header className="follow-head">
        <div className="follow-head-main">
          <div className="follow-title">
            <h2>长期观察</h2>
            <span className="follow-tag">WATCH</span>
          </div>
          <span className="follow-count">{sorted.length} 家</span>
        </div>
        <div className="follow-head-ops">
          <ListTools
            dense={dense}
            onDenseChange={setDense}
            perPage={perPage}
            onPerPageChange={setPerPage}
            autoRows={autoRows}
          />
        </div>
      </header>
      <div className="follow-meta">
        <span className="follow-desc">
          不需要设定时跟进、但需要长期留意的客户收在这里；客户档案、SKU 与备注时间线保持原样，随时可「恢复跟进」
        </span>
        <div className="stat-pills">
          <span className="pill">长期观察 {sorted.length} 家</span>
          <span className="pill pill-info">本月转入 {monthWatched} 家</span>
        </div>
      </div>
      <WatchTable
        items={paged}
        onView={onView}
        onRestore={onRestore}
        scrollRef={scrollRef}
        maxHeight={maxHeight}
      />
      <Pagination page={page} total={sorted.length} perPage={pageSize} onChange={setPage} />
    </section>
  );
}
