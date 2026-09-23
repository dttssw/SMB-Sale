import Badge from './Badge.jsx';
import ListTools from './ListTools.jsx';
import Pagination from './Pagination.jsx';
import useFitPaging from '../hooks/useFitPaging.js';
import { useViewport } from '../hooks/useViewportFit.js';
import { stageOf, RENEW_WINDOW_DAYS } from '../data/constants.js';
import { daysUntil, formatDate, todayStr } from '../utils/date.js';
import { formatMoney } from '../utils/format.js';

const FALLBACK_ROWS = 8; // 首次测量完成前的兜底行数

// 表格只渲染「当前页」的数据：密度、每页条数、高度自适应由 useFitPaging + ListTools 统一处理
function ProspectTable({ items, isRenew, wide, onView, scrollRef, maxHeight }) {
  // 双栏（窄）时省略「上次跟进」，把宽度留给客户与关键日期；单栏全宽时字段更全
  // New：客户 / 阶段 / 预估金额 / [上次跟进] / 下次跟进 / 操作；Renew：客户 / 预估金额 / [上次跟进] / 下次跟进 / 续约到期 / 操作
  const colCount = wide ? 6 : 5;

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
            {!isRenew && <th>阶段</th>}
            <th className="num">预估金额</th>
            {wide && <th className="num">上次跟进</th>}
            <th className="num">下次跟进</th>
            {isRenew && <th className="num">续约到期</th>}
            <th className="ops">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => {
            const stage = stageOf(p.stage);
            const next = p.nextFollowUp ? daysUntil(p.nextFollowUp) : null;
            const expiryDays = isRenew && p.expiryDate ? daysUntil(p.expiryDate) : null;
            return (
              <tr key={p.id}>
                <td>
                  <a className="link-name" onClick={() => onView(p)} title="查看客户详情">
                    {p.name}
                  </a>
                  <div className="cell-sub">{p.contact || '—'}</div>
                </td>
                {!isRenew && (
                  <td>
                    <Badge tone={stage.tone}>{stage.label}</Badge>
                  </td>
                )}
                <td className="num strong">{formatMoney(p.expectedAmount)}</td>
                {wide && <td className="num">{formatDate(p.lastFollowUp)}</td>}
                <td className="num">
                  {formatDate(p.nextFollowUp)}
                  {next != null && next < 0 && <div className="cell-sub danger-text">逾期 {-next} 天</div>}
                  {next === 0 && <div className="cell-sub warn-text">今天跟进</div>}
                </td>
                {isRenew && (
                  <td className="num">
                    {formatDate(p.expiryDate)}
                    {expiryDays != null && expiryDays < 0 && (
                      <div className="cell-sub danger-text">已过期 {-expiryDays} 天</div>
                    )}
                    {expiryDays != null && expiryDays >= 0 && (
                      <div className={`cell-sub${expiryDays <= RENEW_WINDOW_DAYS ? ' warn-text' : ''}`}>还剩 {expiryDays} 天</div>
                    )}
                  </td>
                )}
                <td className="ops">
                  <button className="link-btn" onClick={() => onView(p)}>
                    详情
                  </button>
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={colCount} className="empty">
                {isRenew
                  ? `暂无临期续约客户（距到期 ≤ ${RENEW_WINDOW_DAYS} 天），距到期更久的只显示在「在约客户」板块`
                  : '暂无跟进中的新客户，点击右上角新增'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const VARIANTS = {
  new: {
    title: '正在跟进的新客户',
    tag: 'NEW',
    isRenew: false,
    desc: '按下一次跟进时间排序，逾期未跟进的客户优先处理',
    addLabel: '＋ 新增跟进',
  },
  renew: {
    title: '续约跟进',
    tag: 'RENEW',
    isRenew: true,
    // 只存放临期客户：距到期 > RENEW_WINDOW_DAYS 的在约客户不进这里，只在「在约客户」板块
    desc: `只放距到期 ≤ ${RENEW_WINDOW_DAYS} 天（约两个月）的在约客户，临期自动带出、续约完成自动退出；更久的只在「在约客户」板块`,
    addLabel: '＋ 新建续约',
  },
};

export default function ProspectList({ prospects, variant, onAdd, onView, wide = false }) {
  const viewport = useViewport();
  const today = todayStr();
  const v = VARIANTS[variant] || VARIANTS.new;
  const items = prospects.filter((p) => (v.isRenew ? p.category === 'renew' : p.category !== 'renew'));
  const sorted = [...items].sort((a, b) =>
    (a.nextFollowUp || '9999-12-31').localeCompare(b.nextFollowUp || '9999-12-31')
  );
  // 密度默认「舒适」、每页默认「自动」（按当前窗口算出这个板块能完整显示的最多行数）；
  // 单栏 / 双栏会改变列宽与换行，因此把 wide 也作为重新测量的条件
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
    deps: [wide],
    fallbackRows: FALLBACK_ROWS,
  });
  const paged = slicePage(sorted);
  const overdue = items.filter((p) => p.nextFollowUp && daysUntil(p.nextFollowUp) < 0).length;
  const dueToday = items.filter((p) => p.nextFollowUp === today).length;

  return (
    <section
      ref={panelRef}
      className={`follow-panel follow-${variant === 'renew' ? 'renew' : 'new'}${dense ? ' is-dense' : ''}`}
    >
      <header className="follow-head">
        <div className="follow-head-main">
          <div className="follow-title">
            <h2>{v.title}</h2>
            <span className="follow-tag">{v.tag}</span>
          </div>
          <span className="follow-count">{items.length} 家</span>
        </div>
        <div className="follow-head-ops">
          <ListTools
            dense={dense}
            onDenseChange={setDense}
            perPage={perPage}
            onPerPageChange={setPerPage}
            autoRows={autoRows}
          />
          <button className="btn btn-primary btn-sm" onClick={onAdd}>
            {v.addLabel}
          </button>
        </div>
      </header>
      <div className="follow-meta">
        <span className="follow-desc">{v.desc}</span>
        <div className="stat-pills">
          <span className="pill pill-danger">逾期未跟进 {overdue}</span>
          <span className="pill pill-info">今日需跟进 {dueToday}</span>
        </div>
      </div>
      <ProspectTable
        items={paged}
        isRenew={v.isRenew}
        wide={wide}
        onView={onView}
        scrollRef={scrollRef}
        maxHeight={maxHeight}
      />
      <Pagination page={page} total={sorted.length} perPage={pageSize} onChange={setPage} />
    </section>
  );
}

