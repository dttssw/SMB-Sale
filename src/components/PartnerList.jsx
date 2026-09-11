import ListTools from './ListTools.jsx';
import Pagination from './Pagination.jsx';
import useFitPaging from '../hooks/useFitPaging.js';
import { useViewport } from '../hooks/useViewportFit.js';

const FALLBACK_ROWS = 8; // 首次测量完成前的兜底行数

export default function PartnerList({ partners, onAdd, onView }) {
  const viewport = useViewport();
  const sorted = [...partners].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  // 与客户跟进 / 在约客户同一套逻辑：默认「舒适」布局；每页「自动」= 按当前窗口能完整显示的最多行数
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

  return (
    <section className={`panel${dense ? ' is-dense' : ''}`} ref={panelRef}>
      <div className="panel-head">
        <div>
          <h2>🤝 合作伙伴</h2>
          <p className="panel-desc">登记合作伙伴，可随时为其提交备注记录（不占用签约 / 金额跟进）</p>
        </div>
        <div className="panel-head-ops">
          <ListTools
            dense={dense}
            onDenseChange={setDense}
            perPage={perPage}
            onPerPageChange={setPerPage}
            autoRows={autoRows}
          />
          <button className="btn btn-primary" onClick={onAdd}>
            ＋ 新建合作伙伴
          </button>
        </div>
      </div>
      <div
        className="table-wrap fit-scroll"
        ref={scrollRef}
        style={maxHeight > 0 ? { '--fit-max': `${maxHeight}px` } : undefined}
      >
        <table className="table">
          <thead>
            <tr>
              <th>合作伙伴名称</th>
              <th>联系人</th>
              <th className="ops">操作</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((p) => (
              <tr key={p.id}>
                <td>
                  <a className="link-name" onClick={() => onView(p)} title="查看合作伙伴详情">
                    {p.name}
                  </a>
                </td>
                <td>{p.contact || '—'}</td>
                <td className="ops">
                  <button className="link-btn" onClick={() => onView(p)}>
                    详情
                  </button>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={3} className="empty">
                  暂无合作伙伴，点击右上角新建
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
