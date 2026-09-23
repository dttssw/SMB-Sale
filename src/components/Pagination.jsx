import Icon from './icons.jsx';

export default function Pagination({ page, total, perPage = 5, onChange }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const cur = Math.min(page, pages);
  if (pages <= 1) return null;
  return (
    <div className="pagination">
      <button type="button" className="btn btn-ghost" disabled={cur <= 1} onClick={() => onChange(cur - 1)}>
        <Icon name="chevronLeft" />
        上一页
      </button>
      <span className="pagination-info">
        第 {cur} / {pages} 页 · 共 {total} 条
      </span>
      <button type="button" className="btn btn-ghost" disabled={cur >= pages} onClick={() => onChange(cur + 1)}>
        下一页
        <Icon name="chevronRight" />
      </button>
    </div>
  );
}