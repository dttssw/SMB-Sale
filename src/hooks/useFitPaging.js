import { useEffect, useState } from 'react';
import useFitScroll from './useViewportFit.js';

/**
 * 列表的「密度 + 每页条数 + 分页」通用逻辑（客户跟进 / 在约客户 / 合作伙伴共用）：
 * - 密度默认「舒适」（dense = false，行距更大更好读），可切到「紧凑」一屏塞进更多行
 * - 每页默认「自动」（AUTO_PER_PAGE）：按当前窗口大小算出这个板块能**完整显示的最多行数**分页
 * - 返回的 slicePage(items) 按当前页切好数据，表格直接渲染即可
 *
 * 窗口越大 → 板块越高 → 一屏条数越多；窗口变小自动收缩，不会出现无谓的整页滚动。
 */

export const AUTO_PER_PAGE = -1; // 自动：按当前窗口大小铺满一屏（最多的完整可见条数）
export const ALL_PER_PAGE = 0; // 全部：不翻页，交给内部滚动

export const PAGE_SIZE_OPTIONS = [
  { value: AUTO_PER_PAGE, label: '自动' },
  { value: 8, label: '8 条' },
  { value: 15, label: '15 条' },
  { value: ALL_PER_PAGE, label: '全部' },
];

/**
 * @param {object} opts
 * @param {number} opts.count 当前列表总条数
 * @param {number} opts.viewportHeight useViewport().height：窗口高度变了就重算
 * @param {Array} opts.deps 其余会影响测量的变化项（如 follow 板块的单/双栏）
 * @param {number} opts.fallbackRows 首次测量完成前的兜底行数
 */
export default function useFitPaging({ count, viewportHeight, deps = [], fallbackRows = 8 }) {
  const [dense, setDense] = useState(false); // 默认舒适布局
  const [perPage, setPerPage] = useState(AUTO_PER_PAGE); // 默认自动：铺满一屏
  const [page, setPage] = useState(1);

  // 窗口高度 / 数据条数 / 密度 / 每页条数 / 额外布局项 变化时重算可用高度与一屏行数
  const { panelRef, scrollRef, maxHeight, rows } = useFitScroll(viewportHeight, [
    count,
    dense,
    perPage,
    ...deps,
  ]);

  // 测量完成前先用兜底值，避免首屏抖动
  const autoRows = rows > 0 ? rows : fallbackRows;
  const pageSize =
    perPage === ALL_PER_PAGE ? Math.max(1, count) : perPage === AUTO_PER_PAGE ? autoRows : perPage;
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const cur = Math.min(page, pages);

  // 数据变少 / 窗口变小导致页数减少时，把页码收敛回有效范围
  useEffect(() => {
    setPage((p) => Math.min(p, pages));
  }, [pages]);

  return {
    panelRef,
    scrollRef,
    maxHeight,
    autoRows, // 「自适应 N 条」里显示的条数
    pageSize, // 当前实际每页条数
    dense,
    setDense,
    perPage,
    setPerPage,
    page: cur,
    setPage,
    slicePage: (items) => items.slice((cur - 1) * pageSize, cur * pageSize),
  };
}
