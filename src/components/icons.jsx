/**
 * 全站唯一的图标来源：16px 内联 SVG 线性图标（1.5px stroke / currentColor）。
 * 刻意不引入任何图标库 —— 视觉改版不新增依赖，图标全部手写在 24×24 网格上。
 * 用法：<Icon name="target" />，尺寸随字号由 CSS 控制（默认 16px）。
 */
const PATHS = {
  // 导航
  home: (
    <>
      <path d="M4 10.5 12 4l8 6.5V20h-5v-5.5H9V20H4z" />
    </>
  ),
  journal: (
    <>
      <path d="M5 4h10.5L19 7.5V20H5z" />
      <path d="M15 4v4h4" />
      <path d="M8.5 12.5h7M8.5 16h4.5" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  clipboard: (
    <>
      <path d="M9 4.5h6V7H9z" />
      <path d="M15 5.5h3V20H6V5.5h3" />
      <path d="M9 11.5h6M9 15h4" />
    </>
  ),
  coins: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M9 8.5l3 4 3-4" />
      <path d="M9 13h6M9 15.5h6M12 12.5V17" />
    </>
  ),
  users: (
    <>
      <circle cx="9.5" cy="8" r="3" />
      <path d="M3.5 19.5v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" />
      <path d="M16 5.6a3 3 0 0 1 0 5.8" />
      <path d="M18 13.8a5 5 0 0 1 2.5 4.3v1.4" />
    </>
  ),
  folder: (
    <>
      <path d="M3 6.5h5L10 9h11v10.5H3z" />
    </>
  ),
  briefcase: (
    <>
      <path d="M3.5 8h17v11.5h-17z" />
      <path d="M9 8V5.5h6V8" />
      <path d="M3.5 12.5h17" />
    </>
  ),
  bell: (
    <>
      <path d="M12 4.5a5 5 0 0 1 5 5V13l2 3.5H5L7 13V9.5a5 5 0 0 1 5-5z" />
      <path d="M10 19.5a2 2 0 0 0 4 0" />
    </>
  ),
  // 界面
  plus: (
    <>
      <path d="M12 5.5v13M5.5 12h13" />
    </>
  ),
  close: (
    <>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.25" fill="currentColor" stroke="none" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.5 20.5 19.5h-17z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </>
  ),
  check: (
    <>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </>
  ),
  chevronLeft: (
    <>
      <path d="M14.5 6.5 9 12l5.5 5.5" />
    </>
  ),
  chevronRight: (
    <>
      <path d="M9.5 6.5 15 12l-5.5 5.5" />
    </>
  ),
  chevronDown: (
    <>
      <path d="M6.5 9.5 12 15l5.5-5.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M15.5 15.5 20 20" />
    </>
  ),
  // 材料库文件类型（按扩展名归到同一套 16px 线性图标）
  fileDoc: (
    <>
      <path d="M6 3h7.5L18 7.5V21H6z" />
      <path d="M13.5 3v4.5H18" />
      <path d="M9 12.5h6M9 16h4" />
    </>
  ),
  filePdf: (
    <>
      <path d="M6 3h7.5L18 7.5V21H6z" />
      <path d="M13.5 3v4.5H18" />
      <path d="M9.5 17.5v-4h1.75a1.25 1.25 0 0 1 0 2.5H9.5" />
    </>
  ),
  filePpt: (
    <>
      <path d="M6 3h7.5L18 7.5V21H6z" />
      <path d="M13.5 3v4.5H18" />
      <path d="M9 12.5h6v5H9z" />
      <path d="M12 9.5v3" />
    </>
  ),
  fileXls: (
    <>
      <path d="M6 3h7.5L18 7.5V21H6z" />
      <path d="M13.5 3v4.5H18" />
      <path d="M9 12.5h6v5H9zM12 12.5v5M9 15h6" />
    </>
  ),
  fileImg: (
    <>
      <path d="M4 5h16v14H4z" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M4.5 17l4.5-4.5 3.5 3.5 3-3 4 4" />
    </>
  ),
  fileHtml: (
    <>
      <path d="M6 3h7.5L18 7.5V21H6z" />
      <path d="M13.5 3v4.5H18" />
      <path d="M10 12.5 8 15l2 2.5M14 12.5 16 15l-2 2.5" />
    </>
  ),
  fileMd: (
    <>
      <path d="M6 3h7.5L18 7.5V21H6z" />
      <path d="M13.5 3v4.5H18" />
      <path d="M9 17.5v-4l1.5 2 1.5-2v4" />
      <path d="M14.5 13.5V17M14.5 17l1.25-1.5" />
    </>
  ),
  fileZip: (
    <>
      <path d="M6 3h7.5L18 7.5V21H6z" />
      <path d="M13.5 3v4.5H18" />
      <path d="M11 7.5h2M11 10.5h2M11 13.5h2M11 16.5h2" />
    </>
  ),
  fileOther: (
    <>
      <path d="M6 3h7.5L18 7.5V21H6z" />
      <path d="M13.5 3v4.5H18" />
      <path d="M9.5 16.5h5" />
    </>
  ),
};

export default function Icon({ name, size = 16, className }) {
  const path = PATHS[name] || PATHS.fileOther;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  );
}
