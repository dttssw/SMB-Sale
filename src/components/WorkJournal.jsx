import { useState } from 'react';
import { formatCnDate, formatNoteTime, todayStr } from '../utils/date.js';

// 按天分组标题：今天 / 昨天 / 具体日期（含星期）
function dayLabel(date) {
  const today = todayStr();
  if (date === today) return '今天';
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (date === y) return '昨天';
  return formatCnDate(date);
}

export default function WorkJournal({ entries, onAdd, onRemove }) {
  const [text, setText] = useState('');
  const today = todayStr();
  const todayCount = entries.filter((w) => w.date === today).length;

  const add = (e) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    onAdd(content);
    setText('');
  };

  // 按归属日期倒序分组；组内按创建时间倒序（后端已按 createdAt DESC 返回）
  const dayOrder = [...new Set(entries.map((w) => w.date))].sort((a, b) => b.localeCompare(a));
  const groups = dayOrder.map((date) => ({
    date,
    items: entries.filter((w) => w.date === date).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  }));

  return (
    <section className="panel panel-journal">
      <div className="panel-head">
        <div>
          <h2>📝 今日工作记录</h2>
          <p className="panel-desc">记录你每天做了什么——谈了哪几家客户、推进了哪些事，回头好复盘</p>
        </div>
        {todayCount > 0 && <span className="pill pill-ok">今天已记 {todayCount} 条</span>}
      </div>

      <form className="work-add" onSubmit={add}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="今天做了什么？例如：下午跟「某公司」把方案演示走完，约好下周商务谈判…"
        />
        <div className="work-add-foot">
          <span className="note-form-hint">{today} · 按系统时间归档</span>
          <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
            ＋ 记一笔
          </button>
        </div>
      </form>

      {groups.length === 0 ? (
        <div className="empty-block">还没有任何工作记录，写下一笔开始吧 ✍️</div>
      ) : (
        <div className="work-list">
          {groups.map((g) => (
            <div key={g.date} className="work-day">
              <div className="work-day-head">{dayLabel(g.date)}</div>
              {g.items.map((w) => (
                <div key={w.id} className="work-item">
                  <div className="work-item-meta">
                    <span className="work-item-time">{formatNoteTime(w.createdAt).slice(11, 16)}</span>
                    <button className="link-btn danger" onClick={() => onRemove(w.id)}>
                      删除
                    </button>
                  </div>
                  <div className="work-item-content">{w.content}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
