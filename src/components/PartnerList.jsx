import { useState } from 'react';
import Pagination from './Pagination.jsx';
import useFitScroll, { useViewport } from '../hooks/useViewportFit.js';

const PER_PAGE = 5; // 兜底：自动测量完成前的每页条数

export default function PartnerList({ partners, onAdd, onView }) {
  const [page, setPage] = useState(1);
  // 按窗口高度自适应：卡片高度、每页条数都跟着窗口大小走
  const viewport = useViewport();
  const sorted = [...partners].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  const { panelRef, scrollRef, maxHeight, rows } = useFitScroll(viewport.height, [sorted.length]);
  const perPage = rows > 0 ? rows : PER_PAGE;
  const pages = Math.max(1, Math.ceil(sorted.length / perPage));
  const cur = Math.min(page, pages);
  const paged = sorted.slice((cur - 1) * perPage, cur * perPage);

  return (
    <section className="panel" ref={panelRef}>
      <div className="panel-head">
        <div>
          <h2>🤝 合作伙伴</h2>
          <p className="panel-desc">登记合作伙伴，可随时为其提交备注记录（不占用签约 / 金额跟进）</p>
        </div>
        <button className="btn btn-primary" onClick={onAdd}>
          ＋ 新建合作伙伴
        </button>
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
      <Pagination page={cur} total={sorted.length} perPage={perPage} onChange={setPage} />
    </section>
  );
}
