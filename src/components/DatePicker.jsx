import { todayStr } from '../utils/date.js';
import Icon from './icons.jsx';

function pad(n) {
  return String(n).padStart(2, '0');
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * 自定义日期选择器：年 / 月 / 日 三个下拉框，可直接选择年份（无需一个月一个月翻到其他年份），
 * 替代浏览器原生 date 控件。value / onChange 使用 'YYYY-MM-DD' 字符串格式。
 * 更改年月时会自动收敛非法日期（如 1月31日 改到 2月 → 自动变为 2月最后一天）。
 */
export default function DatePicker({ value, onChange, clearable = true, yearFrom, yearTo }) {
  const today = todayStr();
  const [curY, curM, curD] = today.split('-').map(Number);
  const nowYear = new Date().getFullYear();
  const from = yearFrom ?? nowYear - 15;
  const to = yearTo ?? nowYear + 10;

  const [y, m, d] = value ? value.split('-').map(Number) : [0, 0, 0];

  // 年份范围动态包含当前值所在年份，避免已有日期（如历史合同）不在下拉范围内
  const years = [];
  const yStart = Math.min(from, y || from);
  const yEnd = Math.max(to, y || to);
  for (let i = yStart; i <= yEnd; i++) years.push(i);

  const year = y || curY;
  const month = m || curM;
  const day = d || curD;
  const days = Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1);

  const build = (ny, nm, nd) => {
    const max = daysInMonth(ny, nm);
    return `${ny}-${pad(nm)}-${pad(Math.min(nd, max))}`;
  };

  const onYear = (e) => onChange(build(Number(e.target.value), month, day));
  const onMonth = (e) => onChange(build(year, Number(e.target.value), day));
  const onDay = (e) => onChange(build(year, month, Number(e.target.value)));

  return (
    <div className="datepicker">
      <select value={y || ''} onChange={onYear} aria-label="年份">
        <option value="" disabled>
          年
        </option>
        {years.map((yy) => (
          <option key={yy} value={yy}>
            {yy} 年
          </option>
        ))}
      </select>
      <select value={m || ''} onChange={onMonth} aria-label="月份">
        <option value="" disabled>
          月
        </option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((mm) => (
          <option key={mm} value={mm}>
            {mm} 月
          </option>
        ))}
      </select>
      <select value={d || ''} onChange={onDay} aria-label="日期">
        <option value="" disabled>
          日
        </option>
        {days.map((dd) => (
          <option key={dd} value={dd}>
            {dd} 日
          </option>
        ))}
      </select>
      {clearable && value && (
        <button type="button" className="datepicker-clear" onClick={() => onChange('')} aria-label="清空日期">
          <Icon name="close" size={12} />
        </button>
      )}
    </div>
  );
}
