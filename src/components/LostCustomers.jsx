import ListTools from './ListTools.jsx';
import Pagination from './Pagination.jsx';
import Icon from './icons.jsx';
import useFitPaging from '../hooks/useFitPaging.js';
import { useViewport } from '../hooks/useViewportFit.js';
import { stageOf } from '../data/constants.js';
import { formatDate, todayStr } from '../utils/date.js';
import { formatMoney } from '../utils/format.js';
import { skusOf } from '../utils/sku.js';

const FALLBACK_ROWS = 6; // 首次测量完成前的兜底行数

const VARIANTS = {
  new: {
    variant: 'new',
    title: 'New 流失客户',
    tag: 'NEW LOST',
    desc: '标记为 lost 的新客户归档在这里；客户档案、SKU 与备注时间线保持原样，可随时恢复',
    empty: '暂无流失的新客户：在客户详情里「⋯ 更多 → 标记为 Lost」即可归档',
  },
  renew: {
    variant: 'renew',
    title: '续约流失客户',
    tag: 'RENEW LOST',
    desc: '标记为 lost 的在约 / 续约客户归档在这里；订阅信息与备注时间线保持原样，可随时恢复',
    empty: '暂无流失的续约客户：在客户详情里「⋯ 更多 → 标记为 Lost」即可归档',
  },
};

// 表格只渲染「当前页」的数据：密度、每页条数、高度自适应由 useFitPaging + ListTools 统一处理
function LostTable({ items, isRenew, onView, scrollRef, maxHeight }) {
  // New Lost：客户 / 阶段 / 预估金额 / 上次跟进 / 流失时间 / 操作
  // Renew Lost：客户 / SKU / 合同金额 / 到期时间 / 流失时间 / 操作
  const colCount = 6;

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
            {isRenew ? <th>SKU</th> : <th>阶段</th>}
            <th className="num">{isRenew ? '合同金额' : '预估金额'}</th>
            <th className="num">{isRenew ? '到期时间' : '上次跟进'}</th>
            <th className="num">流失时间</th>
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
                {isRenew ? (
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
                ) : (
                  <td>
                    <span className="badge badge-info">{stageOf(p.stage).label}</span>
                  </td>
                )}
                <td className="num strong">{formatMoney(isRenew ? p.contractAmount : p.expectedAmount)}</td>
                <td className="num">{formatDate(isRenew ? p.expiryDate : p.lastFollowUp)}</td>
                <td className="num">{formatDate(p.lostAt)}</td>
                <td className="ops">
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
                  <p>{VARIANTS[isRenew ? 'renew' : 'new'].empty}</p>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function LostPanel({ variant, items, onView }) {
  const viewport = useViewport();
  const v = VARIANTS[variant] || VARIANTS.new;
  const isRenew = variant === 'renew';
  // 最近的流失排在最前：lostAt 倒序（历史数据没有 lostAt 时排在最后）
  const sorted = [...items].sort(
    (a, b) => (b.lostAt || '').localeCompare(a.lostAt || '') || a.name.localeCompare(b.name, 'zh')
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
    deps: [variant],
    fallbackRows: FALLBACK_ROWS,
  });
  const paged = slicePage(sorted);
  const monthKey = todayStr().slice(0, 7);
  const monthLost = sorted.filter((p) => (p.lostAt || '').slice(0, 7) === monthKey).length;

  return (
    <section ref={panelRef} className={`follow-panel lost-panel lost-${v.variant}${dense ? ' is-dense' : ''}`}>
      <header className="follow-head">
        <div className="follow-head-main">
          <div className="follow-title">
            <h2>{v.title}</h2>
            <span className="follow-tag">{v.tag}</span>
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
        <span className="follow-desc">{v.desc}</span>
        <div className="stat-pills">
          <span className="pill pill-danger">已流失 {sorted.length} 家</span>
          <span className="pill pill-info">本月 {monthLost} 家</span>
        </div>
      </div>
      <LostTable items={paged} isRenew={isRenew} onView={onView} scrollRef={scrollRef} maxHeight={maxHeight} />
      <Pagination page={page} total={sorted.length} perPage={pageSize} onChange={setPage} />
    </section>
  );
}

/**
 * Lost 客户页：New 与 Renew 两块并排（窄屏自动单栏）。
 * 数据仍来自同一份客户主档：lost 只是角色行上的状态位，档案与备注不会复制或丢失。
 */
export default function LostCustomers({ newLost, renewLost, onViewNew, onViewRenew }) {
  return (
    <div className="workspace-grid">
      <LostPanel variant="new" items={newLost} onView={onViewNew} />
      <LostPanel variant="renew" items={renewLost} onView={onViewRenew} />
    </div>
  );
}

