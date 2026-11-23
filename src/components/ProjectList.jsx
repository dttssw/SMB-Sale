import ListTools from './ListTools.jsx';
import Pagination from './Pagination.jsx';
import Icon from './icons.jsx';
import useFitPaging from '../hooks/useFitPaging.js';
import { useViewport } from '../hooks/useViewportFit.js';
import { RENEW_WINDOW_DAYS } from '../data/constants.js';
import { daysUntil, formatDate, todayStr } from '../utils/date.js';
import { formatMoney } from '../utils/format.js';

const FALLBACK_ROWS = 8;

function ProjectTable({ items, isRenew, wide, onView, onCustomer, onAdd, onWatch, scrollRef, maxHeight }) {
  // 列数只由 wide 决定：续约的「订阅到期」不再单独占一列，改为项目单元格里的副行，
  // 这样 New / Renew 两张表在并排时列宽节奏完全一致，也不会把「操作」挤出可视区。
  const colCount = wide ? 6 : 4;
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
            <th>项目 / 最终客户</th>
            {wide && <th>合作伙伴</th>}
            <th className="num">预估金额</th>
            {wide && <th className="num col-opt">上次跟进</th>}
            <th className="num">下次跟进</th>
            <th className="ops">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((project) => {
            const next = project.nextFollowUp ? daysUntil(project.nextFollowUp) : null;
            const expiryDays = isRenew && project.expiryDate ? daysUntil(project.expiryDate) : null;
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
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => onCustomer(project)}
                      title="打开最终客户"
                    >
                      {project.customerName || '—'}
                    </button>
                  </div>
                  {isRenew && project.expiryDate && (
                    <div className="cell-sub">
                      订阅到期 {formatDate(project.expiryDate)}
                      {expiryDays != null && expiryDays < 0 && (
                        <span className="danger-text"> · 已过期 {-expiryDays} 天</span>
                      )}
                      {expiryDays != null && expiryDays >= 0 && (
                        <span className={expiryDays <= RENEW_WINDOW_DAYS ? 'warn-text' : undefined}>
                          {' '}· 还剩 {expiryDays} 天
                        </span>
                      )}
                    </div>
                  )}
                </td>
                {wide && <td>{project.partnerName || '—'}</td>}
                <td className="num strong">{formatMoney(project.expectedAmount)}</td>
                {wide && <td className="num col-opt">{formatDate(project.lastFollowUp)}</td>}
                <td className="num">
                  {formatDate(project.nextFollowUp)}
                  {next != null && next < 0 && <div className="cell-sub danger-text">逾期 {-next} 天</div>}
                  {next === 0 && <div className="cell-sub warn-text">今天跟进</div>}
                </td>
                <td className="ops">
                  {!isRenew && onWatch && (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => onWatch(project)}
                      title="转为长期观察，不影响同客户的其他项目"
                    >
                      <Icon name="eye" />
                      长期观察
                    </button>
                  )}
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
                  <p>{isRenew ? '暂无续约项目，点击下方按钮新增' : '暂无新签项目，点击下方按钮新增'}</p>
                  <button type="button" className="btn btn-secondary" onClick={onAdd}>
                    <Icon name="plus" />
                    {isRenew ? '新增续约项目' : '新增项目'}
                  </button>
                </div>
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
    title: '新签项目跟进',
    tag: 'NEW',
    desc: '同客户可并行多个新签项目，不受是否已签约影响',
    addLabel: '新增项目',
  },
  renew: {
    title: '续约项目跟进',
    tag: 'RENEW',
    desc: `续约独立成项目，原项目保留历史；${RENEW_WINDOW_DAYS} 天窗口只提醒、不删项目`,
    addLabel: '新增续约项目',
  },
};

export default function ProjectList({
  projects,
  variant,
  onAdd,
  onView,
  onCustomer,
  onWatch,
  wide = false,
}) {
  const viewport = useViewport();
  const today = todayStr();
  const config = VARIANTS[variant] || VARIANTS.new;
  const items = projects.filter((p) => (variant === 'renew' ? p.category === 'renew' : p.category !== 'renew'));
  const sorted = [...items].sort((a, b) =>
    (a.nextFollowUp || '9999-12-31').localeCompare(b.nextFollowUp || '9999-12-31')
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
    deps: [wide],
    fallbackRows: FALLBACK_ROWS,
  });
  const paged = slicePage(sorted);
  const overdue = items.filter((p) => p.nextFollowUp && daysUntil(p.nextFollowUp) < 0).length;
  const dueToday = items.filter((p) => p.nextFollowUp === today).length;

  return (
    <section ref={panelRef} className={`follow-panel follow-${variant === 'renew' ? 'renew' : 'new'}${dense ? ' is-dense' : ''}`}>
      <header className="follow-head">
        <div className="follow-head-top">
          <div className="follow-title">
            <h2>{config.title}</h2>
            <span className="follow-tag">{config.tag}</span>
          </div>
          <span className="follow-count">{items.length} 个项目</span>
        </div>
        <div className="follow-head-ops">
          <ListTools
            dense={dense}
            onDenseChange={setDense}
            perPage={perPage}
            onPerPageChange={setPerPage}
            autoRows={autoRows}
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={onAdd}>
            <Icon name="plus" />
            {config.addLabel}
          </button>
        </div>
        <div className="follow-meta">
          <span className="follow-desc" title={config.desc}>
            {config.desc}
          </span>
          <div className="stat-pills">
            <span className="pill pill-danger">逾期未跟进 {overdue}</span>
            <span className="pill pill-info">今日需跟进 {dueToday}</span>
          </div>
        </div>
      </header>
      <ProjectTable
        items={paged}
        isRenew={variant === 'renew'}
        wide={wide}
        onView={onView}
        onCustomer={onCustomer}
        onAdd={onAdd}
        onWatch={onWatch}
        scrollRef={scrollRef}
        maxHeight={maxHeight}
      />
      <Pagination page={page} total={sorted.length} perPage={pageSize} onChange={setPage} />
    </section>
  );
}
