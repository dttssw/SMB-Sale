import ListTools from './ListTools.jsx';
import Pagination from './Pagination.jsx';
import Icon from './icons.jsx';
import useFitPaging from '../hooks/useFitPaging.js';
import { useViewport } from '../hooks/useViewportFit.js';
import { formatDate, todayStr } from '../utils/date.js';
import { formatMoney } from '../utils/format.js';
import { skusOf } from '../utils/sku.js';

const FALLBACK_ROWS = 8;

const WATCH_DESC = '暂时不需要定时跟进、但需要长期留意的项目；不影响同客户的其他项目，随时可以恢复';
const LOST_DESC = '未赢单项目的归档区；客户与其他项目完全不受影响，可单独恢复';

function StatusProjectList({ projects, variant, onView, onCustomer, onRestore }) {
  const isWatch = variant === 'watch';
  const viewport = useViewport();
  const sorted = [...projects].sort((a, b) => {
    const aDate = isWatch ? a.watchedAt : a.lostAt;
    const bDate = isWatch ? b.watchedAt : b.lostAt;
    return (bDate || '').localeCompare(aDate || '') || a.name.localeCompare(b.name, 'zh');
  });
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
  const monthCount = sorted.filter((p) => ((isWatch ? p.watchedAt : p.lostAt) || '').slice(0, 7) === monthKey).length;

  return (
    <section ref={panelRef} className={`follow-panel ${isWatch ? 'watch-panel' : 'lost-panel lost-new'}${dense ? ' is-dense' : ''}`}>
      <header className="follow-head">
        <div className="follow-head-top">
          <div className="follow-title">
            <h2>{isWatch ? '长期观察' : 'Lost 项目'}</h2>
            <span className="follow-tag">{isWatch ? 'WATCH' : 'LOST'}</span>
          </div>
          <span className="follow-count">{sorted.length} 个项目</span>
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
        <div className="follow-meta">
          <span className="follow-desc" title={isWatch ? WATCH_DESC : LOST_DESC}>
            {isWatch ? WATCH_DESC : LOST_DESC}
          </span>
          <div className="stat-pills">
            <span className={`pill ${isWatch ? 'pill-info' : 'pill-danger'}`}>
              {isWatch ? '观察中' : '已 Lost'} {sorted.length}
            </span>
            <span className="pill">本月 {monthCount} 个</span>
          </div>
        </div>
      </header>
      <div
        className="table-wrap fit-scroll"
        ref={scrollRef}
        style={maxHeight > 0 ? { '--fit-max': `${maxHeight}px` } : undefined}
      >
        <table className="table">
          <thead>
            <tr>
              <th>项目 / 最终客户</th>
              <th>类型</th>
              <th>合作伙伴</th>
              <th className="num">金额</th>
              {isWatch && <th className="num">上次跟进</th>}
              <th className="num">{isWatch ? '转入观察' : '流失时间'}</th>
              <th className="ops">操作</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((project) => {
              const skus = skusOf(project);
              return (
                <tr
                  key={project.id}
                  className="row-clickable"
                  onClick={(e) => {
                    if (e.target.closest('button, a, input, select, textarea, label')) return;
                    onView(project);
                  }}
                >
                  <td>
                    <button type="button" className="link-name" onClick={() => onView(project)}>
                      {project.name}
                    </button>
                    <div className="cell-sub">
                      <button type="button" className="link-btn" onClick={() => onCustomer(project)}>
                        {project.customerName}
                      </button>
                      {skus.length > 0 && <span> · {skus.join(' / ')}</span>}
                    </div>
                  </td>
                  <td>{project.category === 'renew' ? '续约' : '新签'}</td>
                  <td>{project.partnerName || '—'}</td>
                  <td className="num strong">
                    {formatMoney(isWatch ? project.expectedAmount : project.contractAmount || project.expectedAmount)}
                  </td>
                  {isWatch && <td className="num">{formatDate(project.lastFollowUp)}</td>}
                  <td className="num">{formatDate(isWatch ? project.watchedAt : project.lostAt)}</td>
                  <td className="ops">
                    <button type="button" className="link-btn ok" onClick={() => onRestore(project)}>
                      恢复
                    </button>
                    <span className="row-chevron">
                      <Icon name="chevronRight" />
                    </span>
                  </td>
                </tr>
              );
            })}
            {paged.length === 0 && (
              <tr>
                <td colSpan={isWatch ? 7 : 6} className="empty">
                  <div className="empty-state">
                    <p>{isWatch ? '暂无长期观察项目' : '暂无 Lost 项目'}</p>
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

export function WatchList({ projects, ...props }) {
  return <StatusProjectList projects={projects} variant="watch" {...props} />;
}

export function LostProjects({ projects, ...props }) {
  return <StatusProjectList projects={projects} variant="lost" {...props} />;
}

export default StatusProjectList;
