import { AUTO_PER_PAGE, PAGE_SIZE_OPTIONS } from '../hooks/useFitPaging.js';

/**
 * 列表工具栏：显示密度（紧凑 / 舒适，默认舒适）+ 每页条数（默认「自动」）。
 * 「自动」= 按当前窗口大小铺满一屏，即这个板块能完整显示的最多行数，
 * 选择器旁实时显示「自适应 N 条」，窗口缩放时会跟着变。
 */
export default function ListTools({ dense, onDenseChange, perPage, onPerPageChange, autoRows }) {
  return (
    <div className="list-tools">
      <div className="seg-toggle" role="group" aria-label="显示密度">
        <button
          type="button"
          className={dense ? 'active' : ''}
          title="紧凑：行距更小，一屏看到更多条"
          onClick={() => onDenseChange(true)}
        >
          紧凑
        </button>
        <button
          type="button"
          className={!dense ? 'active' : ''}
          title="舒适：行距更大，阅读更轻松（默认）"
          onClick={() => onDenseChange(false)}
        >
          舒适
        </button>
      </div>
      <label
        className="list-pagesize"
        title="每页显示多少条：自动 = 按当前窗口大小铺满一屏，显示最多可完整看到的条数"
      >
        <span>每页</span>
        <select value={perPage} onChange={(e) => onPerPageChange(Number(e.target.value))}>
          {PAGE_SIZE_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {perPage === AUTO_PER_PAGE && <span className="list-pagesize-auto">自适应 {autoRows} 条</span>}
      </label>
    </div>
  );
}
