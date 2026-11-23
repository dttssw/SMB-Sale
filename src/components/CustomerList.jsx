import ListTools from './ListTools.jsx';
import Pagination from './Pagination.jsx';
import Icon from './icons.jsx';
import useFitPaging from '../hooks/useFitPaging.js';
import { useViewport } from '../hooks/useViewportFit.js';

const FALLBACK_ROWS = 8;

export default function CustomerList({ customers, onAdd, onView }) {
  const viewport = useViewport();
  const sorted = [...customers].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
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

  const handleRowClick = (e, row) => {
    if (e.target.closest('button, a, input, select, textarea, label')) return;
    if (window.getSelection()?.toString()) return;
    onView(row);
  };

  return (
    <section className={`panel${dense ? ' is-dense' : ''}`} ref={panelRef}>
      <div className="panel-head">
        <div>
          <h2>客户名单</h2>
          <p className="panel-desc">客户只保存公司与联系人主档；所有新签、续约、长期观察和 Lost 都在项目层，不影响客户本身</p>
        </div>
        <div className="panel-head-ops">
          <ListTools
            dense={dense}
            onDenseChange={setDense}
            perPage={perPage}
            onPerPageChange={setPerPage}
            autoRows={autoRows}
          />
          <button type="button" className="btn btn-primary" onClick={onAdd}>
            <Icon name="plus" />
            新建客户
          </button>
        </div>
      </div>
      <div className="stat-pills">
        <span className="pill pill-info">客户 {sorted.length}</span>
        <span className="pill">进行中项目 {sorted.reduce((sum, c) => sum + (c.activeProjectCount || 0), 0)}</span>
        <span className="pill pill-ok">已签项目 {sorted.reduce((sum, c) => sum + (c.signedProjectCount || 0), 0)}</span>
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
              <th>默认联系人</th>
              <th className="num">进行中项目</th>
              <th className="num">已签项目</th>
              <th className="ops">操作</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((customer) => (
              <tr key={customer.id} className="row-clickable" onClick={(e) => handleRowClick(e, customer)}>
                <td>
                  <button type="button" className="link-name" onClick={() => onView(customer)}>
                    {customer.name}
                  </button>
                </td>
                <td>{customer.contact || '—'}</td>
                <td className="num">{customer.activeProjectCount || 0}</td>
                <td className="num">{customer.signedProjectCount || 0}</td>
                <td className="ops">
                  <span className="row-chevron">
                    <Icon name="chevronRight" />
                  </span>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  <div className="empty-state">
                    <p>暂无客户，可先新建客户，再从客户详情创建项目</p>
                    <button type="button" className="btn btn-secondary" onClick={onAdd}>
                      <Icon name="plus" />
                      新建客户
                    </button>
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
