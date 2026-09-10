import { useState } from 'react';
import Badge from './Badge.jsx';
import Pagination from './Pagination.jsx';
import useFitScroll, { useViewport } from '../hooks/useViewportFit.js';
import { stageOf } from '../data/constants.js';
import { daysUntil, formatDate, todayStr } from '../utils/date.js';
import { formatMoney } from '../utils/format.js';

// 每页条数（-1 = 自动：按窗口大小算出一屏能放几行；0 = 全部平铺）
// 客户跟进是主体工作区，默认「自动」——窗口越大，一屏自动放下越多客户
const AUTO_PER_PAGE = -1;
const PAGE_SIZES = [
  { value: AUTO_PER_PAGE, label: '自动' },
  { value: 8, label: '8 条' },
  { value: 15, label: '15 条' },
  { value: 0, label: '全部' },
];
const FALLBACK_ROWS = 8; // 首次测量完成前的占位行数

function ProspectTable({ items, isRenew, perPage, wide, onView, scrollRef, maxHeight }) {
  const [page, setPage] = useState(1);
  const sorted = [...items].sort((a, b) =>
    (a.nextFollowUp || '9999-12-31').localeCompare(b.nextFollowUp || '9999-12-31')
  );

  const size = perPage > 0 ? perPage : Math.max(1, sorted.length);
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const cur = Math.min(page, pages);
  const paged = sorted.slice((cur - 1) * size, cur * size);
  // 双栏（窄）时省略「上次跟进」，把宽度留给客户与关键日期；单栏全宽时字段更全
  // New：客户 / 阶段 / 预估金额 / [上次跟进] / 下次跟进 / 操作；Renew：客户 / 预估金额 / [上次跟进] / 下次跟进 / 续约到期 / 操作
  const colCount = wide ? 6 : 5;

  return (
    <>
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
            {paged.map((p) => {
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
                        <div className={`cell-sub${expiryDays <= 45 ? ' warn-text' : ''}`}>还剩 {expiryDays} 天</div>
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
            {paged.length === 0 && (
              <tr>
                <td colSpan={colCount} className="empty">
                  {isRenew ? '暂无续约跟进客户，点击右上角新建' : '暂无跟进中的新客户，点击右上角新增'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {perPage > 0 && <Pagination page={cur} total={sorted.length} perPage={size} onChange={setPage} />}
    </>
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
    desc: '临期在约自动带出，也可手动新建；续约完成后自动退出',
    addLabel: '＋ 新建续约',
  },
};

export default function ProspectList({ prospects, variant, onAdd, onView, wide = false }) {
  // dense：紧凑模式（行距更小，一屏看到更多客户）；perPage：自动 / 指定条数 / 0 表示不翻页
  const [dense, setDense] = useState(true);
  const [perPage, setPerPage] = useState(AUTO_PER_PAGE);
  const viewport = useViewport();
  const today = todayStr();
  const v = VARIANTS[variant] || VARIANTS.new;
  const items = prospects.filter((p) => (v.isRenew ? p.category === 'renew' : p.category !== 'renew'));
  // 窗口高度、数据条数、密度、栏位（单/双栏）、每页条数变化时重算可用高度与行数
  const { panelRef, scrollRef, maxHeight, rows } = useFitScroll(viewport.height, [
    items.length,
    dense,
    wide,
    perPage,
  ]);
  const overdue = items.filter((p) => p.nextFollowUp && daysUntil(p.nextFollowUp) < 0).length;
  const dueToday = items.filter((p) => p.nextFollowUp === today).length;
  // 自动分页：按窗口高度测出的一屏行数（测量完成前先用兜底值，避免首屏抖动）
  const autoRows = rows > 0 ? rows : FALLBACK_ROWS;
  const effectivePerPage = perPage === AUTO_PER_PAGE ? autoRows : perPage;

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
          <div className="seg-toggle" role="group" aria-label="显示密度">
            <button
              type="button"
              className={dense ? 'active' : ''}
              title="紧凑：行距更小，一屏看到更多客户"
              onClick={() => setDense(true)}
            >
              紧凑
            </button>
            <button
              type="button"
              className={!dense ? 'active' : ''}
              title="舒适：行距更大，阅读更轻松"
              onClick={() => setDense(false)}
            >
              舒适
            </button>
          </div>
          <label className="follow-pagesize" title="每页显示多少条客户：自动 = 按窗口大小铺满一屏">
            <span>每页</span>
            <select value={perPage} onChange={(e) => setPerPage(Number(e.target.value))}>
              {PAGE_SIZES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            {perPage === AUTO_PER_PAGE && <span className="follow-pagesize-auto">自适应 {autoRows} 条</span>}
          </label>
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
        items={items}
        isRenew={v.isRenew}
        perPage={effectivePerPage}
        wide={wide}
        onView={onView}
        scrollRef={scrollRef}
        maxHeight={maxHeight}
      />
    </section>
  );
}

