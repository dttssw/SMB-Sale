import { useState } from 'react';
import Pagination from './Pagination.jsx';

const PER_PAGE = 5;

export default function PartnerList({ partners, onAdd, onView }) {
  const [page, setPage] = useState(1);
  const sorted = [...partners].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  const pages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const cur = Math.min(page, pages);
  const paged = sorted.slice((cur - 1) * PER_PAGE, cur * PER_PAGE);

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>🤝 合作伙伴</h2>
          <p className="panel-desc">登记合作伙伴，可随时为其提交备注记录（不占用签约 / 金额跟进）</p>
        </div>
        <button className="btn btn-primary" onClick={onAdd}>
          ＋ 新建合作伙伴
        </button>
      </div>
      <div className="table-wrap">
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
      <Pagination page={cur} total={sorted.length} perPage={PER_PAGE} onChange={setPage} />
    </section>
  );
}
