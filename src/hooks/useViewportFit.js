import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * 尺寸自适应：自动检测窗口的宽与高，据此决定各板块能占多大、一屏能放多少行客户。
 * - useViewport()：窗口尺寸（跟随窗口缩放、以及手机地址栏伸缩的 visualViewport）
 * - useFitScroll()：给列表卡片算出内部滚动区高度（maxHeight）与一屏可显示行数（rows）
 *
 * 设计要点：高度 = 视口高度 − 卡片顶部在文档中的位置 − 卡片内外其余占位（分页条、页脚、内边距），
 * 因此窗口越大，卡片越高、一屏看到的客户越多；窗口变小时自动收缩，不会出现无谓的整页滚动。
 */

const MIN_SCROLL_H = 200; // 窗口再小，列表也保留的最小高度；不够时由整页滚动兜底
const MIN_ROWS = 3; // 自动行数下限
const ROW_SLACK = 1; // 行数按「略小于可用高度」计算，避免刚好撑出滚动条后行高变化导致来回抖动
const BOTTOM_GAP = 10; // 卡片底部与内容区底部之间留一点呼吸空间

function readViewport() {
  if (typeof window === 'undefined') return { width: 1440, height: 900 };
  const vv = window.visualViewport;
  return {
    width: Math.round(window.innerWidth),
    height: Math.round((vv && vv.height) || window.innerHeight),
  };
}

/** 监听窗口宽高（rAF 节流，避免拖拽缩放时频繁重渲染） */
export function useViewport() {
  const [size, setSize] = useState(readViewport);

  useEffect(() => {
    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = readViewport();
        setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
      });
    };
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
    };
  }, []);

  return size;
}

/**
 * 按窗口高度自适应列表卡片的滚动区高度与行数。
 * @param {number} viewportHeight useViewport().height：作为「窗口高度变了要重算」的依赖（测量时直接读 window.innerHeight）
 * @param {Array} deps 会影响测量的变化项（数据条数、密度、布局、每页条数等，长度需固定）
 * @returns {{ panelRef, scrollRef, maxHeight, rows }} 把两个 ref 分别挂到卡片与内部滚动容器上
 */
export default function useFitScroll(viewportHeight, deps = []) {
  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const [fit, setFit] = useState({ height: 0, rows: 0 });

  // 只在「窗口高度 / 影响布局的入参」变化后重算：不能每次渲染都测量并 setState（会触发 React 无限更新）。
  // 卡片/滚动容器尺寸变化（字体加载、内容换行等）由 ResizeObserver 兜底。
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const scroll = scrollRef.current;
    if (!panel || !scroll) return undefined;

    const measure = () => {
      const panelRect = panel.getBoundingClientRect();
      const scrollRect = scroll.getBoundingClientRect();
      const content = document.querySelector('.app-content');
      const footer = document.querySelector('.footer');
      const padBottom = content ? parseFloat(getComputedStyle(content).paddingBottom) || 0 : 0;
      const footerH = footer ? footer.getBoundingClientRect().height : 0;
      // 卡片顶部在文档中的位置：与页面滚动位置无关，避免滚动时高度来回抖动
      const panelTop = panelRect.top + window.scrollY;
      const insideTop = Math.max(0, scrollRect.top - panelRect.top);
      const insideBottom = Math.max(0, panelRect.bottom - scrollRect.bottom);
      const usableBottom = window.innerHeight - footerH - padBottom - BOTTOM_GAP;
      const height = Math.max(MIN_SCROLL_H, Math.round(usableBottom - panelTop - insideTop - insideBottom));

      // 行数按实际渲染出来的表头 / 数据行测量：紧凑、舒适、字体大小、列宽变化都能自动跟上
      const head = scroll.querySelector('thead');
      const headH = head ? head.getBoundingClientRect().height : 0;
      let rowH = 0;
      scroll.querySelectorAll('tbody tr').forEach((tr) => {
        rowH = Math.max(rowH, tr.getBoundingClientRect().height);
      });
      const rows = rowH > 0 ? Math.max(MIN_ROWS, Math.floor((height - headH - ROW_SLACK) / rowH)) : 0;

      setFit((prev) => (prev.height === height && prev.rows === rows ? prev : { height, rows }));
    };

    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(panel);
    ro?.observe(scroll);
    return () => ro?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportHeight, ...deps]);

  return { panelRef, scrollRef, maxHeight: fit.height, rows: fit.rows };
}
