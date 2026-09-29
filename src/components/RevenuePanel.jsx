import { useMemo } from 'react';
import ListTools from './ListTools.jsx';
import Pagination from './Pagination.jsx';
import Icon from './icons.jsx';
import useFitPaging from '../hooks/useFitPaging.js';
import { useViewport } from '../hooks/useViewportFit.js';
import { formatDate, monthOf, parseDate, todayStr } from '../utils/date.js';
import { formatMoney, sumBy } from '../utils/format.js';

const FALLBACK_ROWS = 6; // 首次测量完成前的兜底行数

// 上一个月的 'YYYY-MM'：只用于「较上月」这一行文案
function prevMonthKey(dateStr) {
  const d = parseDate(dateStr);
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

export default function RevenuePanel({ deals, onAdd }) {
  const { totalNew, monthNew, monthCount, newCount, avgNew, prevMonthNew, sorted } = useMemo(() => {
    const newDeals = deals.filter((d) => d.type !== 'renewal');
    const totalNew = sumBy(newDeals, 'amount');
    const today = todayStr();
    const thisMonth = newDeals.filter((d) => monthOf(d.date) === monthOf(today));
    return {
      totalNew,
      monthNew: sumBy(thisMonth, 'amount'),
      monthCount: thisMonth.length,
      newCount: newDeals.length,
      avgNew: newDeals.length ? totalNew / newDeals.length : 0,
      prevMonthNew: sumBy(newDeals.filter((d) => monthOf(d.date) === prevMonthKey(today)), 'amount'),
      sorted: [...newDeals].sort((a, b) => b.date.localeCompare(a.date)),
    };
  }, [deals]);

  // 与「在约客户 / 合作伙伴」同一套逻辑：密度默认舒适、每页默认自动（铺满一屏）、内部滚动 + 分页
  const viewport = useViewport();
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

  const diff = monthNew - prevMonthNew;
  const mom = prevMonthNew > 0 ? `较上月 ${diff >= 0 ? '+' : '-'}${formatMoney(Math.abs(diff))}` : '上月无成交';

  return (
    <section className={`panel${dense ? ' is-dense' : ''}`} ref={panelRef}>
      <div className="panel-head">
        <div>
          <h2>成交金额</h2>
          <p className="panel-desc">回顾即可——New 客户转为在约时自动计入新签金额</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onAdd}>
          <Icon name="plus" />
          记录
        </button>
      </div>

      <div className="revenue-split">
        {/* 左栏：数字概览。本月为主数（28px），累计与平均单笔并列在下 */}
        <div className="revenue-nums">
          <div className="revenue-num hero">
            <div className="revenue-k">本月成交</div>
            <div className="revenue-v">{formatMoney(monthNew)}</div>
            <div className="revenue-sub">
              {monthCount} 笔 · {mom}
            </div>
          </div>
          <div className="revenue-num">
            <div className="revenue-k">累计成交</div>
            <div className="revenue-v">{formatMoney(totalNew)}</div>
            <div className="revenue-sub">共 {newCount} 笔</div>
          </div>
          <div className="revenue-num">
            <div className="revenue-k">平均单笔</div>
            <div className="revenue-v">{formatMoney(Math.round(avgNew))}</div>
            <div className="revenue-sub">累计 / 笔数</div>
          </div>
        </div>

        {/* 右栏：最近成交。按日期倒序，密度 / 每页 / 分页与其他三个列表完全一致 */}
        <div className="revenue-list">
          <div className="revenue-list-head">
            <h3>
              最近成交
              <span className="revenue-count">{newCount} 笔</span>
            </h3>
            <ListTools
              dense={dense}
              onDenseChange={setDense}
              perPage={perPage}
              onPerPageChange={setPerPage}
              autoRows={autoRows}
            />
          </div>
          <div
            className="table-wrap fit-scroll"
            ref={scrollRef}
            style={maxHeight > 0 ? { '--fit-max': `${maxHeight}px` } : undefined}
          >
            <table className="table">
              <thead>
                <tr>
                  <th>客户</th>
                  <th className="num">日期</th>
                  <th className="num">金额</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <span className="cell-main" title={d.customer}>
                        {d.customer}
                      </span>
                    </td>
                    <td className="num">{formatDate(d.date)}</td>
                    <td className="num strong">{formatMoney(d.amount)}</td>
                  </tr>
                ))}
                {paged.length === 0 && (
                  <tr>
                    <td colSpan={3} className="empty">
                      <div className="empty-state">
                        <p>暂无成交记录，New 客户转为在约时自动计入，也可手动记录一笔</p>
                        <button type="button" className="btn btn-secondary" onClick={onAdd}>
                          <Icon name="plus" />
                          记录成交金额
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={sorted.length} perPage={pageSize} onChange={setPage} />
        </div>
      </div>
    </section>
  );
}
